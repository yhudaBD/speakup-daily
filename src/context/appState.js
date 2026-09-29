// App state shape, reducer and the pure helpers around it, kept out of
// AppContext.jsx so they can be unit-tested without React or Firebase.
// AppContext.jsx owns the side effects: localStorage, Firestore sync and
// auth.
import { getTodayString, daysSince } from "../utils/dateHelpers";
import { toCefr } from "../services/aiSchemas";
import { dayXp } from "./achievements";
import { migrateSessions } from "./migrations";
import { isActiveDay, isCompletedChat, isSpoken, streakRun } from "./selectors";

export const STORAGE_KEY = "speakup_data";
export const SCHEMA_VERSION = 2;
const SESSION_RETENTION_DAYS = 365;
const WORD_BANK_LIMIT = 100;

function createUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function ensureUser(user) {
  if (!user) return { id: createUserId(), name: "" };
  if (!user.id) return { ...user, id: createUserId() };
  return user;
}

const CEFR_LEVELS = ["Pre-A1", "A1", "A2", "B1", "B2", "C1"];

// A level saved before toCefr existed ("A1 (usually the lower)", "C2") is
// one adjustLevel can't find, which turned level adjustment off for good
// (CRITICAL_REVIEW.md §14).
function normalizePlacement(placement) {
  const level = toCefr(placement?.overall_level);
  if (!level || level === placement.overall_level) return placement ?? null;
  return { ...placement, overall_level: level };
}

// A single strong/weak conversation shouldn't whipsaw the level, but two in a
// row without a mixed result in between is a real signal — nudge one CEFR
// step and reset both streaks so the next adjustment needs fresh evidence.
// A conversation where more than 30% of the turns came from a suggestion or a
// translation is no evidence for a higher level (CRITICAL_REVIEW.md §5).
const MAX_HELPED_SHARE_TO_RAISE = 0.3;

