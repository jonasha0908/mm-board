# MM לוח שבועי: מדריך למפתחים

המדריך הזה מסביר איך האתר בנוי, איפה כל דבר נמצא בקוד, ואיך מעלים שינוי. כדאי לקרוא אותו פעם אחת מההתחלה עד הסוף לפני שנוגעים בקוד. אחר כך הוא משמש כמפה.

**איך מתחילים ללמוד את הקוד:** פותחים את `app.js`, מוצאים בטבלה "מפת `app.js`" את הסעיף שקשור למה שרוצים לשנות, וקוראים אותו. שינוי קטן ראשון טוב, למשל: לשנות טקסט של כפתור, צבע ב־`app.css`, או להוסיף צוות בלשונית `teams` בגיליון.

**נוהל עבודה שמומלץ:** שומרים עותק של הקובץ לפני שמשנים. משנים דבר אחד בכל פעם. פותחים את `index.html` מקומית בדפדפן כדי לראות שהדף עולה ושאין שגיאות ב־F12 ← Console, ורק אז מעלים ל־GitHub.

> **אם משתמשים ב־AI לעזרה:** מצרפים לו את הקובץ הזה יחד עם הקבצים הרלוונטיים, ומבקשים שישמור על "כללים חשובים".

## מה זה

אתר לניהול המשימות של קבוצת הרובוטיקה FTC **MM** (מרכז חוסידמן, אוניברסיטת בן־גוריון).
- **שבועות:** האתר מחולק לשבועות (Week 1, Week 2…). Week 1 מתחיל ביום ראשון 13.9.2026, שבוע עבודה הוא ראשון עד חמישי.
- **משימות:** לכל צוות יש משימות שמסמנים ✓ כשהן בוצעו. משימה יכולה להיות גם **בתהליך**, עם עדכוני התקדמות.
- **סיכום יומי:** מדביקים או כותבים סיכום, Gemini מפרק אותו להצעות (בוצע / בתהליך / משימה חדשה / עדכון משימה קיימת), והמשתמש מאשר לפני שמירה.
  - כל הצעה אפשר לקשר ידנית או אוטומטית למשימה קיימת, גם משבוע קודם. במקרה כזה המשימה מועברת לשבוע הנוכחי עם ההיסטוריה שלה.
  - אפשר לשנות לה את השם, והשם הקודם נשמר בהיסטוריה.
  - אפשר גם לשמור רק את הסיכום, בלי לגעת במשימות.
- **אחראים:** לכל משימה אפשר לרשום אחראים, ויש מסנן "המשימות שלי".
- **סיכום שבוע:** מוצג כשקפים בעיצוב של הקבוצה. Gemini כותב את הטקסטים, ואפשר לערוך אותם ידנית.
- **עוד:** תמונות (נשמרות ב־Google Drive), רישום מי עשה כל פעולה (שם שנשמר בכל מכשיר), התקנה כאפליקציה בטלפון.

כתובת האתר: `https://jonasha0908.github.io/mm-board/`

## איך זה בנוי

```
דפדפן (index.html + app.js + app.css, מתארח ב-GitHub Pages)
        │  fetch POST (JSON כטקסט)
        ▼
Google Apps Script Web app (Code.gs)  ──►  Gemini API (מפתח שמור בצד של גוגל)
        │
        ▼
Google Sheet (לשוניות: tasks, logs, summaries, teams, events, settings)
        +  Google Drive (תיקיית תמונות)
```

**העיקרון החשוב:** `Code.gs` **כללי ו"טיפש"**. הוא רק קורא וכותב שורות בגיליון, מעלה תמונות ל־Drive ומעביר טקסט ל־Gemini. **כל ההיגיון של האפליקציה נמצא ב־`app.js`**: מה נשמר, ה־prompts ל־Gemini, החישובים והתצוגה. לכן כמעט כל שינוי או פיצ'ר הוא שינוי ב־`app.js`, `app.css` או `index.html` בלבד.

## הקבצים

| קובץ | מה יש בו | מתי משנים |
|---|---|---|
| `index.html` | שלד הדף: כותרת, טאבים, אזורים ריקים ש־`app.js` ממלא | כשמוסיפים אזור או כפתור קבוע לדף |
| `app.css` | כל העיצוב (צבעים, פריסה, מובייל, שקפים) | שינויי עיצוב |
| `app.js` | כל ההיגיון | רוב השינויים |
| `Code.gs` | צד השרת (Apps Script). **לא נמצא בשימוש מ־GitHub**: הוא מודבק ידנית בעורך של Apps Script | נדיר. ראו "שינוי ב־Code.gs" |
| `sw.js` | Service worker להתקנה כאפליקציה (network-first) | כשמוסיפים קובץ חדש לאתר: להוסיף ל־`SHELL` ולהעלות את מספר הגרסה ב־`CACHE` |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | אייקונים והגדרות אפליקציה | כמעט אף פעם |
| `logo.webp`, `ometz.webp`, `hoss.webp` | הלוגו של MM ולוגואים של השותפים (בשקפים) | אם הלוגו משתנה |
| `README.md` | מדריך הקמה מאפס | אם תהליך ההקמה משתנה |

