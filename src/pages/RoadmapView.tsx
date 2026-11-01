// src/pages/RoadmapView.tsx
// one saved roadmap: the vertical module timeline. tapping a module opens
// its own page. everything is stored server-side by id, refreshes restore it.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Roadmap } from "../services/api";
import { IconBack, IconCheck, IconNext, IconTrash } from "../components/icons";

const RoadmapView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [missing, setMissing] = useState(false);

  // fetch the roadmap whenever the id in the url changes
  useEffect(() => {
    api.getRoadmap(Number(id))
      .then((r) => { setRoadmap(r); setMissing(false); })
      .catch(() => setMissing(true));
  }, [id]);

  const remove = async () => {
    if (!roadmap || !confirm("delete this roadmap?")) return;
    await api.deleteRoadmap(roadmap.id);
    navigate("/");
  };

  if (missing) {
    return (
      <div className="page">
        <h1 className="page-title">not found</h1>
        <p className="page-sub">this roadmap does not exist (or is not yours).</p>
        <Link to="/" className="btn-secondary">back to my roadmaps</Link>
      </div>
    );
  }

  if (!roadmap) {
    return <div className="page"><p className="loading">loading...</p></div>;
  }

  const doneCount = roadmap.modules.filter((m) => m.done).length;
  // the first module not yet done is "up next"
  const nextIndex = roadmap.modules.findIndex((x) => !x.done);

  return (
    <div className="roadmap-page">
      <div className="roadmap-header">
        <Link to="/" className="btn-ghost"><IconBack size={17} /> my roadmaps</Link>
        <div className="roadmap-heading">
          <h1>{roadmap.topic}</h1>
          <div className="roadmap-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(doneCount / roadmap.modules.length) * 100}%` }} />
            </div>
            <span>{doneCount} of {roadmap.modules.length} done</span>
          </div>
        </div>
        <button className="btn-danger-ghost" onClick={remove} title="delete roadmap">
          <IconTrash size={17} /> delete
        </button>
      </div>

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
              <span className="cell-name">{m.title}</span>
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
