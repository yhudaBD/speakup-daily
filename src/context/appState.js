// App state shape, reducer and the pure helpers around it, kept out of
// AppContext.jsx so they can be unit-tested without React or Firebase.
// AppContext.jsx owns the side effects: localStorage, Firestore sync and
// auth.
import { getTodayString, daysSince } from "../utils/dateHelpers";

export const STORAGE_KEY = "speakup_data";
export const SCHEMA_VERSION = 1;
const SESSION_RETENTION_DAYS = 365;

function createUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function ensureUser(user) {
  if (!user) return { id: createUserId(), name: "" };
  if (!user.id) return { ...user, id: createUserId() };
  return user;
}

const CEFR_LEVELS = ["Pre-A1", "A1", "A2", "B1", "B2", "C1"];

// A single strong/weak conversation shouldn't whipsaw the level, but two in a
// row without a mixed result in between is a real signal — nudge one CEFR
// step and reset both streaks so the next adjustment needs fresh evidence.
function adjustLevel(placement, score) {
  const currentIdx = CEFR_LEVELS.indexOf(placement.overall_level);
  if (currentIdx === -1) return placement;

  const strong = score >= 85;
  const weak = score < 45;
  const highStreak = strong ? (placement.highStreak || 0) + 1 : 0;
  const lowStreak = weak ? (placement.lowStreak || 0) + 1 : 0;

  let overall_level = placement.overall_level;
  let resetStreaks = false;
  if (highStreak >= 2 && currentIdx < CEFR_LEVELS.length - 1) {
    overall_level = CEFR_LEVELS[currentIdx + 1];
    resetStreaks = true;
  } else if (lowStreak >= 2 && currentIdx > 0) {
    overall_level = CEFR_LEVELS[currentIdx - 1];
    resetStreaks = true;
  }

  return {
    ...placement,
    overall_level,
    highStreak: resetStreaks ? 0 : highStreak,
    lowStreak: resetStreaks ? 0 : lowStreak,
  };
}

const defaultSettings = {
  dailyGoal: 5,
  difficulty: "easy",
  ttsSpeed: 1.0,
  showTranslation: true,
  chatDifficulty: "easy",
  showChatTranslation: true,
};

function computeStreak(streak, today) {
  const lastDate = streak.lastPracticeDate;
  let current = streak.current;
  if (lastDate === today) {
    // same day, no change
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    current = lastDate === yesterdayStr ? current + 1 : 1;
  }
  const longest = Math.max(streak.longest, current);
  return { current, longest, lastPracticeDate: today };
}

export function pruneOldSessions(sessions) {
  const entries = Object.entries(sessions || {});
  const kept = entries.filter(([date]) => daysSince(date) <= SESSION_RETENTION_DAYS);
  if (kept.length === entries.length) return sessions;
  return Object.fromEntries(kept);
}

// One-time backfill for users whose saved data predates lifetimeStats — derives
// permanent counters from full history so achievements/XP stay accurate even
// after old session day-buckets get pruned.
export function computeLifetimeStats(sessions, rolePlayChats) {
  const allSentences = Object.values(sessions || {}).flatMap((s) => s.sentences || []);
  return {
    totalSentences: allSentences.length,
    sentencesAbove90: allSentences.filter((s) => s.score >= 90).length,
    daysActive: Object.keys(sessions || {}).length,
    totalChats: (rolePlayChats || []).filter((c) => c.status === "completed").length,
  };
}

export const defaultLifetimeStats = {
  totalSentences: 0,
  sentencesAbove90: 0,
  daysActive: 0,
  totalChats: 0,
};

export const initialState = {
  user: null,
  settings: { ...defaultSettings },
  streak: {
    current: 0,
    longest: 0,
    lastPracticeDate: null,
  },
  sessions: {},
  todayProgress: [],
  rolePlay: {
    chats: [],
    customTopics: [],
  },
  practice: {
    wordBank: [],
    customTopics: [],
  },
  lifetimeStats: { ...defaultLifetimeStats },
  placement: null,
  // Firebase uid of the account this device's saved data belongs to. See
  // localDataOwnership() below.
  ownerUid: null,
  isLoaded: false,
};