## מפת `app.js`

הקובץ מחולק לסעיפים עם כותרות `/* ---------- שם ---------- */`:

| סעיף | תוכן |
|---|---|
| ראש הקובץ | `API_URL` (כתובת ה־Web app), רשימת צוותי ברירת מחדל, `stageFor()` (שלבי העונה וה־KPI) |
| dates | חישובי שבועות: `weekOf(date)`, `weekStart(w)`, `weekEnd(w)`, `curWeek()` |
| helpers | `el()` ליצירת אלמנטים (תמיד דרך `textContent`, אף פעם לא `innerHTML` עם נתונים), `toast()`, `lsGet`/`lsSet` |
| api | `api(action, payload)`, `batch(ops)`, `ai(prompt)` |
| normalizers | `normTask`, `normLog`, `parseImgs`, `parseUpdates`: הופכים שורה מהגיליון לאובייקט נקי |
| state | האובייקט `S`, כל מצב האפליקציה (שבוע נבחר, משימות, עריכות פתוחות, שם המשתמש `S.me`) |
| header & rail | כותרת, לחצני השבועות, שורת קוד הקבוצה ושורת השם |
| images | העלאת תמונות (`shrink` מקטין ל־1600px JPEG, `uploadImg`), תצוגה מקדימה, lightbox |
| tasks view | רשימת המשימות לפי צוות, כולל עריכה (✏️), עדכון התקדמות (🔄), תמונות (📷) ומחיקה |
| logs view | הסיכומים היומיים, כולל עריכה ומחיקה |
| loading | `loadWeek()` טוען את השבוע הנבחר. יש **רענון אוטומטי כל 20 שניות**, שמדולג בזמן עריכה |
| writes | `guard()` (בודק קוד קבוצה ושם לפני כתיבה), הוספה, סימון ומחיקה של משימה |
| daily summary panel | הטופס של "+ סיכום יומי": `renderProposal()` (רשימת ההצעות, כולל קישור ואחראים), `linkCands()`/`linkItem()` (קישור למשימות קיימות), `parsePrompt()` (ה־prompt ל־Gemini), `heuristicParse()` (גיבוי בלי AI), `applyProposal()` (שמירה, כולל העברה משבוע קודם ושינוי שם), `saveSummaryOnly()` |
| weekly summary (slides) | `renderDeck()` בונה את השקפים, `generateSummary()` (prompt לסיכום השבוע), עריכה ידנית, העתקה לוואטסאפ, העברת משימות פתוחות |
| tabs, wiring, boot | טאבים, חיבור כפתורים, טעינה ראשונית (`config`) |
| install as app | כפתור התקנה, הודעה לאייפון, רישום service worker |

## הנתונים בגיליון

כל לשונית היא טבלה. השורה הראשונה היא כותרות העמודות. **עמודות חדשות נוצרות לבד**: אם `app.js` כותב שדה שלא קיים, `Code.gs` מוסיף עמודה. מערכים ואובייקטים נשמרים כ־JSON בתא.

**`tasks`** (משימה):
`id`, `week`, `team` (id של צוות), `title`, `done` (TRUE/FALSE), `source` (`opening` / `daily` / `manual` / `carried`), `addedOn`, `doneOn` (YYYY-MM-DD), `carried`, `carriedFrom`, `createdAt` (ms), `note`, `images` (JSON של מזהי Drive), `updates` (JSON: `[{d:"2026-11-25", t:"נבנה הציר, חסרה הרכבה", by:"יונתן"}]`. רשומה עם `k:"rename"` שומרת שם קודם של המשימה, ולא נחשבת עדכון התקדמות), `owners` (JSON של שמות האחראים), `createdBy`, `doneBy`, `editedBy`

**`logs`** (סיכום יומי):
`id`, `week`, `date`, `kind` (`open` / `close`), `team` (ריק = כמה צוותים), `text`, `createdAt`, `images`, `createdBy`, `editedBy`

**`summaries`** (סיכום שבוע, שורה אחת לכל שבוע):
`id` (`w11`), `week`, `json` (`{headline, overview, teams:[{teamId, summary, nextWeek:[]}], focusNextWeek:[]}`), `generatedAt`, `editedAt`, `generatedBy`, `editedBy`

**`teams`**, **`events`**, **`settings`**: הגדרות **שהאתר רק קורא**. עורכים אותן ידנית בגיליון:
- `teams`: `id`, `name`, `aliases` (מילים לזיהוי הצוות בטקסט, מופרדות בפסיק)
- `events`: `date`, `title` (מופיעים ליד השבוע המתאים)
- `settings`: `season_start`, `team_code` (קוד עריכה, ריק = פתוח לכולם), `gemini_model` (אפשר כמה מודלים מופרדים בפסיק. אם הראשון עמוס, עוברים לבא בתור)

## ה־API של Code.gs

