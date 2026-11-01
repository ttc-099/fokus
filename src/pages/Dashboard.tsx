// src/pages/Dashboard.tsx
// home: greeting, create a new roadmap, continue your saved ones

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, useAuth, type RoadmapSummary } from "../services/api";
import { IconPlus, IconTrash } from "../components/icons";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  // set when the topic gate rejects the input
  const [gate, setGate] = useState<{ message: string; suggestions: string[] } | null>(null);

  // load the saved list once on mount
  useEffect(() => {
    api.listRoadmaps().then(setRoadmaps).catch(() => setRoadmaps([]));
  }, []);

  const createWith = async (topicToUse: string) => {
    setError("");
    setGate(null);
    setCreating(true);
    try {
      const roadmap = await api.createRoadmap(topicToUse);
      navigate(`/roadmap/${roadmap.id}`);
    } catch (err) {
      // refusals with suggestions open the did-you-mean panel
      const suggestions = (err as Error & { suggestions?: string[] }).suggestions;
      if (Array.isArray(suggestions)) {
        setGate({
          message: err instanceof Error ? err.message : "that topic didn't pass the check",
          suggestions,
        });
      } else {
        setError(err instanceof Error ? err.message : "generation failed");
      }
      setCreating(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // gate first: block key spam before it costs an ai call
    try {
      const check = await api.validateTopic(topic.trim());
      if (!check.ok) {
        setGate({ message: "that doesn't look like a real topic", suggestions: check.suggestions });
        return;
      }
    } catch {
      // gate unavailable: let the create endpoint decide
    }
    await createWith(topic.trim());
  };

  const remove = async (e: React.MouseEvent, id: number) => {
    // stop the card click from firing when only deleting
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("delete this roadmap?")) return;
    await api.deleteRoadmap(id);
    setRoadmaps((rs) => (rs ? rs.filter((r) => r.id !== id) : rs));
  };

  const doneTotal = roadmaps?.reduce((sum, r) => sum + r.done, 0) ?? 0;
  const moduleTotal = roadmaps?.reduce((sum, r) => sum + r.total, 0) ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">hello{user ? `, ${user.username}` : ""}</h1>
          <p className="page-sub">
            {roadmaps === null
              ? "..."
              : roadmaps.length === 0
                ? "start your first learning roadmap below"
                : `${roadmaps.length} roadmap${roadmaps.length === 1 ? "" : "s"} · ${doneTotal} of ${moduleTotal} modules done`}
          </p>
        </div>
      </div>

      <div className="create-card">
        <form className="new-roadmap-form" onSubmit={create}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="what do you want to learn?"
            disabled={creating}
            aria-label="topic to learn"
          />
          <button type="submit" className="btn-primary" disabled={creating || topic.trim().length < 2}>
            <IconPlus size={17} />
            {creating ? "generating..." : "new roadmap"}
          </button>
        </form>
        {creating && <p className="hint">the ai researches your topic and builds 8 modules, this takes a few seconds</p>}
        {error && <p className="error-text">{error}</p>}

        {gate && (
          <div className="gate-panel" role="alertdialog" aria-label="topic check">
            <p className="gate-title">{gate.message}</p>
            {gate.suggestions.length > 0 ? (
              <>
                <p className="gate-sub">did you mean any of these?</p>
                <div className="gate-chips">
                  {gate.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="gate-chip"
                      disabled={creating}
                      onClick={() => { setTopic(s); createWith(s); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="gate-sub">try typing a real topic, like &quot;python&quot; or &quot;cooking&quot;</p>
            )}
            <button type="button" className="gate-cancel" onClick={() => setGate(null)}>
              cancel
            </button>
          </div>
        )}
      </div>

      {roadmaps === null ? (
        <p className="hint loading">loading...</p>
      ) : roadmaps.length === 0 && !creating ? (
        <div className="empty-state">
          <p>nothing here yet.</p>
          <p>type a topic above, anything from "python" to "pottery", and the ai builds a path with videos and courses.</p>
        </div>
      ) : (
        <div className="roadmaps-grid">
          {roadmaps.map((r) => (
            <Link to={`/roadmap/${r.id}`} className="roadmap-card" key={r.id}>
              <div className="roadmap-card-top">
                <h3>{r.topic}</h3>
                <button className="icon-btn" onClick={(e) => remove(e, r.id)} title="delete roadmap" aria-label={`delete ${r.topic}`}>
                  <IconTrash size={16} />
                </button>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(r.done / r.total) * 100}%` }} />
              </div>
              <div className="roadmap-card-meta">
                <span>{r.done}/{r.total} modules</span>
                <span>{new Date(r.createdAt * 1000).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
