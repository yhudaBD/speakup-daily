import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppProvider } from "./context/AppContext";
import { preloadVoices } from "./utils/speechVoice";
import AuthGate from "./components/AuthGate";
import { ErrorBoundary, AppCrashScreen, RouteErrorBoundary } from "./components/ErrorBoundary";
import BottomNav from "./components/layout/BottomNav";
import OfflineBanner from "./components/layout/OfflineBanner";
import UpdateBanner from "./components/layout/UpdateBanner";
import Home from "./pages/Home";
import Practice from "./pages/Practice";
import ClozePractice from "./pages/ClozePractice";
import RolePlay from "./pages/RolePlay";
import Progress from "./pages/Progress";
import Settings from "./pages/Settings";
import PlacementTest from "./pages/PlacementTest";
import "./index.css";

// Keyed by path, so navigating away from a page that crashed gives the
// next page a fresh boundary.
function AppRoutes() {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/practice/cloze" element={<ClozePractice />} />
        <Route path="/roleplay" element={<RolePlay />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/placement" element={<PlacementTest />} />
      </Routes>
    </RouteErrorBoundary>
  );
}

export default function App() {
  useEffect(() => {
    preloadVoices();
  }, []);

  return (
    <>
      {/* Outside AuthGate so a stale sign-in screen can be updated too, and
          outside the app-wide boundary so a crash can still be fixed by
          taking the update. Neither banner reads app state. */}
      <div className="top-banners">
        <ErrorBoundary name="banners" fallback={() => null}>
          <UpdateBanner />
          <OfflineBanner />
        </ErrorBoundary>
      </div>
      <ErrorBoundary name="app" fallback={() => <AppCrashScreen />}>
        <AppProvider>
          <BrowserRouter>
            <AuthGate>
              <div className="app-shell">
                <BottomNav />
                <main className="page-content" role="main">
                  <AppRoutes />
                </main>
              </div>
            </AuthGate>
          </BrowserRouter>
        </AppProvider>
      </ErrorBoundary>
    </>
  );
}
