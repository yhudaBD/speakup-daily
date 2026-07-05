## SpeakUp Daily – Project Overview

### 1. Tech Stack & Tooling

- **Type**: Single-page web app
- **Language**: JavaScript (ESNext) + JSX
- **Framework**: React 19 (`react`, `react-dom`)
- **Routing**: `react-router-dom` v7
- **Bundler / Dev server**: Vite 8
- **Styling**: Custom CSS (`src/index.css`), CSS variables + media queries (no Tailwind / MUI)
- **State management**: Custom React Context + `useReducer` (`src/context/AppContext.jsx`)
- **Linting**: `oxlint`
- **Build tooling**:
  - `scripts/generate-icons.mjs` + `sharp` – יצירת אייקונים לפלטפורמות שונות
  - `vite build` – בניית production
- **AI & Speech**:
  - Groq Chat + Whisper (דרך `ai.service.js`)
  - Web Speech API (SpeechSynthesis + SpeechRecognition איפה זמין)

#### package.json (בקצרה)

- **dependencies**:
  - `react`, `react-dom`, `react-router-dom`
  - `@google/generative-ai` (כרגע לא בשימוש עיקרי – העיקר זה Groq)
- **devDependencies**:
  - `vite`, `@vitejs/plugin-react`
  - `oxlint` (לינט)
  - `sharp` (לאייקונים)

---

### 2. מבנה הפרויקט – תיקיות עיקריות

- `src/`
  - `App.jsx` – מעטפת האפליקציה, Router, `BottomNav`, טעינת כל הדפים
  - `index.css` – כל ה־design system:
    - CSS variables (צבעים, טיפוגרפיה, radii, shadows)
    - layout: `.app-shell`, `.page-content`, `.container`
    - רספונסיביות: מובייל / טאבלט / דסקטופ (`@media`)
    - עיצוב צ׳אט, כפתורי מיקרופון, כרטיסים, גרפים, סטטיסטיקות

- `src/context/`
  - `AppContext.jsx`
    - React Context גלובלי + `useReducer`
    - **state ראשי**:
      - `user`: { id, name }
      - `settings`:
        - `dailyGoal`: כמות משפטים ליום
        - `difficulty`: רמת הקושי לתרגול הגייה (easy / medium / advanced)
        - `ttsSpeed`: מהירות הקראה
        - `showTranslation`: תרגום במשפטי תרגול
        - `chatDifficulty`: רמת קושי בצ׳אט (easy/medium/hard)
        - `showChatTranslation`: הצגת תרגום בצ׳אט
      - `streak`: { current, longest, lastPracticeDate }
      - `sessions`: תוצאות daily practice + סיכום שיחות לאותו יום
      - `todayProgress`: משפטים שתרגלו היום
      - `rolePlay`: { chats: [], customTopics: [] }
    - **Actions (Reducer)**:
      - `SET_USER` – עדכון המשתמש
      - `UPDATE_SETTINGS` – עדכון הגדרות
      - `SAVE_SESSION_RESULT` – שמירת תוצאה של משפט ב־Practice + עדכון streak
      - `SAVE_ROLEPLAY_SESSION` – שמירת רישום שיחה (chatId, topic, turnCount, completedAt)
      - `UPDATE_ROLEPLAY_FEEDBACK` – שמירת פידבק AI לשיחה (ניתוח שיחה)
      - `RESET_TODAY` – איפוס todayProgress
      - `LOAD_DATA` – טעינת נתונים מ־localStorage
      - `UPSERT_ROLEPLAY_CHAT` – יצירה/עדכון שיחה בצ׳אט (RolePlay)
      - `DELETE_ROLEPLAY_CHAT` – מחיקת שיחה
      - `ADD_CUSTOM_TOPIC` / `DELETE_CUSTOM_TOPIC` – ניהול נושאי RolePlay מותאמים אישית
    - **Persistence**:
      - שמירת `user`, `settings`, `streak`, `sessions`, `rolePlay` תחת `localStorage` key: `speakup_data`
      - חישוב `todayProgress` לפי היום הנוכחי