function adjustLevel(placement, score, helpedShare = 0) {
  const currentIdx = CEFR_LEVELS.indexOf(placement.overall_level);
  if (currentIdx === -1) return placement;

  const strong = score >= 85 && helpedShare <= MAX_HELPED_SHARE_TO_RAISE;
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

// The practice and conversation difficulty for each CEFR level. The level
// sets them unless the user chose them in Settings (difficultyManual), both
// after the placement conversation and when ADJUST_LEVEL moves the level
// (CRITICAL_REVIEW.md §13).
export const LEVEL_TO_DIFFICULTY = {
  "Pre-A1": "easy", A1: "easy", A2: "medium", B1: "medium", B2: "advanced", C1: "advanced",
};
const LEVEL_TO_CHAT_DIFFICULTY = {
  "Pre-A1": "easy", A1: "easy", A2: "easy", B1: "medium", B2: "hard", C1: "hard",
};
const DIFFICULTY_KEYS = ["difficulty", "chatDifficulty"];

function settingsForLevel(settings, level) {
  if (settings.difficultyManual || !LEVEL_TO_DIFFICULTY[level]) return settings;
  return { ...settings, difficulty: LEVEL_TO_DIFFICULTY[level], chatDifficulty: LEVEL_TO_CHAT_DIFFICULTY[level] };
}

const defaultSettings = {
  dailyGoal: 5,
  difficulty: "easy",
  ttsSpeed: 1.0,
  showTranslation: true,
  chatDifficulty: "easy",
  showChatTranslation: true,
};

// The stored streak after the days changed: the run of active days (D1) from
// the days themselves, and the longest run ever. The streak shown comes from
// selectStreak, which also drops a run that has ended (CRITICAL_REVIEW.md §19).
function nextStreak(streak, sessions) {
  const run = streakRun(sessions);
  return { ...run, longest: Math.max(streak?.longest || 0, run.current) };
}

// Drops days older than SESSION_RETENTION_DAYS and folds them into
// `archive` ({ throughDate, daysActive, sentences, chats }), so totals
// computed from the days (selectors.js) don't shrink when a day is pruned
// (CRITICAL_REVIEW.md §3, ACTION_PLAN.md D5). A day on or before throughDate
// is already counted: the cloud copy never deletes days (§1), so a merge
// brings them back, and they're dropped without being counted twice.
export function archiveOldSessions(sessions, archive) {
  const entries = Object.entries(sessions || {});
  const isOld = ([date]) => daysSince(date) > SESSION_RETENTION_DAYS;
  if (!entries.some(isOld)) return { sessions: sessions || {}, archive: archive ?? null };

  const next = {
    throughDate: archive?.throughDate ?? null,
    daysActive: archive?.daysActive || 0,
    sentences: archive?.sentences || 0,
    chats: archive?.chats || 0,
    completedChats: archive?.completedChats ?? archive?.chats ?? 0,
    speakAbove90: archive?.speakAbove90 || 0,
    speakSentences: archive?.speakSentences ?? archive?.sentences ?? 0,
    xp: archive?.xp || 0,
  };
  for (const [date, day] of entries.filter(isOld)) {
    if (archive?.throughDate && date <= archive.throughDate) continue;
    if (isActiveDay(day)) next.daysActive++;
    next.sentences += (day?.sentences || []).length;
    next.chats += (day?.chats || []).length;
    next.completedChats += (day?.chats || []).filter(isCompletedChat).length;
    next.speakAbove90 += (day?.sentences || []).filter((s) => isSpoken(s) && s.score >= 90).length;
    next.speakSentences += (day?.sentences || []).filter(isSpoken).length;
    next.xp += dayXp(day);
    if (!next.throughDate || date > next.throughDate) next.throughDate = date;
  }
  return { sessions: Object.fromEntries(entries.filter((e) => !isOld(e))), archive: next };
}

const wordKey = (w) => w.word.toLowerCase();

// Keeps the bank at WORD_BANK_LIMIT by dropping the words saved longest ago
// (by learnedAt), never those in `keep`, and leaves the order as it was.
function capWordBank(words, keep = new Set()) {
  const overflow = words.length - WORD_BANK_LIMIT;
  if (overflow <= 0) return words;
  const evicted = new Set(
    words
      .filter((w) => !keep.has(wordKey(w)))
      .sort((a, b) => (a.learnedAt || "").localeCompare(b.learnedAt || ""))
      .slice(0, overflow)
      .map(wordKey),
  );
  return words.filter((w) => !evicted.has(wordKey(w))).slice(-WORD_BANK_LIMIT);
}

// Union of two lists by key. On a conflict the item whose `stamp` is later
// wins, local on a tie. Local items keep their order, cloud-only ones follow.
function unionBy(local, cloud, key, stamp = () => "") {
  const byKey = new Map((local || []).map((item) => [key(item), item]));
  for (const item of cloud || []) {
    const k = key(item);
    const mine = byKey.get(k);
    if (!mine || stamp(item) > stamp(mine)) byKey.set(k, item);
  }
  return [...byKey.values()];
}

// Of a local and a cloud archive, the one folded further forward.
function moreCompleteArchive(local, cloud) {
  if (!local) return cloud ?? null;
  if (!cloud) return local;
  return (cloud.throughDate || "") > (local.throughDate || "") ? cloud : local;
}

// One-time backfill for users whose saved data predates lifetimeStats — derives
// permanent counters from full history so achievements/XP stay accurate even
// after old session day-buckets get pruned.
// Finished conversations are counted by selectTotalChats (§16).
export function computeLifetimeStats(sessions) {
  const allSentences = Object.values(sessions || {}).flatMap((s) => s.sentences || []);
  return {
    totalSentences: allSentences.length,
  };
}

export const defaultLifetimeStats = {
  totalSentences: 0,
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
  // The "day 1" recording (T5): { status: "recorded" | "declined", at }, or
  // null until the user does one or the other. The recordings themselves
  // stay on the device (services/baselineRecordings.js).
  baseline: null,
  // Totals of days pruned after a year (archiveOldSessions), or null.
  archive: null,
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
    case "UPDATE_SETTINGS": {
      const chosen = DIFFICULTY_KEYS.some((k) => k in action.payload);
      return {
        ...state,
        settings: { ...state.settings, ...action.payload, ...(chosen ? { difficultyManual: true } : {}) },
      };
    }
    case "SAVE_SESSION_RESULT": {
      const today = getTodayString();
      // Keeps the rest of the day, its chats included (CRITICAL_REVIEW.md §3).
      const day = state.sessions[today] || {};
      const updated = [...(day.sentences || []), action.payload];
      // The day's average is derived (speakAverage), not stored (§8).
      const newSessions = {
        ...state.sessions,
        [today]: { ...day, sentences: updated, completedAt: new Date().toISOString() },
      };
      return {
        ...state,
        sessions: newSessions,
        streak: nextStreak(state.streak, newSessions),
        lifetimeStats: {
          ...state.lifetimeStats,
          totalSentences: state.lifetimeStats.totalSentences + 1,
        },
      };
    }
    case "SAVE_ROLEPLAY_SESSION": {
      const today = getTodayString();
      const record = action.payload;
      const daySession = state.sessions[today] || { sentences: [], chats: [] };
      const chats = [...(daySession.chats || []), record];
      const newSessions = {
        ...state.sessions,
        [today]: { ...daySession, chats },
      };
      return {
        ...state,
        sessions: newSessions,
        streak: nextStreak(state.streak, newSessions),
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
    case "LOAD_DATA": {
      const user = ensureUser(action.payload.user);
      const { sessions, archive } = archiveOldSessions(
        action.payload.sessions
          ? migrateSessions(action.payload.sessions, action.payload.schemaVersion)
          : state.sessions,
        action.payload.archive ?? state.archive,
      );
      return {
        ...state,
        ...action.payload,
        sessions,
        archive,
        user,
        settings: { ...defaultSettings, ...action.payload.settings },
        rolePlay: action.payload.rolePlay || { chats: [], customTopics: [] },
        practice: {
          wordBank: [],
          customTopics: [],
          ...action.payload.practice,
        },
        lifetimeStats: action.payload.lifetimeStats || defaultLifetimeStats,
        placement: normalizePlacement("placement" in action.payload ? action.payload.placement : state.placement),
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
        settings: settingsForLevel(state.settings, action.payload.overall_level),
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
      const placement = adjustLevel(state.placement, action.payload.score, action.payload.helpedShare);
      const moved = placement.overall_level !== state.placement.overall_level;
      return {
        ...state,
        placement,
        settings: moved ? settingsForLevel(state.settings, placement.overall_level) : state.settings,
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
      // A full bank keeps the new words and drops the ones saved longest
      // ago. It used to cut the list at 100, which dropped the new words
      // themselves (CRITICAL_REVIEW.md §11).
      const incomingKeys = new Set(incoming.filter((w) => w.word).map(wordKey));
      const wordBank = capWordBank([...byKey.values()], incomingKeys);
      return {
        ...state,
        practice: { ...state.practice, wordBank },
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
    case "SET_BASELINE": {
      const { status } = action.payload || {};
      if (status !== "recorded" && status !== "declined") return state;
      return { ...state, baseline: { status, at: new Date().toISOString() } };
    }
    case "MERGE_CLOUD_DATA": {
      const cloud = action.payload;
      if (!cloud) return state;
      // Unites the two copies instead of letting the cloud overwrite whole
      // fields, which erased words, chats and streak days made offline or on
      // another device (CRITICAL_REVIEW.md §2א). No deletion markers yet, so
      // something deleted on one side while the other was offline comes back
      // (§2ב adds them with the migration).
      const { sessions, archive } = archiveOldSessions(
        { ...(migrateSessions(cloud.sessions, cloud.schemaVersion) || {}), ...state.sessions },
        moreCompleteArchive(state.archive, cloud.archive),
      );
      const byId = (x) => x.id;
      const cloudRolePlay = cloud.rolePlay || {};
      const cloudPractice = cloud.practice || {};
      const chats = unionBy(state.rolePlay.chats, cloudRolePlay.chats, byId, (c) => c.updatedAt || "")
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        .slice(0, 50);
      const wordBank = capWordBank(
        unionBy(state.practice.wordBank, cloudPractice.wordBank, wordKey, (w) => w.updatedAt || w.learnedAt || ""),
      );
      const run = streakRun(sessions);
      const localStats = state.lifetimeStats || {};
      const cloudStats = cloud.lifetimeStats || {};
      // The one counter still stored, totalSentences (Home's first-launch
      // check); everything else is a selector. The larger side wins.
      const lifetimeStats = { ...cloudStats, ...localStats };
      for (const k of Object.keys(lifetimeStats)) {
        lifetimeStats[k] = Math.max(Number(localStats[k]) || 0, Number(cloudStats[k]) || 0);
      }
      return {
        ...state,
        settings: cloud.settings || state.settings,
        streak: {
          current: run.current,
          longest: Math.max(state.streak?.longest || 0, cloud.streak?.longest || 0, run.current),
          lastPracticeDate: run.lastPracticeDate,
        },
        sessions,
        archive,
        rolePlay: {
          ...state.rolePlay,
          chats,
          customTopics: unionBy(state.rolePlay.customTopics, cloudRolePlay.customTopics, byId),
        },
        practice: {
          ...state.practice,
          wordBank,
          customTopics: unionBy(state.practice.customTopics, cloudPractice.customTopics, byId),
        },
        lifetimeStats,
        placement: normalizePlacement(cloud.placement || state.placement),
        baseline: cloud.baseline || state.baseline,
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
    sessions: state.sessions,
    archive: state.archive ?? null,
    rolePlay: state.rolePlay,
    practice: state.practice,
    lifetimeStats: state.lifetimeStats,
    placement: state.placement,
    baseline: state.baseline ?? null,
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
