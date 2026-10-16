// src/pages/Dashboard.tsx
// lists your roadmaps + form to generate a new one
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiDeleteRoadmap,
  apiError,
  apiGenerateRoadmap,
  apiListRoadmaps,
  apiHealth,
  type RoadmapSummary,
} from "../services/api";

const Dashboard = () => {
  const navigate = useNavigate();

  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);
  const [aiProvider, setAiProvider] = useState<string>("…");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load the list + which ai provider the server is using
  const refresh = useCallback(async () => {
    try {
      const [list, health] = await Promise.all([apiListRoadmaps(), apiHealth()]);
      setRoadmaps(list);
      setAiProvider(health.aiProvider);
    } catch (err) {
      setError(apiError(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // generate a roadmap and jump straight into it
  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const roadmap = await apiGenerateRoadmap(topic.trim(), goal.trim());
      navigate(`/roadmap/${roadmap.id}`);
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  };

  // delete a roadmap after a confirm
  const handleDelete = async (r: RoadmapSummary) => {
    if (!window.confirm(`Delete "${r.title}"? This can't be undone.`)) return;
    try {
      await apiDeleteRoadmap(r.id);
      setRoadmaps((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="page-container">
      <h1>Your Learning Paths</h1>

      {/* new roadmap form */}
      <div className="setting-card">
        <h3>New roadmap</h3>
        <form onSubmit={handleGenerate} className="topic-form">
          <input
            type="text"
            placeholder="What do you want to learn? (e.g. Python, Photography)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy}
          />
          <input
            type="text"
            placeholder="Optional: a specific goal (e.g. build a website by December)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !topic.trim()}>
            {busy ? "Generating…" : "Create Learning Path"}
          </button>
        </form>
        <p className="api-info">AI provider: {aiProvider}</p>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {/* saved roadmaps */}
      <div className="roadmap-grid">
        {roadmaps.map((r) => {
          // progress percentage for the bar
          const pct = r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
          return (
            <div key={r.id} className="roadmap-card">
              <div className="roadmap-card-head">
                <h3>
                  <Link to={`/roadmap/${r.id}`}>{r.title}</Link>
                </h3>
                <button className="btn-danger" onClick={() => handleDelete(r)}>
                  Delete
                </button>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="api-info">
                {r.completed}/{r.total} cells complete · {pct}% · via {r.provider}
              </p>
            </div>
          );
        })}

        {roadmaps.length === 0 && !busy && (
          <p className="api-info">
            No roadmaps yet — create your first one above.
          </p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
