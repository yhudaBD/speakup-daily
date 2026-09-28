import { useEffect, useState } from "react";
import { isNotInBeta, onNotInBeta } from "../../services/betaAccess";

// Shown once the AI proxy refuses this account because it isn't on the beta
// list (CRITICAL_REVIEW.md §26א). The AI features still show their own
// error, and this says why.
export default function BetaAccessBanner() {
  const [refused, setRefused] = useState(isNotInBeta);

  useEffect(() => onNotInBeta(() => setRefused(true)), []);

  if (!refused) return null;

  return (
    <div
      role="status"
      style={{
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: "1.5px solid var(--color-primary)",
        fontSize: 13,
        fontWeight: 700,
        padding: "8px 16px",
        borderRadius: 16,
        boxShadow: "var(--shadow-md)",
        maxWidth: "calc(100vw - 32px)",
        textAlign: "center",
      }}
    >
      🔒 התרגול עם AI פתוח כרגע למשתתפי הבטא בלבד
    </div>
  );
}
