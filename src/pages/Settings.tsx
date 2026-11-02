// src/pages/Settings.tsx
// account + data management (only real controls)

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useAuth, type AdminStats, type RoadmapSummary } from "../services/api";

const ago = (ts: number) => {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const Settings = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);
  const [cleared, setCleared] = useState(false);
  const [instance, setInstance] = useState<AdminStats | null>(null);

  useEffect(() => {
    api.listRoadmaps().then(setRoadmaps).catch(() => setRoadmaps([]));
    api.adminStats().then(setInstance).catch(() => setInstance(null));
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
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Your account and saved data for this demo.</p>

      <div className="settings-stack">
        {user?.isAdmin && (
          <div className="setting-card">
            <h3>Instance</h3>
            <p>Model: gpt-oss-20b via groq (free tier)</p>
            <p>Storage: sqlite on the gateway · public at gateway-hermes.tail62f36e.ts.net/fokus</p>
            <p>Backups: {instance?.dbInfo.path} ({instance?.dbInfo.sizeKb} KB, {instance?.dbInfo.roadmaps} roadmaps)</p>
            <p>Server uptime: {instance ? ago(instance.serverStarted) : "..."}</p>
            <p>Admins: {instance?.config.admins.join(", ") ?? "-"} · sessions {instance?.config.sessionDays ?? "-"} days · auth limit {instance?.config.authRateLimit ?? "-"}/hour · AI limit {instance?.config.aiPerWindow ?? "-"}/hour</p>
          </div>
        )}
        <div className="setting-card">
          <h3>Account</h3>
          <p>
            Signed in as <strong>{user?.username}</strong>
            {user && <> since {new Date(user.createdAt * 1000).toLocaleDateString()}</>}
          </p>
          <div className="card-actions">
            <button className="btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </div>

        {!user?.isAdmin && (
        <div className="setting-card">
          <h3>Data</h3>
          <p>
            {roadmaps === null
              ? "Loading..."
              : `${roadmaps.length} roadmap${roadmaps.length === 1 ? "" : "s"} saved on the server. They survive refreshes and sign outs.`}
            {cleared && " all cleared."}
          </p>
          <div className="card-actions">
            <button className="btn-danger" onClick={clearAll} disabled={!roadmaps || roadmaps.length === 0}>
              Delete all roadmaps
            </button>
          </div>
        </div>

        )}
        <div className="setting-card">
          <h3>About this demo</h3>
          <p>
            Roadmaps come from gpt-oss-20b on groq's free tier with Wikipedia research. Videos are real YouTube results verified per module; course links open live searches on Coursera, Udemy, Khan Academy and freeCodeCamp. Accounts, sessions and roadmaps live in sqlite on the gateway.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
