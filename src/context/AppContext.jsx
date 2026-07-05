import { createContext, useContext, useReducer, useEffect } from "react";
import { getTodayString } from "../utils/dateHelpers";

const STORAGE_KEY = "speakup_data";

function createUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ensureUser(user) {
  if (!user) return { id: createUserId(), name: "" };
  if (!user.id) return { ...user, id: createUserId() };
  return user;
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
  },
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: ensureUser(action.payload) };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "SAVE_SESSION_RESULT": {
      const today = getTodayString();
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
        practice: action.payload.practice || { wordBank: [] },
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
        practice: { wordBank: [...byKey.values()].slice(0, 100) },
      };
    }
    case "REMOVE_WORD_FROM_BANK":
      return {
        ...state,
        practice: {
          wordBank: (state.practice?.wordBank || []).filter((w) => w.id !== action.payload),
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
        const todayProgress = parsed.sessions?.[today]?.sentences || [];
        dispatch({
          type: "LOAD_DATA",
          payload: {
            ...parsed,
            todayProgress,
            user: parsed.user || ensureUser(null),
            rolePlay: parsed.rolePlay || { chats: [], customTopics: [] },
            practice: parsed.practice || { wordBank: [] },
          },
        });
      }
    } catch (e) {
      console.error("Failed to load saved data", e);
    }
  }, []);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      const toSave = {
        user: state.user,
        settings: state.settings,
        streak: state.streak,
        sessions: state.sessions,
        rolePlay: state.rolePlay,
        practice: state.practice,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error("Failed to save data", e);
    }
  }, [state.user, state.settings, state.streak, state.sessions, state.rolePlay, state.practice]);

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
