// src/pages/Dashboard.tsx
// home: greeting, create a new roadmap, continue your saved ones

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, useAuth, type RoadmapSummary } from "../services/api";
import { IconPlus, IconTrash } from "../components/icons";
import { offline } from "../services/offline";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  // set when the topic gate rejects the input
  const [gate, setGate] = useState<{ message: string; suggestions: string[] } | null>(null);

  // load the saved list once on mount; fall back to offline copies
  const [offlineOnly, setOfflineOnly] = useState(false);
  useEffect(() => {
    api.listRoadmaps()
      .then((list) => { setRoadmaps(list); setOfflineOnly(false); })
      .catch(() => {
        const saved = offline.list();
        setRoadmaps(saved.map(({ roadmap: r }) => ({
          id: r.id, topic: r.topic, createdAt: r.createdAt,
          total: r.modules.length,
          done: r.modules.filter((m) => m.done).length,
          next: r.modules.find((m) => !m.done)?.title ?? null,
        })));
        setOfflineOnly(true);
      });
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

  // the roadmap to resume: one that's started but unfinished beats one never opened
  const resume = roadmaps?.find((r) => r.done > 0 && r.done < r.total)
    ?? roadmaps?.find((r) => r.done < r.total) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hello{user ? `, ${user.username}` : ""}</h1>
          <p className="page-sub">
            {roadmaps === null
              ? "..."
              : roadmaps.length === 0
                ? "start your first learning roadmap below"
                : `${roadmaps.length} roadmap${roadmaps.length === 1 ? "" : "s"} · ${doneTotal} of ${moduleTotal} modules done`}
          </p>
        </div>
      </div>

      {resume && (
        <div className="continue-card">
          <div className="continue-info">
            <p className="continue-label">Continue learning</p>
            <h2 className="continue-topic">{resume.topic}</h2>
            <p className="continue-next">Next: {resume.next}</p>
          </div>
          <div className="continue-side">
            <span className="continue-progress">{resume.done}/{resume.total} done</span>
            <Link to={`/roadmap/${resume.id}`} className="btn-primary">Resume</Link>
          </div>
        </div>
      )}

      {offlineOnly && (
        <p className="offline-banner">
          You are offline. Showing the roadmaps saved on this device; creating new ones needs a connection.
        </p>
      )}

      <div className="create-card">
        <form className="new-roadmap-form" onSubmit={create}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What do you want to learn?"
            disabled={creating}
            aria-label="Topic to learn"
          />
          <button type="submit" className="btn-primary" disabled={creating || topic.trim().length < 2}>
            <IconPlus size={17} />
            {creating ? "Generating..." : "New roadmap"}
          </button>
        </form>
        {topic.trim() === "" && !creating && (
          <div className="try-row">
            <span className="try-label">Try:</span>
            {["watercolor painting", "guitar basics", "chess openings", "sourdough baking"].map((s) => (
              <button key={s} type="button" className="try-chip" onClick={() => setTopic(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {creating && <p className="hint" role="status" aria-live="polite">The AI researches your topic and builds 8 modules, this takes a few seconds</p>}
        {error && <p className="error-text">{error}</p>}

        {gate && (
          <div className="gate-panel" role="alertdialog" aria-label="topic check">
            <p className="gate-title">{gate.message}</p>
            {gate.suggestions.length > 0 ? (
              <>
                <p className="gate-sub">Did you mean any of these?</p>
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
              <p className="gate-sub">Try typing a real topic, like &quot;python&quot; or &quot;cooking&quot;</p>
            )}
            <button type="button" className="gate-Cancel" onClick={() => setGate(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {roadmaps === null ? (
        <p className="hint loading">loading...</p>
      ) : roadmaps.length === 0 && !creating ? (
        <div className="empty-state">
          <p>Nothing here yet.</p>
          <p>Type a topic above, anything from "python" to "pottery", and the AI builds a path with videos and courses.</p>
        </div>
      ) : (
        <div className="roadmaps-grid">
          {roadmaps.map((r) => (
            <Link to={`/roadmap/${r.id}`} className="roadmap-card" key={r.id}>
              <div className="roadmap-card-top">
                <h3>{r.topic}</h3>
                <button className="icon-btn" onClick={(e) => remove(e, r.id)} title="Delete roadmap" aria-label={`delete ${r.topic}`}>
                  <IconTrash size={16} />
                </button>
              </div>
              {/* one segment per module: filled when done, echoes the timeline */}
              <div className="seg-bar" aria-label={`${r.done} of ${r.total} modules done`}>
                {Array.from({ length: r.total }, (_, i) => (
                  <span key={i} className={`seg ${i < r.done ? "on" : ""}`} />
                ))}
              </div>
              <div className="roadmap-card-meta">
                <span>{r.done}/{r.total} modules</span>
                <span>{new Date(r.createdAt * 1000).toLocaleDateString()}</span>
              </div>
              {r.next
                ? <p className="roadmap-next">Next: {r.next}</p>
                : <p className="roadmap-next done">All modules done</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
