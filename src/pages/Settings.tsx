// src/pages/Settings.tsx
// account + data management (only real controls)

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useAuth, type RoadmapSummary } from "../services/api";

const Settings = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    api.listRoadmaps().then(setRoadmaps).catch(() => setRoadmaps([]));
  }, []);

  const signOut = async () => {
    await api.logout();
    setUser(null);
    navigate("/login");
  };

  const clearAll = async () => {
    if (!roadmaps || !confirm(`delete all ${roadmaps.length} roadmaps? this cannot be undone.`)) return;
    for (const r of roadmaps) {
      await api.deleteRoadmap(r.id);
    }
    setRoadmaps([]);
    setCleared(true);
  };

  return (
    <div className="page">
      <h1 className="page-title">settings</h1>
      <p className="page-sub">your account and saved data for this demo.</p>

      <div className="settings-stack">
        <div className="setting-card">
          <h3>account</h3>
          <p>
            signed in as <strong>{user?.username}</strong>
            {user && <> since {new Date(user.createdAt * 1000).toLocaleDateString()}</>}
          </p>
          <div className="card-actions">
            <button className="btn-secondary" onClick={signOut}>sign out</button>
          </div>
        </div>

        <div className="setting-card">
          <h3>data</h3>
          <p>
            {roadmaps === null
              ? "loading..."
              : `${roadmaps.length} roadmap${roadmaps.length === 1 ? "" : "s"} saved on the server. they survive refreshes and sign outs.`}
            {cleared && " all cleared."}
          </p>
          <div className="card-actions">
            <button className="btn-danger" onClick={clearAll} disabled={!roadmaps || roadmaps.length === 0}>
              delete all roadmaps
            </button>
          </div>
        </div>

        <div className="setting-card">
          <h3>about this demo</h3>
          <p>
            roadmaps come from gpt-oss-20b on groq's free tier with wikipedia research.
            videos are real youtube results verified per module; course links open live
            searches on coursera, udemy, khan academy and freecodecamp. accounts,
            sessions and roadmaps live in sqlite on the gateway.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
