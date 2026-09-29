import { useEffect, useState } from "react";
import { getTodayString } from "../utils/dateHelpers";

// Today's local day key, refreshed when the app comes back into view. A PWA
// left open overnight otherwise keeps showing yesterday (CRITICAL_REVIEW.md §28).
export function useToday() {
  const [today, setToday] = useState(getTodayString);
  useEffect(() => {
    const refresh = () => setToday(getTodayString());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}