- `src/pages/`
  - `Home.jsx`
    - מסך הבית:
      - כותרת עם greeting + streak
      - **Today's Mission**: התקדמות ביחס ל־`dailyGoal`
      - כפתור להתחלת תרגול הגייה (`/practice`)
      - כרטיס **Try a Conversation!** שמוביל ל־`/roleplay` ומציג כמה שיחות נעשו היום
      - Weekly chart: ממוצע ציונים בשבוע האחרון
      - סטטיסטיקות: Best streak, Days active

  - `Practice.jsx`
    - מסך תרגול הגייה (Pronunciation practice)
    - לוגיקה מרכזית:
      - בחירת משפטים יומיים מתוך `data/sentences.js` לפי רמת קושי והיסטוריה
      - ניגון משפט (TTS) לפי `settings.ttsSpeed`
      - שימוש ב־SpeechRecognition / הקלטה ושליחה ל־Whisper דרך `ai.service`
      - חישוב ציון הגייה + ניתוח מילים (`utils/pronunciationScorer.js`)
      - שמירה ב־`SAVE_SESSION_RESULT` + עדכון streak
    - מצבי UI:
      - האזנה למשפט, הקלטה, ניתוח, תוצאה, Done screen

  - `RolePlay.jsx`
    - מסך הצ׳אט/שיחות:
      - Home של RolePlay:
        - לשונית נושאים (Topics): בחירת תרחיש מובנה מתוך `data/rolePlayTopics.js` + נושאים מותאמים אישית
        - לשונית היסטוריה (History): שיחות שמורות, סטטוס (פעיל/הסתיים), תצוגת תאריך, מחיקה
      - מסך צ’אט מלא-מסך (`.chat-shell`):
        - כותרת עם emoji + שם תרחיש
        - פס התקדמות לפי turn count / MAX_TURNS
        - אזור הודעות (ConversationBubble)
        - הצעות תשובה (SuggestedReplies) לפי chatDifficulty
        - שורת מיקרופון / הקלדה (MicButton)
      - מצב DONE:
        - סיכום שיחה
        - כפתור **ניתוח שיחה ב-AI** (analysis)
        - כפתורים: שיחה חדשה, נושא אחר, חזרה לדף הבית
      - מצב review של שיחה שמורה:
        - הצגת השיחה
        - אם יש feedback – אפשר לפתוח מסך ניתוח שיחה

  - `Progress.jsx`
    - טאב Weekly: פירוט לכל יום בשבוע + ממוצע
    - טאב All Time:
      - סה״כ משפטים
      - סה״כ שיחות שהושלמו
      - ממוצע ציונים כללי
      - streak נוכחי ו־best streak
      - הישגים (Achievements) לפי כללים שונים
    - טאב Review:
      - משפטים חלשים (<70) למיקוד נוסף

  - `Settings.jsx`
    - Profile: שם המשתמש
    - Practice:
      - Daily goal (3 / 5 / 10)
      - Difficulty (easy / medium / advanced)
    - Audio:
      - Playback speed (Slow / Normal / Fast) – משפיע על Practice + RolePlay (קריאה)
    - Display:
      - Show Translation – תרגום במשפטי Practice
    - Chat:
      - Chat Difficulty:
        - Easy: תשובות מלאות
        - Medium: רמזים ותחילת משפט
        - Hard: בלי עזרה
      - Show Chat Translation – תרגום מתחת להודעות AI + הצעות תשובה
    - Reset (Danger Zone):
      - איפוס מלא של נתונים (`localStorage.clear()` + reload)

- `src/components/`
  - `layout/BottomNav.jsx`
    - ניווט תחתון במובייל / עליון בדסקטופ
    - קישורים: Home, Practice, Chat, Progress, Settings
  - `roleplay/ConversationBubble.jsx`
    - מציג כל הודעה בצ׳אט:
      - צד ימין: המשתמש
      - צד שמאל + emoji של נושא: AI
      - תרגום (`message.he`) אם showChatTranslation פעיל
      - כפתור **🔊 השמע** להקראת הודעת ה-AI
  - `roleplay/SuggestedReplies.jsx`
    - רשימת כפתורי תשובה:
      - Easy: תשובות מלאות באנגלית + תרגום
      - Medium: sentence starters + hint בעברית, נכנס לשורת הטקסט להשלמה
      - Hard: לא מציע (array ריק)
  - `roleplay/ThinkingBubble.jsx`
    - אנימציית “ה-AI חושב”