export function reducer(state, action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: ensureUser(action.payload) };
    // Dispatched from AppProvider's onAuthStateChanged listener rather than
    // from wherever sign-in was triggered — signInWithRedirect navigates
    // away and back, so nothing at the call site is still around to receive
    // a result. Reads state.user at reducer time (always current, unlike a
    // value captured in the effect's closure) so the existing local id and
    // any other fields survive.
    case "SET_GOOGLE_PROFILE":
      return { ...state, user: ensureUser({ ...state.user, ...action.payload }) };
    // Signing in with saved data that no account has claimed yet (saved
    // before ownerUid existed, or on a device where nobody has signed in).
    case "CLAIM_LOCAL_DATA":
      return { ...state, ownerUid: action.payload.uid };
    // Signing in on a device whose saved data belongs to a different
    // account. The payload is a whole fresh state from freshStateFor(),
    // built outside the reducer so its new user id is generated once.
    case "RESET_FOR_ACCOUNT":
      return action.payload;
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "SAVE_SESSION_RESULT": {
      const today = getTodayString();
      const isNewDay = !state.sessions[today];
      const existing = state.sessions[today]?.sentences || [];
      const updated = [...existing, action.payload];
      const avg = Math.round(updated.reduce((s, x) => s + x.score, 0) / updated.length);
      const newSessions = {
        ...state.sessions,
        [today]: { sentences: updated, averageScore: avg, completedAt: new Date().toISOString() },
      };
      return {
        ...state,
        sessions: newSessions,
        todayProgress: updated,
        streak: computeStreak(state.streak, today),
        lifetimeStats: {
          ...state.lifetimeStats,
          totalSentences: state.lifetimeStats.totalSentences + 1,
          sentencesAbove90: state.lifetimeStats.sentencesAbove90 + (action.payload.score >= 90 ? 1 : 0),
          daysActive: state.lifetimeStats.daysActive + (isNewDay ? 1 : 0),
        },
      };
    }
    case "SAVE_ROLEPLAY_SESSION": {
      const today = getTodayString();
      const record = action.payload;
      const daySession = state.sessions[today] || { sentences: [], averageScore: 0, chats: [] };
      const chats = [...(daySession.chats || []), record];
      const newSessions = {
        ...state.sessions,
        [today]: { ...daySession, chats },
      };
      return {
        ...state,
        sessions: newSessions,
        streak: computeStreak(state.streak, today),
        lifetimeStats: {
          ...state.lifetimeStats,
          totalChats: state.lifetimeStats.totalChats + 1,
        },
      };
    }
    case "UPDATE_ROLEPLAY_FEEDBACK": {
      const { chatId, feedback } = action.payload;
      const today = getTodayString();
      const daySession = state.sessions[today];
      let newSessions = state.sessions;
      if (daySession?.chats) {
        newSessions = {
          ...state.sessions,
          [today]: {
            ...daySession,
            chats: daySession.chats.map((c) =>
              c.chatId === chatId ? { ...c, feedback } : c
            ),
          },
        };
      }
      return {
        ...state,
        sessions: newSessions,
        rolePlay: {
          ...state.rolePlay,
          chats: state.rolePlay.chats.map((c) =>
            c.id === chatId ? { ...c, feedback } : c
          ),
        },
      };
    }
    case "RESET_TODAY":
      return { ...state, todayProgress: [] };
    case "LOAD_DATA": {
      const user = ensureUser(action.payload.user);
      return {
        ...state,
        ...action.payload,
        user,
        settings: { ...defaultSettings, ...action.payload.settings },
        rolePlay: action.payload.rolePlay || { chats: [], customTopics: [] },
        practice: {
          wordBank: [],
          customTopics: [],
          ...action.payload.practice,
        },
        lifetimeStats: action.payload.lifetimeStats || defaultLifetimeStats,
        isLoaded: true,
      };
    }
    case "UPSERT_ROLEPLAY_CHAT": {
      const chat = action.payload;
      const chats = state.rolePlay.chats.filter((c) => c.id !== chat.id);
      return {
        ...state,
        rolePlay: {
          ...state.rolePlay,
          chats: [{ ...chat, updatedAt: new Date().toISOString() }, ...chats].slice(0, 50),
        },
      };
    }
    case "DELETE_ROLEPLAY_CHAT":
      return {
        ...state,
        rolePlay: {
          ...state.rolePlay,
          chats: state.rolePlay.chats.filter((c) => c.id !== action.payload),
        },
      };
    case "SET_PLACEMENT_RESULT": {
      const plan = action.payload.learning_plan || [];
      const planProgress = Object.fromEntries(
        plan.map((_, i) => [i, { status: "not_started", sessionsCompleted: 0 }])
      );
      return {
        ...state,
        placement: { ...action.payload, planProgress, completedAt: new Date().toISOString() },
      };
    }
    case "UPDATE_PLAN_PROGRESS": {
      if (!state.placement) return state;
      const { moduleIndex, status } = action.payload;
      const existing = state.placement.planProgress?.[moduleIndex] || { status: "not_started", sessionsCompleted: 0 };
      const sessionsCompleted = existing.sessionsCompleted + 1;
      return {
        ...state,
        placement: {
          ...state.placement,
          planProgress: {
            ...state.placement.planProgress,
            [moduleIndex]: {
              sessionsCompleted,
              status: status || (sessionsCompleted >= 2 ? "done" : "in_progress"),
            },
          },
        },
      };
    }
    case "ADJUST_LEVEL": {
      if (!state.placement) return state;
      return { ...state, placement: adjustLevel(state.placement, action.payload.score) };
    }
    case "MERGE_PLACEMENT_GAPS": {
      if (!state.placement) return state;
      const incoming = action.payload || [];
      const existing = state.placement.gaps || [];
      const merged = [...existing];
      for (const gap of incoming) {
        if (gap && !merged.some((g) => g.toLowerCase() === gap.toLowerCase())) {
          merged.push(gap);
        }
      }
      return {
        ...state,
        placement: { ...state.placement, gaps: merged.slice(-20) },
      };
    }
    case "ADD_CUSTOM_TOPIC":
      return {
        ...state,
        rolePlay: {
          ...state.rolePlay,
          customTopics: [...state.rolePlay.customTopics, action.payload],
        },
      };
    case "DELETE_CUSTOM_TOPIC":
      return {
        ...state,
        rolePlay: {
          ...state.rolePlay,
          chats: state.rolePlay.chats.filter((c) => c.topicId !== action.payload),
          customTopics: state.rolePlay.customTopics.filter((t) => t.id !== action.payload),
        },
      };
    case "ADD_PRACTICE_WORDS": {
      const incoming = action.payload || [];
      const existing = state.practice?.wordBank || [];
      const byKey = new Map(existing.map((w) => [`${w.word.toLowerCase()}`, w]));
      for (const w of incoming) {
        if (!w.word) continue;
        const key = w.word.toLowerCase();
        byKey.set(key, {
          id: w.id || `word_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          word: w.word,
          meaning_he: w.meaning_he || "",
          usage_tip_he: w.usage_tip_he || "",
          example: w.example || "",
          category: w.category || "",
          learnedAt: w.learnedAt || new Date().toISOString(),
        });
      }
      return {
        ...state,
        practice: { ...state.practice, wordBank: [...byKey.values()].slice(0, 100) },
      };
    }
    case "REMOVE_WORD_FROM_BANK":
      return {
        ...state,
        practice: {
          ...state.practice,
          wordBank: (state.practice?.wordBank || []).filter((w) => w.id !== action.payload),
        },
      };
    case "ADD_CUSTOM_PRACTICE_TOPIC":
      return {
        ...state,
        practice: {
          ...state.practice,
          customTopics: [action.payload, ...(state.practice?.customTopics || [])].slice(0, 20),
        },
      };
    case "DELETE_CUSTOM_PRACTICE_TOPIC":
      return {
        ...state,
        practice: {
          ...state.practice,
          customTopics: (state.practice?.customTopics || []).filter((t) => t.id !== action.payload),
        },
      };
    // Runs once right after sign-in, when a cloud copy of this account's data
    // already exists (e.g. signing in on a new device). Sessions merge by
    // date with this device's local entries winning on an exact-date clash
    // (nothing just done here gets lost); the rest comes from the cloud,
    // since it represents the account's real history over time rather than
    // whatever happens to be in this particular browser right now.
    case "MERGE_CLOUD_DATA": {
      const cloud = action.payload;
      if (!cloud) return state;
      return {
        ...state,
        settings: cloud.settings || state.settings,
        streak: cloud.streak || state.streak,
        sessions: { ...(cloud.sessions || {}), ...state.sessions },
        rolePlay: cloud.rolePlay || state.rolePlay,
        practice: cloud.practice || state.practice,
        lifetimeStats: cloud.lifetimeStats || state.lifetimeStats,
        placement: cloud.placement || state.placement,
      };
    }
    default:
      return state;
  }
}

// The shape persisted to both localStorage and, once signed in, this
// account's Firestore document — kept as one function so the two never drift.
export function snapshotForSync(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    ownerUid: state.ownerUid ?? null,
    user: state.user,
    settings: state.settings,
    streak: state.streak,
    sessions: pruneOldSessions(state.sessions),
    rolePlay: state.rolePlay,
    practice: state.practice,
    lifetimeStats: state.lifetimeStats,
    placement: state.placement,
  };
}

// Whose data is sitting in this browser, relative to the account that just
// signed in. "foreign" data must never be merged into, or seeded as, this
// account's history: on a shared browser that is exactly how one person's
// practice ended up in another's cloud copy.
export function localDataOwnership(localOwnerUid, uid) {
  if (!localOwnerUid) return "unclaimed";
  return localOwnerUid === uid ? "own" : "foreign";
}

// A brand-new profile for `uid`, carrying over only the Google profile
// fields. Used when the data on this device belongs to someone else.
export function freshStateFor(uid, profile = {}) {
  return {
    ...initialState,
    settings: { ...initialState.settings },
    streak: { ...initialState.streak },
    rolePlay: { chats: [], customTopics: [] },
    practice: { wordBank: [], customTopics: [] },
    lifetimeStats: { ...defaultLifetimeStats },
    user: ensureUser({ name: profile.name || "", email: profile.email, photoURL: profile.photoURL }),
    ownerUid: uid,
    isLoaded: true,
  };
}