כל קריאה היא `POST` עם גוף JSON שנשלח כ־`text/plain` (כדי למנוע בדיקת CORS מקדימה). התשובה היא JSON. בשגיאה חוזר `{error, message}`.

| action | פרמטרים | מחזיר | דורש קוד קבוצה |
|---|---|---|---|
| `config` | | `settings`, `teams`, `events`, `ai` (האם יש מפתח), `needsCode` | לא |
| `checkCode` | `code` | `{ok:true}` או `bad_code` | כן |
| `query` | `sheet`, `where:{field:value}` | `{rows:[...]}` | לא |
| `batch` | `ops:[...]` (עד 200) | `{results}` | כן |
| `ai` | `prompt` | `{result: <JSON ש־Gemini החזיר>}` | כן |
| `upload` | `name`, `mime` (image/*), `data` (base64) | `{id}` (מזהה קובץ ב־Drive) | כן |

הפעולות ב־`batch`:
- `{op:"insert", sheet, row}`
- `{op:"update", sheet, id, fields}`
- `{op:"upsert", sheet, row}` (לפי `row.id`)
- `{op:"delete", sheet, id}`

אי אפשר לכתוב ל־`teams`, `events` ו־`settings` מהאתר.

שגיאות נפוצות: `bad_code`, `ai_disabled` (אין מפתח), `ai_rate_limited` (Gemini עמוס), `ai_failed`, `bad_file`, `unknown_action` (הקוד בצד של גוגל ישן).

כתובת תמונה לתצוגה: `https://drive.google.com/thumbnail?id=<ID>&sz=w1600`

## כללים חשובים

1. **אל תשנו או תמחקו את `API_URL`** בראש `app.js`. בלי הכתובת הזו האתר מנותק מהנתונים.
2. **אל תשנו שמות של שדות קיימים** (`title`, `done`, `week`…). כל הנתונים שכבר נשמרו משתמשים בשמות האלה. מותר להוסיף שדות חדשים.
3. **נתונים שמגיעים מהגיליון או מ־Gemini מציגים רק דרך `el()` או `textContent`**, אף פעם לא `innerHTML`, כי מישהו יכול לכתוב קוד בתוך משימה.
4. **לבדוק במובייל**: הרבה משתמשים בטלפון. יש `@media (max-width:640px)` ב־`app.css`.
5. **העברית מימין לשמאל**: הדף כולו `dir="rtl"`.
6. **שינוי ב־`Code.gs` לא נכנס לתוקף אוטומטית.** ראו הסעיף הבא. אם אפשר לעשות את השינוי רק ב־`app.js`, עדיף.
7. **קובץ חדש** (תמונה, js, css) צריך להוסיף ל־`SHELL` ב־`sw.js` ולהעלות את `CACHE` לגרסה הבאה (`mm-board-v3` וכן הלאה).
8. **לא לשים מפתחות או סיסמאות בקבצים ב־GitHub.** ה־repo ציבורי. מפתח Gemini נשמר רק ב־Script Properties של Apps Script.

## איך מעלים שינוי

**שינוי באתר (`index.html` / `app.js` / `app.css`):**
1. ב־GitHub, ב־repo: **Add file ← Upload files**, גוררים את הקבצים ששונו ולוחצים **Commit changes**. שם הקובץ חייב להיות זהה בדיוק. `app (1).js` לא יחליף את `app.js`.
2. אחרי 1–2 דקות האתר מתעדכן לכולם. מרעננים עם **Ctrl+F5**.

**שינוי ב־`Code.gs`** (רק למי שיש לו גישה ל־Google Sheet):
1. ב־Sheet: **Extensions ← Apps Script**. מחליפים את כל הקוד ושומרים.
2. אם השינוי דורש הרשאה חדשה (למשל שירות חדש של גוגל), מריצים פונקציה כלשהי מהעורך ומאשרים.
3. **Deploy ← Manage deployments ←** ✏️ ← **Version: New version ← Deploy**. **לא** New deployment, כי זה יוצר כתובת חדשה, והאתר ימשיך לפנות לישנה.

## בדיקה מהירה כשמשהו לא עובד

בדף האתר, **F12 ← Console**:
```js
// does the backend work?
fetch(API_URL_HERE,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"config"})}).then(r=>r.json()).then(console.log)
// does Gemini work?
fetch(API_URL_HERE,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"ai",code:localStorage.getItem("mm_team_code")||"",prompt:'Return only this JSON: {"ok":true}'})}).then(r=>r.json()).then(console.log)
```
(מחליפים את `API_URL_HERE` בכתובת מראש `app.js`, בתוך מירכאות.)

- **"Gemini HTTP 404 … no longer available":** שם המודל השתנה. מעדכנים את `gemini_model` בלשונית `settings` לפי הרשימה בעמוד `ai.google.dev/gemini-api/docs/models`.
- **`ai_rate_limited`:** המודל עמוס. מחכים, או מוסיפים מודל חלופי ב־`gemini_model`.
- **בעיה בתמונות:** בודקים שהרצתם את `authorize` ב־Apps Script ופרסתם New version.
