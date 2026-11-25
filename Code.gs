/**
 * MM weekly board - Google Apps Script backend.
 *
 * Deliberately generic: it only stores/reads rows in this spreadsheet and
 * forwards prompts to Gemini. All app logic lives in index.html, so new
 * features normally need no change here.
 *
 * Setup: paste into Extensions > Apps Script of the spreadsheet, run setup()
 * once, add the GEMINI_API_KEY script property, deploy as a Web app
 * (Execute as: Me, Who has access: Anyone). See README.md.
 */

var CONFIG_SHEETS = ['settings', 'teams', 'events'];   // read-only for the site
var RESERVED = ['settings'];                           // never writable from the site

var DEFAULTS = {
  tasks: [['id', 'week', 'team', 'title', 'done', 'source', 'addedOn', 'doneOn', 'carried', 'carriedFrom', 'createdAt']],
  logs: [['id', 'week', 'date', 'kind', 'team', 'text', 'createdAt']],
  summaries: [['id', 'week', 'json', 'generatedAt']],
  teams: [
    ['id', 'name', 'aliases'],
    ['mech', 'מכניקה ושרטוט', 'מכניקה, שרטוט, מכני'],
    ['elec', 'אלקטרוניקה', 'אלקטרוניקה, חשמל'],
    ['soft', 'תוכנה', 'תוכנה, תכנות, קוד, בקרה'],
    ['log', 'לוגיסטיקה ורכש', 'לוגיסטיקה, רכש'],
    ['mkt', 'שיווק ומיתוג', 'שיווק, מיתוג, מדיה'],
    ['comm', 'קהילה ויח"צ', 'קהילה, יח"צ, יחצ'],
    ['pmo', 'PMO וקפטן', 'pmo, קפטן, הנהלה']
  ],
  events: [
    ['date', 'title'],
    ['2026-09-14', 'Kickoff'],
    ['2026-09-15', 'הכשרת מנטורים FLL'],
    ['2026-09-17', 'ערב חשיפה למועמדים חדשים'],
    ['2026-09-22', 'יום ראיונות למועמדים'],
    ['2026-09-28', 'הכשרה לקבוצות FTC חדשות (28–29.9)'],
    ['2026-10-11', 'תחילת חודש ניסיון לחברי צוות חדשים'],
    ['2026-11-05', 'סוף חודש ניסיון'],
    ['2026-11-12', 'ערב הורים']
  ],
  settings: [
    ['key', 'value', 'note'],
    ['season_start', '2026-09-13', 'יום ראשון של Week 1 (YYYY-MM-DD)'],
    ['team_code', '', 'קוד עריכה לקבוצה. ריק = כל מי שיש לו את הקישור יכול לערוך'],
    ['gemini_model', 'gemini-2.5-flash', 'שם המודל של Gemini']
  ]
};

/** Run once from the editor: creates the tabs with headers and defaults. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(DEFAULTS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      var data = DEFAULTS[name];
      sh.getRange(1, 1, sh.getMaxRows(), Math.max(data[0].length, 12)).setNumberFormat('@');
      sh.getRange(1, 1, data.length, data[0].length).setValues(data);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
    }
  });
  var first = ss.getSheets()[0];
  if (first.getName() !== 'tasks' && first.getLastRow() === 0 && !DEFAULTS[first.getName()]) ss.deleteSheet(first);
}

/* ---------------- HTTP entry points ---------------- */

function doGet() {
  return json_({ ok: true, app: 'MM weekly board' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad_request' }); }
  try {
    switch (req.action) {
      case 'config': return json_(config_());
      case 'checkCode': requireCode_(req); return json_({ ok: true });
      case 'query': return json_({ rows: query_(req.sheet, req.where || {}) });
      case 'batch': requireCode_(req); return json_(batch_(req.ops || []));
      case 'ai': requireCode_(req); return json_({ result: gemini_(String(req.prompt || '')) });
      default: return json_({ error: 'unknown_action' });
    }
  } catch (err) {
    var code = err && err.code ? err.code : 'server_error';
    return json_({ error: code, message: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(code, message) { var e = new Error(message || code); e.code = code; throw e; }

/* ---------------- config & access ---------------- */

function settings_() {
  var out = {};
  readRows_('settings').forEach(function (r) { if (r.key) out[String(r.key)] = r.value == null ? '' : String(r.value); });
  return out;
}

function config_() {
  var s = settings_();
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  delete s.team_code;
  return {
    settings: s,
    teams: readRows_('teams'),
    events: readRows_('events'),
    ai: !!key,
    needsCode: !!settings_().team_code
  };
}

function requireCode_(req) {
  var code = settings_().team_code;
  if (code && String(req.code || '') !== String(code)) fail_('bad_code', 'Wrong team code');
}

/* ---------------- generic table access ---------------- */

function sheetFor_(name, create) {
  if (!/^[a-z][a-z0-9_]{0,30}$/.test(String(name))) fail_('bad_sheet', 'Bad sheet name');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && create) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), 12).setNumberFormat('@');
    sh.getRange(1, 1).setValue('id');
    sh.setFrozenRows(1);
  }
  if (!sh) fail_('no_sheet', 'Sheet not found: ' + name);
  return sh;
}

function headers_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (v === 'TRUE' || v === 'true') return true;
  if (v === 'FALSE' || v === 'false') return false;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16) return Number(v);
  return v;
}

