// src/pages/RoadmapView.tsx
// one saved roadmap: the vertical module timeline. tapping a module opens
// its own page. everything is stored server-side by id, refreshes restore it.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, useAuth, type Roadmap } from "../services/api";
import { offline, savedLabel } from "../services/offline";
import { IconBack, IconBookmark, IconCheck, IconNext, IconTrash } from "../components/icons";

const RoadmapView = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [missing, setMissing] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState<{ savedAt: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // fetch the roadmap whenever the id in the url changes; fall back to a saved copy
  useEffect(() => {
    const rid = Number(id);
    setFromCache(false);
    api.getRoadmap(rid)
      .then((r) => { setRoadmap(r); setMissing(false); })
      .catch(() => {
        const saved = offline.get(rid);
        if (saved) {
          setRoadmap(saved.roadmap);
          setMissing(false);
          setFromCache(true);
        } else {
          setMissing(true);
        }
      });
    const saved = offline.get(rid);
    setOfflineCopy(saved ? { savedAt: saved.savedAt } : null);
  }, [id]);

  const saveOffline = () => {
    if (!roadmap) return;
    offline.save(roadmap);
    setOfflineCopy({ savedAt: Date.now() });
  };

  const removeOffline = () => {
    if (!roadmap) return;
    offline.remove(roadmap.id);
    setOfflineCopy(null);
    if (fromCache) setMissing(true);
  };

  const remove = async () => {
    if (!roadmap || !confirm("Delete this roadmap?")) return;
    await api.deleteRoadmap(roadmap.id);
    navigate("/");
  };

  if (missing) {
    return (
      <div className="page">
        <h1 className="page-title">Not found</h1>
        <p className="page-sub">This roadmap does not exist (or is not yours).</p>
        <Link to="/" className="btn-secondary">Back to My roadmaps</Link>
      </div>
    );
  }

  if (!roadmap) {
    return <div className="page"><p className="loading">Loading...</p></div>;
  }

  const doneCount = roadmap.modules.filter((m) => m.done).length;
  // the first module not yet done is "up next"
  const nextIndex = roadmap.modules.findIndex((x) => !x.done);
  const allDone = doneCount === roadmap.modules.length && roadmap.modules.length > 0;
  // videos + course links collected across every module, once generated
  const resourceCount = roadmap.modules.reduce(
    (sum, m) => sum + (m.resources ? m.resources.videos.length + m.resources.links.length : 0), 0);

  return (
    <div className="roadmap-page">
      <div className="roadmap-header">
        <div className="roadmap-header-row">
          <Link to="/" className="btn-ghost"><IconBack size={17} /> My roadmaps</Link>
          <span className="roadmap-actions">
            {offlineCopy ? (
              <button className="btn-ghost action-icon" onClick={removeOffline} title="Remove the offline copy" aria-label="Remove the offline copy">
                <IconBookmark size={16} /><span className="action-text">Saved</span>
              </button>
            ) : (
              <button className="btn-ghost action-icon" onClick={saveOffline} title="Keep a copy of this roadmap on this device" aria-label="Save this roadmap offline">
                <IconBookmark size={16} /><span className="action-text">Save offline</span>
              </button>
            )}
            <button className="btn-danger-ghost action-icon" onClick={remove} title="Delete roadmap" aria-label="Delete this roadmap">
              <IconTrash size={17} /><span className="action-text">Delete</span>
            </button>
          </span>
        </div>
        <div className="roadmap-heading">
          <h1>{roadmap.topic}</h1>
          <div className="roadmap-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(doneCount / roadmap.modules.length) * 100}%` }} />
            </div>
            <span>{doneCount} of {roadmap.modules.length} done</span>
          </div>
        </div>
        <div className="roadmap-facts">
          <span className="fact">Started {new Date(roadmap.createdAt * 1000).toLocaleDateString()}</span>
          <span className="fact">{doneCount === roadmap.modules.length && roadmap.modules.length > 0
            ? "All modules complete"
            : nextIndex >= 0 ? `${roadmap.modules.length - doneCount} to go` : ""}</span>
          <span className="fact">{resourceCount > 0
            ? `${resourceCount} resource${resourceCount === 1 ? "" : "s"} linked`
            : "Resources generate as you open modules"}</span>
        </div>
        <div className="overview-cta">
          <Link
            to={`/roadmap/${roadmap.id}/m/${nextIndex >= 0 ? nextIndex : 0}`}
            className="btn-primary"
          >
            {allDone
              ? "Review from module 1"
              : `Continue with module ${nextIndex + 1} of ${roadmap.modules.length}`}
          </Link>
          <span className="overview-cta-note">
            {allDone ? "Every module is complete." : "Watch, read, check, then move on."}
          </span>
        </div>
      </div>

      {/* generation trace: engine internals, admin accounts only */}
      {user?.isAdmin && roadmap.trace && roadmap.traceTotals && (
        <div className="trace-panel">
          <button
            type="button"
            className="trace-toggle"
            aria-expanded={traceOpen}
            aria-controls="generation-trace"
            onClick={() => setTraceOpen(!traceOpen)}
          >
            <span className="trace-toggle-title">Generation trace</span>
            <span className="trace-toggle-meta">
              {roadmap.traceTotals.calls} LLM call{roadmap.traceTotals.calls === 1 ? "" : "s"}
              {" · "}{roadmap.traceTotals.tokens.toLocaleString()} tokens
              {" · "}{roadmap.traceTotals.tps} tok/s
            </span>
            <span className="trace-caret" aria-hidden="true">{traceOpen ? "▾" : "▸"}</span>
          </button>
          {traceOpen && (
            <div id="generation-trace" className="trace-body">
              {roadmap.trace.agents.map((a) => (
                <div key={a.agent} className="trace-agent">
                  <span className="trace-agent-name">
                    {a.agent.charAt(0).toUpperCase() + a.agent.slice(1)}
                  </span>
                  <span className="trace-agent-ms">{a.ms} ms</span>
                  <span className="trace-agent-detail">
                    {a.calls.length === 0
                      ? "No LLM calls (tool only)"
                      : a.calls.map((c, i) => (
                          <span key={i} className="trace-call">
                            {c.prompt_tokens.toLocaleString()} in + {c.completion_tokens.toLocaleString()} out
                            {" · "}{c.tps} tok/s{" · "}{c.ms} ms
                          </span>
                        ))}
                  </span>
                </div>
              ))}
              <div className="trace-total">
                <span>total</span>
                <span>
                  {roadmap.traceTotals.calls} call{roadmap.traceTotals.calls === 1 ? "" : "s"} · {roadmap.traceTotals.tokens.toLocaleString()} tokens
                  {" · "}{roadmap.traceTotals.ms} ms · {roadmap.traceTotals.tps} tok/s
                  {" · ≈ $" + roadmap.traceTotals.cost_usd.toFixed(4)}
                </span>
              </div>
              <p className="trace-note">
                Pipeline: Researcher (Wikipedia) builds a source pack, Builder writes the modules for that topic,
                Validator enforces the contract and rebuilds once if short. Costs use indicative
                Groq pricing; the demo itself runs on the free tier.
              </p>
            </div>
          )}
        </div>
      )}

      {fromCache && (
        <p className="offline-banner">
          Offline copy from {offlineCopy ? savedLabel(offlineCopy.savedAt) : "this device"}.
          Videos, quizzes and new modules need a connection.
        </p>
      )}

      <div className="timeline">
        {roadmap.modules.map((m, index) => (
          <Link
            key={index}
            to={`/roadmap/${roadmap.id}/m/${index}`}
            className={`timeline-row ${m.done ? "done" : ""} ${index === nextIndex ? "next" : ""}`}
          >
            <span className={`cell-step cell-${(index % 8) + 1}`}>
              {m.done ? <IconCheck size={16} /> : String(index + 1).padStart(2, "0")}
            </span>
            <span className={`timeline-card cell-${(index % 8) + 1}`}>
              <span className="cell-head">
                <span className="cell-name">{m.title}</span>
                {m.done ? (
                  <span className="row-state done">Done</span>
                ) : index === nextIndex ? (
                  <span className="row-state next">Up next</span>
                ) : null}
              </span>
              <span className="cell-desc">{m.content}</span>
            </span>
            <IconNext className="row-open" size={17} />
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RoadmapView;
