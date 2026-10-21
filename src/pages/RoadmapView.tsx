// src/pages/RoadmapView.tsx
// the original cell-based ui, now backed by real saved data
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import WhiteInfoBox from "../components/WhiteInfoBox";
import DarkenUI from "../components/DarkenUI";
import {
  apiCellDetail,
  apiError,
  apiGetRoadmap,
  apiToggleCell,
  type Roadmap,
} from "../services/api";

const RoadmapView = () => {
  const { id } = useParams();
  const roadmapId = Number(id);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCellId, setActiveCellId] = useState<number | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [expandedCell, setExpandedCell] = useState<number | null>(null);

  // load the roadmap from the server
  const load = useCallback(async () => {
    try {
      setRoadmap(await apiGetRoadmap(roadmapId));
    } catch (err) {
      setError(apiError(err));
    }
  }, [roadmapId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="page-container">
        <h1>Roadmap</h1>
        <p className="auth-error">{error}</p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="page-container">
        <p className="api-info">Loading…</p>
      </div>
    );
  }

  // the cell currently open in the info box
  const activeCell = roadmap.cells.find((c) => c.id === activeCellId) ?? null;
  const completed = roadmap.cells.filter((c) => c.completed).length;
  const total = roadmap.cells.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // open a cell: show summary, generate detail on first open
  const openCell = async (cellId: number) => {
    setActiveCellId(cellId);
    const cell = roadmap.cells.find((c) => c.id === cellId);
    if (!cell || cell.detail) return;

    setDetailBusy(true);
    try {
      const updated = await apiCellDetail(roadmapId, cellId);
      // merge the returned cell into the local copy
      setRoadmap((prev) =>
        prev
          ? {
              ...prev,
              cells: prev.cells.map((c) => (c.id === updated.id ? updated : c)),
            }
          : prev,
      );
    } catch (err) {
      setError(apiError(err));
    } finally {
      setDetailBusy(false);
    }
  };

  // toggle a cell's completed flag
  const toggleCell = async (cellId: number) => {
    const cell = roadmap.cells.find((c) => c.id === cellId);
    if (!cell) return;
    try {
      const updated = await apiToggleCell(roadmapId, cellId, !cell.completed);
      setRoadmap((prev) =>
        prev
          ? {
              ...prev,
              cells: prev.cells.map((c) => (c.id === updated.id ? updated : c)),
            }
          : prev,
      );
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="app-container">
      <DarkenUI isActive={activeCell !== null} onClick={() => setActiveCellId(null)} />

      <WhiteInfoBox isOpen={activeCell !== null}>
        {activeCell && (
          <>
            <div className="cell-modal-head">
              <span className="cell-number">
                {activeCell.order.toString().padStart(2, "0")}
              </span>
              <h2>{activeCell.title}</h2>
            </div>
            <p>{activeCell.detail ?? activeCell.summary}</p>
            {detailBusy && <div className="content-loading">Generating detailed content…</div>}

            <div className="cell-modal-actions">
              <button onClick={() => toggleCell(activeCell.id)}>
                {activeCell.completed ? "Mark as not done" : "Mark as done"}
              </button>
              <button className="btn-ghost" onClick={() => setActiveCellId(null)}>
                Close
              </button>
            </div>
          </>
        )}
      </WhiteInfoBox>

      {/* roadmap header + progress */}
      <div className="topic-input-container">
        <Link to="/" className="back-link">← All roadmaps</Link>
        <h2 className="roadmap-heading">{roadmap.title}</h2>
        {roadmap.goal && <p className="api-info">Goal: {roadmap.goal}</p>}
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="api-info">
          {completed}/{total} cells complete · {pct}% · via {roadmap.provider}
        </p>
      </div>

      {/* the horizontal cells */}
      <div className="main-content">
        <div className="cells-connector"></div>
        <div className="cells-scroll-container">
          <div className="cells-container">
            {roadmap.cells.map((cell, index) => (
              <div
                key={cell.id}
                className={`cell cell-${index + 1} ${expandedCell === index ? "expanded" : ""} ${cell.completed ? "completed" : ""}`}
                onClick={() => openCell(cell.id)}
                onMouseEnter={() => setExpandedCell(index)}
                onMouseLeave={() => setExpandedCell(null)}
              >
                <div className="cell-header">
                  <span className="cell-number">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <h3 className="cell-title">{cell.title}</h3>
                  {cell.completed && <span className="cell-done-mark">✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoadmapView;
