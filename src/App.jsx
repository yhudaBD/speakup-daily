import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { AppProvider } from "./context/AppContext";
import { preloadVoices } from "./utils/speechVoice";
import AuthGate from "./components/AuthGate";
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

export default function App() {
  useEffect(() => {
    preloadVoices();
  }, []);

  return (
    <AppProvider>
      {/* Outside AuthGate so a stale sign-in screen can be updated too. */}
      <div className="top-banners">
        <UpdateBanner />
        <OfflineBanner />
      </div>
      <BrowserRouter>
        <AuthGate>
          <div className="app-shell">
            <BottomNav />
            <main className="page-content" role="main">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/practice" element={<Practice />} />
                <Route path="/practice/cloze" element={<ClozePractice />} />
                <Route path="/roleplay" element={<RolePlay />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/placement" element={<PlacementTest />} />
              </Routes>
            </main>
          </div>
        </AuthGate>
      </BrowserRouter>
    </AppProvider>
  );
}
