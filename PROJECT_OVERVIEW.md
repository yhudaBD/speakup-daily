## SpeakUp Daily – Project Overview

*עדכון אחרון: ספטמבר 2026. המסמך הזה מתאר את המצב האמיתי של הקוד — לא תוכנית עתידית.*

### 1. Tech Stack & Tooling

- **Type**: Single-page web app (PWA, מותקן להוספה למסך הבית, כולל Service Worker אמיתי לעבודה אופליין)
- **Language**: JavaScript (ESNext) + JSX
- **Framework**: React 19 (`react`, `react-dom`)
- **Routing**: `react-router-dom` v7
- **Bundler / Dev server**: Vite 8 (+ `vite-plugin-pwa` ליצירת ה-Service Worker)
- **Styling**: Custom CSS (`src/index.css`), CSS variables + media queries (no Tailwind / MUI)
- **State management**: Custom React Context + `useReducer` (`src/context/AppContext.jsx`), נשמר תחילה ב-`localStorage` ומסונכרן ל-Firestore לאחר כניסה (ראה למטה)
- **חשבון/אימות**: כניסה עם Google (Firebase Auth) **חובה** להשתמש באפליקציה (`AuthGate.jsx`) — flow מבוסס redirect (לא popup) כדי לשרוד partitioned storage בדפדפנים מודרניים; `netlify.toml` מפנה `/__/auth/*` ו-`/__/firebase/*` ל-authDomain כדי שכל ה-flow יהיה same-origin. לאחר כניסה, הדאטה המקומי מסונכרן/ממוזג עם עותק בענן לפי `uid` (`MERGE_CLOUD_DATA`, `loadCloudProfile`/`saveCloudProfile` ב-`services/firebase.js`) — כך שהיסטוריה עוברת בין מכשירים לאותו חשבון
- **Linting**: `oxlint`
- **Backend**: אין שרת אפליקציה — רק **Netlify Functions** נקודתיות לכל דבר שדורש סוד (מפתח API) או אחסון משותף (Netlify Blobs)
- **AI**: Groq (chat + Whisper transcription), דרך proxy בצד שרת בלבד — המפתח **לעולם לא** מגיע לדפדפן
- **Build tooling**:
  - `scripts/generate-icons.mjs` + `sharp` – יצירת אייקונים לפלטפורמות שונות
  - `vite build` – בניית production

#### package.json (בקצרה)