function readRows_(name) {
  var sh = sheetFor_(name, false);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var h = values.shift().map(String);
  var out = [];
  values.forEach(function (r) {
    if (!r.some(function (c) { return c !== '' && c !== null; })) return;
    var o = {};
    h.forEach(function (k, j) { if (k) o[k] = cell_(r[j]); });
    out.push(o);
  });
  return out;
}

function query_(name, where) {
  var sh;
  try { sh = sheetFor_(name, false); } catch (e) { if (e.code === 'no_sheet') return []; throw e; }
  var rows = readRows_(name);
  var keys = Object.keys(where);
  return rows.filter(function (r) {
    return keys.every(function (k) { return String(r[k]) === String(where[k]); });
  });
}

function toCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** ops: [{op:'insert', sheet, row}, {op:'update', sheet, id, fields}, {op:'delete', sheet, id}, {op:'upsert', sheet, row}] */
function batch_(ops) {
  if (!Array.isArray(ops) || ops.length > 200) fail_('bad_request', 'Too many ops');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var results = [];
    ops.forEach(function (op) {
      if (RESERVED.indexOf(op.sheet) >= 0 || CONFIG_SHEETS.indexOf(op.sheet) >= 0) fail_('forbidden', 'Read-only sheet');
      var sh = sheetFor_(op.sheet, true);
      var h = headers_(sh);
      var ensure = function (obj) {
        Object.keys(obj).forEach(function (k) {
          if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) fail_('bad_field', 'Bad field ' + k);
          if (h.indexOf(k) < 0) { h.push(k); sh.getRange(1, h.length).setValue(k).setFontWeight('bold'); }
        });
      };
      var findRow = function (id) {
        var col = h.indexOf('id');
        if (col < 0 || sh.getLastRow() < 2) return -1;
        var ids = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
        return -1;
      };
      if (op.op === 'insert' || op.op === 'upsert') {
        var row = op.row || {};
        if (!row.id) row.id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        ensure(row);
        var at = op.op === 'upsert' ? findRow(row.id) : -1;
        if (at > 0) {
          var cur = sh.getRange(at, 1, 1, h.length).getValues()[0];
          h.forEach(function (k, j) { if (k in row) cur[j] = toCell_(row[k]); });
          sh.getRange(at, 1, 1, h.length).setValues([cur]);
        } else {
          sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setNumberFormat('@')
            .setValues([h.map(function (k) { return toCell_(row[k]); })]);
        }
        results.push({ id: row.id });
      } else if (op.op === 'update') {
        var r = findRow(op.id);
        if (r < 0) { results.push({ id: op.id, missing: true }); return; }
        var fields = op.fields || {};
        delete fields.id;
        ensure(fields);
        var vals = sh.getRange(r, 1, 1, h.length).getValues()[0];
        h.forEach(function (k, j) { if (k in fields) vals[j] = toCell_(fields[k]); });
        sh.getRange(r, 1, 1, h.length).setNumberFormat('@').setValues([vals]);
        results.push({ id: op.id });
      } else if (op.op === 'delete') {
        var d = findRow(op.id);
        if (d > 0) sh.deleteRow(d);
        results.push({ id: op.id });
      } else {
        fail_('bad_request', 'Unknown op ' + op.op);
      }
    });
    return { results: results };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Gemini ---------------- */

function gemini_(prompt) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) fail_('ai_disabled', 'GEMINI_API_KEY is not set');
  if (!prompt || prompt.length > 200000) fail_('bad_request', 'Prompt empty or too long');
  var model = settings_().gemini_model || 'gemini-2.5-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    })
  });
  var status = res.getResponseCode();
  if (status === 429) fail_('ai_rate_limited', 'Gemini rate limit');
  if (status !== 200) fail_('ai_failed', 'Gemini HTTP ' + status + ': ' + res.getContentText().slice(0, 300));
  var body = JSON.parse(res.getContentText());
  var parts = (body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) || [];
  var text = parts.map(function (p) { return p.text || ''; }).join('');
  return parseJsonLoose_(text);
}

function parseJsonLoose_(text) {
  try { return JSON.parse(text); } catch (e) {}
  var m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  fail_('ai_bad_json', 'Gemini did not return JSON');
}
