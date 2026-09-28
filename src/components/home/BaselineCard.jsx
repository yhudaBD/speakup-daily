import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { isBaselineDismissed } from "../../services/baselineRecordings";

// Offers the "day 1" recording (T5 in ACTION_PLAN.md) on the home page, after
// the placement conversation, until the user records it or declines it.
// "Not now" on the recording screen hides it for the rest of the visit.
export default function BaselineCard() {
  const { state } = useApp();
  const navigate = useNavigate();

  if (!state.isLoaded || !state.placement || state.baseline || isBaselineDismissed()) return null;

  return (
    <button
      type="button"
      className="card mb-4"
      onClick={() => navigate("/baseline")}
      style={{
        cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%",
        textAlign: "right", font: "inherit", color: "inherit",
        border: "1.5px solid var(--color-primary)", background: "var(--color-surface)",
      }}
    >
      <span style={{ fontSize: 28 }} aria-hidden="true">🎙️</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 15, color: "var(--color-primary)" }}>הקלטת "יום 1"</span>
        <span className="text-muted" style={{ display: "block", fontSize: 13 }}>3 דקות: מקליטים עכשיו, ובעוד חודש שומעים את ההבדל</span>
      </span>
    </button>
  );
}
