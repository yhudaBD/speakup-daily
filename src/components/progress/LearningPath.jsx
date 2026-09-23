// Visualizes the personal learning plan (placement.learning_plan +
// placement.planProgress) as a vertical path instead of a flat list, so the
// user can see at a glance which step is done, which is next, and what's
// still ahead — the data already existed, this only changes how it reads.
export default function LearningPath({ plan, planProgress, onModuleClick }) {
  const statuses = plan.map((_, i) => planProgress?.[i]?.status || "not_started");
  const currentIndex = statuses.findIndex((s) => s !== "done");
  const allDone = plan.length > 0 && currentIndex === -1;

  return (
    <div>
      {allDone && (
        <div className="card" style={{ background: "var(--color-success-light)", textAlign: "center", marginBottom: 16 }}>
          <p style={{ fontWeight: 800, color: "var(--color-success)", margin: 0 }}>🏁 סיימת את כל התוכנית!</p>
        </div>
      )}
      {plan.map((module, i) => {
        const progress = planProgress?.[i] || { status: "not_started", sessionsCompleted: 0 };
        const isDone = progress.status === "done";
        const isCurrent = i === currentIndex;
        const isLast = i === plan.length - 1;
        const circleBg = isDone ? "var(--color-success)" : isCurrent ? "var(--color-primary)" : "var(--color-surface-2)";
        const lineColor = isDone ? "var(--color-success)" : "var(--color-border)";

        return (
          <div key={i} style={{ display: "flex", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40, flexShrink: 0 }}>
              <div
                style={{
                  width: isCurrent ? 40 : 32,
                  height: isCurrent ? 40 : 32,
                  borderRadius: "50%",
                  background: circleBg,
                  color: isDone || isCurrent ? "#fff" : "var(--color-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: isCurrent ? 16 : 14,
                  flexShrink: 0,
                  boxShadow: isCurrent ? "0 0 0 4px var(--color-primary-light)" : "none",
                  border: isDone || isCurrent ? "none" : "2px solid var(--color-border)",
                  transition: "all 0.2s",
                }}
              >
                {isDone ? "✓" : i + 1}
              </div>
              {!isLast && (
                <div style={{ width: 3, flex: 1, minHeight: 28, background: lineColor, margin: "2px 0" }} />
              )}
            </div>

            <div
              className="card"
              style={{
                textAlign: "right",
                direction: "rtl",
                marginBottom: 16,
                flex: 1,
                border: isCurrent ? "2px solid var(--color-primary)" : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 style={{ fontSize: 15 }}>{module.title_he}</h3>
                {isCurrent && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-primary)" }}>📍 אתה כאן</span>}
                {isDone && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-success)" }}>הושלם</span>}
              </div>
              {module.why_he && (
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>{module.why_he}</p>
              )}
              <button className="btn btn-primary btn-sm btn-block" onClick={() => onModuleClick(module, i)}>
                {progress.status === "not_started" ? "🎙️ התחל תרגול" : "🎙️ תרגל שוב"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
