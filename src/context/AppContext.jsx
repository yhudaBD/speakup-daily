import { createContext, useContext, useReducer, useEffect } from "react";
import { getTodayString, daysSince } from "../utils/dateHelpers";

const STORAGE_KEY = "speakup_data";
const SCHEMA_VERSION = 1;
const SESSION_RETENTION_DAYS = 365;

function createUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ensureUser(user) {
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

function pruneOldSessions(sessions) {
  const entries = Object.entries(sessions || {});
  const kept = entries.filter(([date]) => daysSince(date) <= SESSION_RETENTION_DAYS);
  if (kept.length === entries.length) return sessions;
  return Object.fromEntries(kept);
}

// One-time backfill for users whose saved data predates lifetimeStats — derives
// permanent counters from full history so achievements/XP stay accurate even
// after old session day-buckets get pruned.
function computeLifetimeStats(sessions, rolePlayChats) {
  const allSentences = Object.values(sessions || {}).flatMap((s) => s.sentences || []);
  return {
    totalSentences: allSentences.length,
    sentencesAbove90: allSentences.filter((s) => s.score >= 90).length,
    daysActive: Object.keys(sessions || {}).length,
    totalChats: (rolePlayChats || []).filter((c) => c.status === "completed").length,
  };
}

const defaultLifetimeStats = {
  totalSentences: 0,
  sentencesAbove90: 0,
  daysActive: 0,
  totalChats: 0,
};

const initialState = {
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
  isLoaded: false,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: ensureUser(action.payload) };
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
    default:
      return state;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = getTodayString();
        const isPreVersioned = !parsed.schemaVersion || parsed.schemaVersion < SCHEMA_VERSION;
        const prunedSessions = pruneOldSessions(parsed.sessions);
        // Backfill lifetimeStats once for existing users from their full history
        // (computed before pruning, so nothing already earned is lost).
        const lifetimeStats = isPreVersioned
          ? computeLifetimeStats(parsed.sessions, parsed.rolePlay?.chats)
          : parsed.lifetimeStats || defaultLifetimeStats;
        const todayProgress = prunedSessions?.[today]?.sentences || [];
        dispatch({
          type: "LOAD_DATA",
          payload: {
            ...parsed,
            sessions: prunedSessions,
            todayProgress,
            lifetimeStats,
            user: parsed.user || ensureUser(null),
            rolePlay: parsed.rolePlay || { chats: [], customTopics: [] },
            practice: parsed.practice || { wordBank: [], customTopics: [] },
            placement: parsed.placement || null,
          },
        });
      } else {
        dispatch({ type: "LOAD_DATA", payload: {} });
      }
    } catch (e) {
      console.error("Failed to load saved data", e);
      dispatch({ type: "LOAD_DATA", payload: {} });
    }
  }, []);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      const toSave = {
        schemaVersion: SCHEMA_VERSION,
        user: state.user,
        settings: state.settings,
        streak: state.streak,
        sessions: pruneOldSessions(state.sessions),
        rolePlay: state.rolePlay,
        practice: state.practice,
        lifetimeStats: state.lifetimeStats,
        placement: state.placement,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error("Failed to save data", e);
    }
  }, [state.user, state.settings, state.streak, state.sessions, state.rolePlay, state.practice, state.lifetimeStats, state.placement]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
