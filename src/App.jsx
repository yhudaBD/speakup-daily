import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { AppProvider } from "./context/AppContext";
import { preloadVoices } from "./utils/speechVoice";
import AuthGate from "./components/AuthGate";
import { ErrorBoundary, AppCrashScreen, RouteErrorBoundary } from "./components/ErrorBoundary";
import BottomNav from "./components/layout/BottomNav";
import OfflineBanner from "./components/layout/OfflineBanner";
import BetaAccessBanner from "./components/layout/BetaAccessBanner";
import CloudSyncBanner from "./components/layout/CloudSyncBanner";
import UpdateBanner from "./components/layout/UpdateBanner";
import PageSkeleton from "./components/layout/PageSkeleton";
import Home from "./pages/Home";
import { lazyPage } from "./utils/lazyPage";
import "./index.css";

// Every page but Home loads when it's first opened (CRITICAL_REVIEW.md §39),
// so the first screen doesn't wait for all of them.
const Practice = lazyPage(() => import("./pages/Practice"));
const ClozePractice = lazyPage(() => import("./pages/ClozePractice"));
const RolePlay = lazyPage(() => import("./pages/RolePlay"));
const Progress = lazyPage(() => import("./pages/Progress"));
const Settings = lazyPage(() => import("./pages/Settings"));
const PlacementTest = lazyPage(() => import("./pages/PlacementTest"));
const BaselineRecording = lazyPage(() => import("./pages/BaselineRecording"));

// Keyed by path, so navigating away from a page that crashed gives the
// next page a fresh boundary.
function AppRoutes() {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/practice/cloze" element={<ClozePractice />} />
          <Route path="/roleplay" element={<RolePlay />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/placement" element={<PlacementTest />} />
          <Route path="/baseline" element={<BaselineRecording />} />
        </Routes>
      </Suspense>
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
          taking the update. None of the banners reads app state. */}
      <div className="top-banners">
        <ErrorBoundary name="banners" fallback={() => null}>
          <UpdateBanner />
          <OfflineBanner />
          <BetaAccessBanner />
          <CloudSyncBanner />
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
