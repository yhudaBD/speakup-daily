import { Component } from "react";
import { Link } from "react-router-dom";
import { reportError } from "../services/errorReporting";
import { STORAGE_KEY } from "../context/appState";

// Without a boundary, one render error anywhere (say, an unexpected shape
// from the AI saved into state) unmounted the whole app and left a blank
// screen. If the bad data was also persisted, that happened on every load.
//
// `fallback` is a render function: (error, reset) => element. Remounting
// with a new `key` also resets it. RouteErrorBoundary uses that so moving to
// another page clears a crashed one.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, { boundary: this.props.name, componentStack: info?.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}

const screenStyle = {
  minHeight: "60vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "32px 24px",
  textAlign: "center",
  color: "var(--color-text)",
};

// Last line of defence, outside AppProvider and the router, so it can't
// depend on either.
export function AppCrashScreen() {
  const resetLocalData = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: a reload is all we can offer.
    }
    window.location.reload();
  };

  return (
    <div role="alert" style={{ ...screenStyle, minHeight: "100vh", background: "var(--color-bg)" }}>
      <div style={{ fontSize: 48 }} aria-hidden="true">😵</div>
      <h1 style={{ fontSize: 22 }}>משהו השתבש</h1>
      <p className="text-muted" style={{ maxWidth: 340 }}>
        האפליקציה נתקלה בשגיאה לא צפויה. טעינה מחדש פותרת את רוב המקרים.
      </p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>
        טען מחדש
      </button>
      <p className="text-muted" style={{ maxWidth: 340, fontSize: 13, marginTop: 16 }}>
        אם השגיאה חוזרת בכל טעינה, אפשר לנקות את הנתונים השמורים במכשיר הזה. ההתקדמות שמסונכרנת לחשבון שלך
        תחזור אחרי ההתחברות.
      </p>
      <button className="btn btn-ghost btn-sm" onClick={resetLocalData}>
        נקה נתונים במכשיר וטען מחדש
      </button>
    </div>
  );
}

// Keeps a crash inside one page: the bottom nav stays usable, and the
// user can retry or leave.
export function RouteErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      name="route"
      fallback={(_error, reset) => (
        <div role="alert" style={screenStyle}>
          <div style={{ fontSize: 40 }} aria-hidden="true">⚠️</div>
          <h2 style={{ fontSize: 20 }}>הדף הזה נתקע</h2>
          <p className="text-muted" style={{ maxWidth: 320 }}>
            משהו השתבש בהצגת הדף. אפשר לנסות שוב או לחזור לדף הבית.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={reset}>נסה שוב</button>
            <Link className="btn btn-ghost" to="/" onClick={reset}>לדף הבית</Link>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
