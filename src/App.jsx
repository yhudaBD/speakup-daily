import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { AppProvider } from "./context/AppContext";
import { preloadVoices } from "./utils/speechVoice";
import BottomNav from "./components/layout/BottomNav";
import Home from "./pages/Home";
import Practice from "./pages/Practice";
import RolePlay from "./pages/RolePlay";
import Progress from "./pages/Progress";
import Settings from "./pages/Settings";
import "./index.css";

export default function App() {
  useEffect(() => {
    preloadVoices();
  }, []);

  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app-shell">
          <BottomNav />
          <main className="page-content" role="main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/practice" element={<Practice />} />
              <Route path="/roleplay" element={<RolePlay />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