- `src/hooks/`
  - `useRolePlay.js`
    - ה־state machine של הצ׳אט:
      - `messages`: כל ההודעות
      - `suggestedReplies`
      - `phase`: `IDLE`, `AI_THINKING`, `USER_TURN`, `DONE`
      - `turnCount`, `MAX_TURNS`
      - `isSpeaking`
    - פונקציות עיקריות:
      - `startConversation()` – פותח שיחה חדשה לפי topic
      - `resumeConversation(chat)` – חידוש שיחה שמורה
      - `handleUserMessage(text)` – הוספת הודעת משתמש + קריאת AI דרך `aiService.sendMessage`
      - `endConversation()` – סימון שיחה כהושלמה
      - `replayMessage(text)` – השמעה חוזרת
      - `resetConversation()` – התחלה מחדש
    - לוגיקת TTS:
      - שימוש ב־SpeechSynthesis
      - בחירת קול אנגלי טבעי יותר אוטומטית
      - חלוקת הטקסט למשפטים לקריאה טבעית יותר
      - התאמת מהירות לקריאת הצ’אט (`ttsSpeed`)
    - אינטגרציה עם `AppContext`:
      - `onPersist(chat)` – עדכון `rolePlay.chats`
      - `onSessionComplete(record)` – רישום שיחה ל־sessions + streak

  - `useVoiceInput.js`
    - הקלטת דיבור:
      - Desktop: Web Speech Recognition (אם קיים)
      - Mobile/אחר: MediaRecorder → upload ל־Groq Whisper (`aiService.transcribeAudio`)
    - מחזיר:
      - `isRecording`, `isTranscribing`, `liveTranscript`, `error`
      - `startRecording()`, `stopRecording()`, `clearError()`

- `src/services/`
  - `ai.service.js`
    - חיבור ל־Groq:
      - `sendMessage({ systemPrompt, messages, chatDifficulty })`:
        - שולח שיחה מלאה למודל `llama-3.1-8b-instant`
        - מקבל JSON: `ai_reply` + `suggested_user_responses`
        - מבצע תרגום מרוכז לעברית (batch) דרך `translateToHebrew` עם מודל `llama-3.3-70b-versatile`
        - מחזיר: `ai_reply`, `ai_reply_he`, `suggested_user_responses[{ en, he, hint? }]`
      - `analyzeConversation({ messages, topicTitle })`:
        - שולח תמליל שיחה למודל ניתוח
        - מחזיר: `overall_score`, `summary`, `strengths`, `improvements`, `grammar_notes`, `vocabulary_suggestions`
      - `transcribeAudio(blob)`:
        - שימוש ב־Groq Whisper `whisper-large-v3-turbo` להמרת דיבור לטקסט

- `src/data/`
  - `sentences.js` – מאגר 200+ משפטים לתרגול הגייה (כולל תרגום)
  - `rolePlayTopics.js` – רשימת תרחישי RolePlay:
    - coffee shop, job interview, airport, restaurant, doctor, shopping, hotel ועוד
    - לכל נושא: emoji, title, description, difficulty, `systemPrompt`
    - `systemInstruction` – הוראה כללית למודל איך להתנהג בכל שיחה
    - פונקציה `createCustomTopic()` ליצירת נושא מותאם אישית

- `src/utils/`
  - `pronunciationScorer.js` – חישוב similarity בין משפט מקורי לטרנסקריפציה
  - `dateHelpers.js` – תאריכים, today string, last N days וכו׳
  - `device.js` – זיהוי מכשיר/פלטפורמה לשיפור חוויית הקלטה

- `public/`
  - `manifest.json` – הגדרות PWA בסיסיות (שם, אייקון, צבעים)
  - `_redirects` – תמיכה ב־SPA ב־Netlify / Vercel

---

### 3. זרימות מרכזיות באפליקציה

#### 3.1. זרימת תרגול הגייה (Practice)

1. Home → לחיצה על **Start Practice**
2. בחירת משפט יומי מתוך pool
3. ניגון המשפט (TTS)
4. הקלטה + טרנסקריפציה
5. חישוב ציון + פידבק מילולי
6. שמירה ב־`SAVE_SESSION_RESULT` + עדכון streak
7. מעבר למשפט הבא / סיום Session

#### 3.2. זרימת שיחה (RolePlay)

1. בחירת נושא מתוך Topics / פתיחת שיחה שמורה
2. `useRolePlay.startConversation()`:
   - שליחת הודעת `[START]` למודל
   - קבלת משפט פתיחה + הצעות תשובה
3. כל תור:
   - המשתמש מדבר/כותב
   - AI עונה + הצעות תשובה / רמזים לפי chatDifficulty
4. אחרי מספר תורות (`MAX_TURNS`) או לחיצה על “סיים”:
   - מעבר למסך Done
   - אפשרות לניתוח שיחה ב-AI (analyzeConversation)
   - שמירת סיכום השיחה ו-feedback ב־AppContext

#### 3.3. מעקב התקדמות (Progress)

- Aggregation על פני `sessions`:
  - ממוצעים יומיים
  - צבירת משפטים ושיחות
  - זיהוי משפטים חלשים
  - בניית הישגים (Achievements)

---

### 4. תוכנית יישום מסודרת ל־6 שבועות

#### שבוע 1 — איחוד הלמידה (Practice + RolePlay)

