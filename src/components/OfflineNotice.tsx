// src/components/OfflineNotice.tsx
// a thin strip that appears whenever the browser loses its connection,
// so saved copies do not look like broken pages. dismissable per outage.

import { useEffect, useState } from "react";

const OfflineNotice = () => {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const up = () => {
      setOffline(false);
      setDismissed(false); // a fresh outage shows the notice again
    };
    const down = () => setOffline(true);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (!offline || dismissed) return null;
  return (
    <div className="offline-notice" role="status">
      <span>Offline. Saved roadmaps still open; videos and new guides need a connection.</span>
      <button
        type="button"
        className="offline-close"
        aria-label="Dismiss the offline notice"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  );
};

export default OfflineNotice;