- **dependencies**: `react`, `react-dom`, `react-router-dom`, `@netlify/blobs`, `firebase`
- **devDependencies**: `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `oxlint`, `sharp`, `netlify-cli`

---

### 2. ארכיטקטורת אבטחה — חשוב להבין לפני שנוגעים ב-AI

**כל קריאה ל-Groq עוברת דרך `netlify/functions/groq-proxy.js`.** קוד הלקוח (`src/services/ai.service.js`)
פונה ל-`/api/groq-proxy`, לא ל-Groq ישירות, ולא מחזיק שום מפתח. המפתח נקרא רק בצד השרת דרך
`process.env.GROQ_API_KEY` (ללא קידומת `VITE_` — קידומת כזו הייתה גורמת ל-Vite "לאפות" את
המפתח לתוך קובץ ה-JS שנשלח לדפדפן, בדיוק הבאג שתוקן בתחילת הפרויקט הזה).

**ה-proxy לא פתוח לציבור.** כל קריאה חייבת לשאת Firebase ID token של משתמש מחובר
(`Authorization: Bearer ...`, ש-`ai.service.js` מצרף אוטומטית). השרת מאמת אותו ב-`netlify/functions/_shared/auth.js`
מול המפתחות הציבוריים של Google (ספריית `jose`, בלי service account). בנוסף:
- רק שני המודלים שהאפליקציה משתמשת בהם מותרים.
- `max_completion_tokens` נקבע בשרת.
- יש תקרות על מספר ההודעות, על אורכן ועל גודל האודיו.
- יש מכסה יומית לכל חשבון (`_shared/quota.js`, Netlify Blobs). ברירת המחדל היא 600 קריאות ביום, וניתן לשנות אותה דרך `AI_DAILY_LIMIT_PER_USER`.
- אין כותרות CORS: האפליקציה וה-API באותו origin.

כל הפונקציות כתובות בפורמט **v2** (`export default async (req) => {...}`, מחזירות `Response`). בבדיקה מול
סביבת production התברר שהזרקת האישורים האוטומטית של Blobs לא עבדה בפורמט הקלאסי, רק ב-v2.
אל תחזיר פונקציה שמשתמשת ב-Blobs לפורמט הישן.

**אמינות Groq בפועל:** מודל ה-`openai/gpt-oss-20b` נכשל ביצירת JSON תקין בשיעור גבוה יחסית
(נמדד ~30-40% מהקריאות במצב שיחת ההיכרות!) בשלושה קודי שגיאה שונים
(`tool_use_failed`, `json_validate_failed`, `output_parse_failed`), ולפעמים מחזיר תוכן ריק
עם סטטוס 200 אחרי שמיצה את תקציב ה-reasoning שלו. `groqChat()` ב-`ai.service.js` מטפל בכל
המקרים האלה עם עד 3 ניסיונות חוזרים + חילוץ ישיר מ-`failed_generation` כשאפשר. **אל תסיר
את מנגנון הניסיון החוזר הזה** — הוא לא תיאורטי, הוא נמדד ותועד תוך כדי הפיתוח.

---

### 3. State מרכזי — `AppContext.jsx` + `appState.js`

ה-reducer, צורת ה-state והפונקציות הטהורות נמצאים ב-`src/context/appState.js` (ויש להם טסטים ב-`tests/state/`).
`AppContext.jsx` מטפל רק ב-side effects: localStorage, סנכרון Firestore והזדהות.
ה-state נשמר תחת מפתח `speakup_data` ב-`localStorage`, עם `schemaVersion` לצורך מיגרציות עתידיות.

**בידוד בין חשבונות:** `ownerUid` מסמן לאיזה חשבון Firebase שייכים הנתונים שבמכשיר. בהתחברות:
- אם הנתונים שייכים לחשבון אחר, הם מוחלפים בפרופיל חדש (`RESET_FOR_ACCOUNT`) ולא ממוזגים לענן.
- אם לנתונים אין בעלים (נשמרו לפני שהשדה נוסף), הם משויכים לחשבון הראשון שמתחבר (`CLAIM_LOCAL_DATA`).

בהתנתקות (`signOutAndClear`) הנתונים נשמרים לענן פעם אחרונה, ואז נמחקים מה-`localStorage`. אם השמירה לענן לא אושרה, הם נשארים במכשיר.

```
{
  isLoaded,       // true רק אחרי שהטעינה מ-localStorage הסתיימה (מונע "פרופיל טרי" מדומה)
  ownerUid,       // uid של חשבון Firebase שהנתונים שייכים לו (null = עוד לא שויכו)
  user: { id, name },
  settings: { dailyGoal, difficulty, ttsSpeed, showTranslation, chatDifficulty, showChatTranslation },
  streak: { current, longest, lastPracticeDate },
  sessions: { [date]: { sentences: [...], averageScore, chats: [...] } },  // נשמר עד שנה, מקוצץ אוטומטית
  todayProgress: [...],
  lifetimeStats: { totalSentences, sentencesAbove90, daysActive, totalChats },  // שורד קיצוץ sessions
  rolePlay: { chats: [] (עד 50), customTopics: [] },
  practice: { wordBank: [] (עד 100), customTopics: [] },
  placement: {
    comprehension_level, speaking_level, overall_level,
    job_field, situations, gaps,
    summary_he, learning_plan: [{ title_he, focus_en, why_he }],
    planProgress: { [moduleIndex]: { status, sessionsCompleted } },
    highStreak, lowStreak,   // מונים פנימיים ל-auto-leveling
    completedAt,
  } | null,
}
```

**Actions עיקריים**: `SET_USER`, `UPDATE_SETTINGS`, `SAVE_SESSION_RESULT`,
`SAVE_ROLEPLAY_SESSION`, `UPDATE_ROLEPLAY_FEEDBACK`, `LOAD_DATA`, `UPSERT_ROLEPLAY_CHAT`,
`DELETE_ROLEPLAY_CHAT`, `ADD_CUSTOM_TOPIC`/`DELETE_CUSTOM_TOPIC`,
`ADD_PRACTICE_WORDS`/`REMOVE_WORD_FROM_BANK`, `ADD_CUSTOM_PRACTICE_TOPIC`/`DELETE_CUSTOM_PRACTICE_TOPIC`,
`SET_PLACEMENT_RESULT`, `UPDATE_PLAN_PROGRESS`, `MERGE_PLACEMENT_GAPS`, `ADJUST_LEVEL`,
`MERGE_CLOUD_DATA`, `CLAIM_LOCAL_DATA`, `RESET_FOR_ACCOUNT`.

---

### 4. מבנה הפרויקט – תיקיות עיקריות

- `netlify/functions/`
  - `groq-proxy.js` — כל קריאות ה-AI (chat/translation/analysis/placement/transcription), מפתח מוסתר בצד שרת, דורש משתמש מחובר ומוגבל במכסה יומית
  - `_shared/` — קוד משותף לפונקציות (אימות token, עזרי HTTP, מכסה). זו לא פונקציה בעצמה
  - `log-event.js` — כתיבת אירועי שימוש (v2, Netlify Blobs). דורש משתמש מחובר, ושדות ה-`details` מסוננים ב-`_shared/events.js`
  - `get-dashboard-data.js` — קריאה מוגנת ב-`ADMIN_SECRET`, מרכזת נתונים לדשבורד (v2, Netlify Blobs)

- `public/`
  - `manifest.json` — הגדרות PWA
  - `usage_dashboard.html` — לוח בקרה פרטי (סיסמה מול `ADMIN_SECRET`), **לא** מקושר מתוך ניווט האפליקציה

- `src/App.jsx` — Router, `AuthGate`, `BottomNav`, `OfflineBanner`, `UpdateBanner`, טעינת כל הדפים כולל `/placement` ו-`/practice/cloze`

- `src/context/AppContext.jsx` — ראה סעיף 3 למעלה

- `src/pages/`
  - `Home.jsx` — greeting + streak, כרטיס "גלה את הרמה שלך" (אם אין `placement`), Today's Mission, כרטיס נקודות חלשות, כרטיס RolePlay, גרף שבועי, סטטיסטיקות. מפנה אוטומטית ל-`/placement` בפעם הראשונה שהאפליקציה נפתחת (פרופיל ריק לגמרי, אחרי `isLoaded`)
  - `Practice.jsx` — תרגול הגייה: משפטים סטטיים (`data/sentences.js`, 321 משפטים ב-8 קטגוריות, משוקללים לכיוון נקודות חלשות) או נושא AI חופשי (עם הקשר מפרופיל ה-placement), הקלטה, ניקוד, שמירת מילים, ניתוח AI בסוף session. מספר המשפטים הזמינים בכל קטגוריה **לא** מוצג למשתמש (רק ל-wordbank/weak, ששם המספר משמעותי — התקדמות אישית, לא גודל מאגר תוכן). כולל כפתור כניסה למצב "השלמת משפטים" (`ClozePractice.jsx`)
  - `ClozePractice.jsx` — מצב תרגול חדש, **ללא AI בכלל**: מחסיר מילת תוכן ממשפט קיים מ-`sentences.js`, בונה 3 מסיחים ממאגר המילים הרחב יותר (כל `sentences.js`), ומציג בחירה מרובה. תוצאות נכתבות דרך אותו `SAVE_SESSION_RESULT` כמו תרגול רגיל — נספר ב-streak/XP/Review בדיוק כמו תרגול הגייה
  - `RolePlay.jsx` — שיחות AI: נושאים מובנים + מותאמים אישית, כפתור **"🗣️ איך אומרים...?"**, הצעות תשובה, השמעה חוזרת, ניתוח שיחה בסוף + auto-leveling
  - `PlacementTest.jsx` — שיחת ההיכרות/קביעת רמה (ראה סעיף 5)
  - `Progress.jsx` — טאבים: Weekly, All Time (כולל Level/XP, הישגים, מגמת שימוש בעזרים), Review (משפטים חלשים), **"🗺️ התוכנית שלי"** (אם יש `learning_plan`) — מוצגת כמסלול ויזואלי אנכי (`components/progress/LearningPath.jsx`) עם עיגולי done/current/upcoming, לא רשימת כרטיסים שטוחה
  - `Settings.jsx` — פרופיל, הגדרות תרגול/צ'אט/תצוגה, **"🧭 Level"** (בדיקת רמה מחדש), Reset

- `src/components/`
  - `layout/BottomNav.jsx`, `layout/OfflineBanner.jsx`, `layout/UpdateBanner.jsx` — מציג באנר "יש גרסה חדשה" כשיש Service Worker חדש ממתין (ראה סעיף 9), מבוסס `virtual:pwa-register/react`
  - `progress/LearningPath.jsx` — רינדור המסלול הוויזואלי בטאב "התוכנית שלי"; לא state חדש, רק תצוגה אחרת על `placement.learning_plan` + `placement.planProgress` הקיימים
  - `roleplay/ConversationBubble.jsx`, `SuggestedReplies.jsx`, `ThinkingBubble.jsx`, `MicButton.jsx` (משותף גם ל-Placement)
  - `AuthGate.jsx` — שער כניסה: חוסם את שאר האפליקציה עד שיש משתמש מחובר + סנכרון ענן ראשוני הושלם

- `src/hooks/`
  - `useRolePlay.js` — state machine של הצ'אט, כולל `logHelpUsed()` (מונה שימוש בעזרים לשיחה) ורישום אירועים ל-analytics
  - `usePlacementTest.js` — state machine נפרד לשיחת ההיכרות (לא חוזר ל-mock בכישלון — ראה סעיף 5)
  - `useVoiceInput.js` — הקלטה: Desktop = Web Speech Recognition, Mobile = MediaRecorder → Groq Whisper

- `src/services/ai.service.js` — כל הקריאות ל-AI (דרך ה-proxy), כולל `runPlacementTurn`, `translateToEnglish`, מנגנון הניסיון החוזר (סעיף 2)

- `src/data/`
  - `sentences.js` — מאגר משפטים ב-8 קטגוריות: `daily, work, tech, food, social, travel, shopping, health`
  - `rolePlayTopics.js` — 14 תרחישים מובנים + `createCustomTopic()` + `systemInstruction`
  - `placementPrompt.js` — הפרומפט הפעיל של שיחת ההיכרות (ראה `placement_prompt.md` לתיעוד המלא)

- `src/utils/`
  - `pronunciationScorer.js` — דמיון מחרוזות (Levenshtein) בין המשפט למה שנאמר — **לא** ניתוח פונטי אמיתי, הוחלט במפורש לא לשפר את זה כרגע
  - `analytics.js` — `logEvent()` fire-and-forget לדשבורד
  - `dateHelpers.js`, `device.js`, `practiceHistory.js`, `speechVoice.js`

---

### 5. שיחת ההיכרות וה"תוכנית האישית" (Placement)

בהפעלה הראשונה (פרופיל ריק לגמרי) האפליקציה מפנה אוטומטית ל-`/placement`: שיחה קצרה
(עד 14 תורות) שבה ה-AI מעריך רמת הבנה ודיבור **בנפרד**, לומד על העבודה והקשיים של המשתמש,
ומתאים את הקושי תוך כדי שיחה — בלי לחשוף למשתמש שזה "מבחן". בסוף השיחה נוצרים גם רמה
(CEFR, מוסתרת מהמשתמש) וגם **תוכנית לימוד אישית** של 5-8 שלבים, שנשמרים ל-`placement`.

התוכנית מוצגת בטאב "התוכנית שלי" ב-Progress; לחיצה על שלב פותחת שיחת RolePlay מותאמת
(דרך `createCustomTopic`) ומסמנת התקדמות כשהיא מסתיימת. הרמה גם מתעדכנת אוטומטית — ציון
גבוה (85+) או נמוך (מתחת ל-45) פעמיים ברצף ב-RolePlay מזיז את הרמה שלב אחד (`ADJUST_LEVEL`),
כדי שרעש חד-פעמי לא ישנה כלום. הפרופיל (רמה/עבודה/קשיים) מוזרם לכל שיחת RolePlay ותרגול AI
דרך `buildProfileContext()`, וקשיים חדשים נאספים אוטומטית מכל ניתוח שיחה (`MERGE_PLACEMENT_GAPS`).

**אם השיחה נכשלת** (רשת/API) — `usePlacementTest` **לא** נופל בחזרה ל-mock (בניגוד לשאר
`ai.service.js`): תוצאה מזויפת הייתה מטעה מדי כי היא קובעת אישית את כל שאר האפליקציה. במקום
זה המשתמש רואה מסך שגיאה עם אפשרות לנסות שוב או לדלג עם רמה כללית ברירת מחדל.

---

### 6. לוח בקרה פרטי (Analytics)

`public/usage_dashboard.html` — עמוד סטטי, **לא** מקושר משום מקום בניווט האפליקציה, מוגן
בסיסמה (`ADMIN_SECRET`) שנבדקת בצד שרת ב-`get-dashboard-data.js` (נכשל-סגור: בלי הסוד הנכון,
בלי גישה לנתונים בכלל — הבדיקה הזו אומתה ידנית ב-401/500/200 לפני שהותקן).

אירועי שימוש אנונימיים (`placement_completed`, `session_started`, `session_ended` עם
`helpUsedCount`/`turnCount`/`topicTitle`/`currentLevel`) נכתבים דרך `log-event.js` ל-Netlify
Blobs — קשורים למזהה מכשיר אנונימי (`user.id`), **לא** לתוכן שיחות. הדשבורד מציג: פעילות
30 יום לכל משתמש, פעילים שבועיים, מגמת שימוש בעזרים, רמה בהתחלה מול עכשיו, נושאים
פופולריים, עלות AI משוערת (סף התראה $10, אבל בפועל זעום — ראה סעיף 7), ורשימת "לא פעילים
3+ ימים".

---

### 7. כלכלה (למי שמתכנן תמחור)

נמדד בפועל מול תעריפי Groq האמיתיים: `openai/gpt-oss-20b` ~$0.075/$0.30 למיליון טוקנים
(קלט/פלט), `openai/gpt-oss-120b` ~$0.15/$0.60, Whisper $0.04/שעת שמע. עלות ריאלית למשתמש
פעיל היא **סנטים בודדים לחודש**, לא דולרים — כל תמחור עתידי (למשל תוכנית מנוי) לא צריך
לדאוג מעלויות AI, רק מעמלות סליקה ומהוצאות הפצה/שיווק בפועל.

---

### 8. מה **לא** נבנה (הוחלט במפורש לדחות)

- ניקוד הגייה פונטי אמיתי (נשאר Levenshtein) — הוחלט פעמיים לא לתעדף
- תשלומים/Stripe — לא הותחל
- פיצ'רים חברתיים בין חברים — לא בעדיפות
- מכסות לפי מסלול תשלום: היום יש רק תקרה יומית אחידה לכל חשבון (ראה סעיף 2)

(חשבונות משתמש/סנכרון בין מכשירים **כן** נבנו — ראה סעיף 1; זה היה כאן ברשימה בגרסה קודמת של המסמך)

---

### 9. Deploy ותקרת Netlify Free — לקח מהשטח (ספטמבר 2026)

Netlify Free (Starter) מוגבל ל-**300 דקות build בחודש** ברמת כל החשבון (לא לכל site בנפרד), על
מחזור חודשי שמעוגן לתאריך קבוע (לא לתחילת חודש קלנדרי). כל push ל-`main` **וכל** deploy preview
של PR צורכים מהמכסה הזו בנפרד — פתיחת כמה PRs ברצף (גם בלי למזג) יכולה לרוקן אותה מהר יותר
משצפוי.

כשהמכסה נגמרת, Netlify **לא בונה בכלל** ולא מחזיר שגיאה גלויה — הסימן היחיד מבחוץ הוא שלקומיט
האחרון על `main` אין שום commit status (`GET /repos/.../commits/main/status` מחזיר
`total_count: 0`), בשונה ממצב תקין שבו תמיד יש context בשם `netlify/<site>/...`.

**אם זה קורה שוב:**
- זה לא "נגמר לתמיד" — המכסה מתאפסת אוטומטית במחזור הבא (בדוק תאריך מדויק ב-Netlify: Team
  settings → Billing → Usage).
- דיפלוי שפוספס **לא** נבנה אוטומטית כשהמכסה מתאפסת — צריך "Trigger deploy" ידני מה-Netlify UI,
  או push חדש.
- כדי לצמצם צריכה: לשקול לכבות Deploy Previews (Site configuration → Build & deploy → Deploy
  contexts) אם בטא/פיתוח כולל הרבה PRs נפתחים/נסגרים בלי להתכוון למזג את כולם.