**מטרה:** שהשיחות ייחשבו כחלק מהתרגול היומי ולא “פיצ’ר נפרד”.

- יעד יומי משולב: `5 משפטים או שיחה אחת`
- ספירת שיחות ב־`Home` וב־`Progress`
- בסוף שיחה: שמירת 3 ביטויים/טעויות לתרגול המשך
- כפתור “תרגל עכשיו” מתוך סיכום שיחה

**קבצים מרכזיים:**
- `AppContext.jsx`, `Home.jsx`, `Progress.jsx`, `RolePlay.jsx`

**Definition of Done:**
- שיחה שהושלמה מעדכנת streak/goal
- רואים chat metrics בדשבורד
- יש מעבר ישיר מתובנה בצ’אט לתרגול

---

#### שבוע 2 — משוב לימודי אמיתי בצ’אט

**מטרה:** להפוך כל שיחה למנוע למידה, לא רק שיחה נעימה.

- “כרטיס משוב” בסוף שיחה:
  - מה נאמר
  - ניסוח משופר
  - הסבר קצר בעברית
- Top 3 טעויות חוזרות (grammar / vocabulary / politeness)
- כפתור “תרגל את התיקון” לכל סעיף

**קבצים מרכזיים:**
- `ai.service.js`, `RolePlay.jsx`, (אופציונלי: רכיב ConversationFeedbackCard)

**Definition of Done:**
- כל שיחה מסתיימת בפידבק קונקרטי
- המשתמש יכול לתרגל תיקון בלחיצה

---

#### שבוע 3 — לוקליזציה מלאה + UX נקי (עברית)

**מטרה:** חוויה ישראלית מלאה וברורה.

- תרגום מלא של: `Home`, `Settings`, `Progress`, RolePlay UI
- כיבוד מלא של `showTranslation` גם בצ’אט (כולל הצעות תשובה)
- שפה אחידה (RTL, ניסוחים, כותרות)

**קבצים מרכזיים:**
- `Home.jsx`, `Settings.jsx`, `Progress.jsx`, `components/roleplay/*`

**Definition of Done:**
- אין “שאריות אנגלית” ב־UI הראשי
- מתגי תרגום עובדים עקבי בכל האפליקציה

---

#### שבוע 4 — PWA + הרגל יומי (Retention)

**מטרה:** שימוש יומי אמיתי מהמובייל.

- “הוסף למסך הבית” עובד טוב (PWA מלא)
- Service Worker בסיסי (טעינה מהירה, assets cached)
- תזכורת יומית “10 דקות אנגלית”
- תזכורת חכמה אם לא הושלם יעד

**קבצים מרכזיים:**
- `public/manifest.json`, רישום service worker, utility להתראות

**Definition of Done:**
- התקנה למסך הבית מצליחה
- תזכורת מופעלת עם הרשאה
- פתיחה חוזרת מהירה

---

#### שבוע 5 — למידה אדפטיבית ותרחישים מונחי-מטרה

**מטרה:** התקדמות אמיתית לפי רמת המשתמש.

- Chat difficulty אדפטיבי לפי ביצועים
- תרחישים עם משימות ברורות (“הזמן קפה עם X”, “קבע תור לרופא”)
- ניקוד משימה (האם עמד במטרה)
- רמזים מדורגים (קל→בינוני→קשה)

**קבצים מרכזיים:**
- `rolePlayTopics.js`, `useRolePlay.js`, `ai.service.js`

**Definition of Done:**
- לכל תרחיש יש objective ברור
- ניתן למדוד הצלחה/כישלון בתרחיש

---

#### שבוע 6 — SRS וכרטיסיות (לזיכרון ארוך טווח)

**מטרה:** שהמשתמש יזכור את מה שלמד.

- יצירת Flashcards אוטומטית משיחות/טעויות
- חזרות מרווחות (1, 3, 7, 14 ימים)
- “מילת היום” / “ביטוי היום”
- לשונית קצרה של Review יומי

**קבצים מרכזיים:**
- `AppContext.jsx`, `Progress.jsx`, עמוד Review חדש או טאב נוסף

**Definition of Done:**
- נוצרים כרטיסים אוטומטית
- המשתמש מקבל חזרת-יום מסודרת

---

### 5. סדר עבודה מומלץ בכל שבוע

- **יום 1** – Design + data model (סכמה, state, actions)
- **יום 2–3** – פיתוח לוגיקה + אינטגרציה עם ה־UI
- **יום 4** – ליטוש UX ורספונסיביות (מובייל/טאבלט/דסקטופ)
- **יום 5** – בדיקות, תיקונים, ו־small release

