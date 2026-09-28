import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { BASELINE_MAX_MS, BASELINE_PROMPTS } from "../data/baselinePrompts";
import {
  dismissBaselineForNow, requestPersistentStorage, saveBaselineRecording,
} from "../services/baselineRecordings";

// The "day 1" recording (T5 in ACTION_PLAN.md): three fixed topics, up to a
// minute each, kept on this device only, so beta users have a real "before"
// to compare with later (idea 16 builds the comparison). Loaded on demand
// (App.jsx). Reached after the placement conversation, or from the home
// page card. `location.state.next` is where to go afterwards.

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function BaselineRecording() {
  const { dispatch, firebaseUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const next = location.state?.next || { to: "/" };
  const recorder = useAudioRecorder({ maxMs: BASELINE_MAX_MS });

  const [step, setStep] = useState("intro");
  const [index, setIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState(null);

  const prompt = BASELINE_PROMPTS[index];

  useEffect(() => {
    if (!recorder.recording) return undefined;
    const url = URL.createObjectURL(recorder.recording.blob);
    setPlaybackUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPlaybackUrl(null);
    };
  }, [recorder.recording]);

  const leave = () => navigate(next.to, { state: next.state, replace: true });
  const notNow = () => {
    dismissBaselineForNow();
    leave();
  };
  const decline = () => {
    dispatch({ type: "SET_BASELINE", payload: { status: "declined" } });
    leave();
  };

  // After the last topic: done if anything was recorded, otherwise the same
  // as "not now", so the offer comes back next time.
  const advance = (count) => {
    recorder.reset();
    setSaveError(null);
    if (index + 1 < BASELINE_PROMPTS.length) {
      setIndex(index + 1);
    } else if (count > 0) {
      dispatch({ type: "SET_BASELINE", payload: { status: "recorded" } });
      setStep("done");
    } else {
      notNow();
    }
  };

  const saveAndNext = async () => {
    const { blob, mimeType, durationMs } = recorder.recording;
    setSaving(true);
    setSaveError(null);
    try {
      await saveBaselineRecording(firebaseUser.uid, { promptId: prompt.id, blob, mimeType, durationMs });
      if (savedCount === 0) requestPersistentStorage();
      setSavedCount(savedCount + 1);
      advance(savedCount + 1);
    } catch (err) {
      console.error("Saving the day-1 recording failed:", err);
      setSaveError("לא הצלחנו לשמור את ההקלטה במכשיר. נסה שוב");
    } finally {
      setSaving(false);
    }
  };

  const consent = (
    <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>
      ההקלטה נשמרת רק במכשיר הזה. בעוד חודש נקליט שוב ונשמע את ההבדל.
    </p>
  );

  if (step === "intro") {
    return (
      <div className="page-enter container" style={{ padding: "24px 16px" }}>
        <h1 style={{ marginBottom: 8 }}>🎙️ הקלטת "יום 1"</h1>
        <p style={{ marginBottom: 4 }}>
          שלושה נושאים קצרים, עד דקה לכל אחד. מדברים באנגלית, בלי להתכונן ובלי ציון.
        </p>
        {consent}
        <button type="button" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 20 }} onClick={() => setStep("record")}>
          בואו נתחיל
        </button>
        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={notNow}>
          לא עכשיו
        </button>
        <button type="button" className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 4, color: "var(--color-text-muted)" }} onClick={decline}>
          לא להקליט
        </button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="page-enter container" style={{ padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ marginBottom: 8 }}>נשמר במכשיר הזה</h2>
        <p className="text-muted">בעוד חודש נקליט שוב ונשמע את ההבדל.</p>
        <button type="button" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 20 }} onClick={leave}>
          המשך
        </button>
      </div>
    );
  }

  const error = recorder.error || saveError;
  return (
    <div className="page-enter container" style={{ padding: "24px 16px" }}>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
        נושא {index + 1} מתוך {BASELINE_PROMPTS.length}
      </p>
      <div className="card mb-4">
        <h2 style={{ marginBottom: 6 }}>{prompt.title}</h2>
        <p className="text-muted" style={{ fontSize: 14 }}>{prompt.hint}. באנגלית, עד דקה.</p>
      </div>

      <p dir="ltr" aria-live="polite" style={{ textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.4rem", marginBottom: 12 }}>
        {clock(recorder.elapsedMs)} / {clock(BASELINE_MAX_MS)}
      </p>

      {error && (
        <p role="alert" style={{ color: "var(--color-error)", textAlign: "center", marginBottom: 12 }}>{error}</p>
      )}

      {recorder.isRecording ? (
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={recorder.stop}>
          ⏹️ סיים
        </button>
      ) : recorder.recording ? (
        <>
          {playbackUrl && <audio controls src={playbackUrl} style={{ width: "100%", marginBottom: 12 }} />}
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={saveAndNext} disabled={saving}>
            שמור והמשך
          </button>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => { recorder.reset(); recorder.start(); }} disabled={saving}>
            הקלט שוב
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={recorder.start}>
            🎙️ התחל להקליט
          </button>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => advance(savedCount)}>
            דלג על הנושא
          </button>
        </>
      )}
      {consent}
    </div>
  );
}
