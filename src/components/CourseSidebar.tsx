// src/components/CourseSidebar.tsx
// inside a roadmap the side column becomes a course tree: the main topic,
// then the reading topic of each module (book), with the open module's
// videos and its quiz listed under it, each with a type icon.

import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Roadmap } from "../services/api";
import { IconCheck, IconMap, IconPlay, IconQuiz, IconSettings } from "./icons";

const CourseSidebar = ({ roadmapId, activeIndex }: { roadmapId: number; activeIndex: number | null }) => {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [open, setOpen] = useState(false); // mobile: outline expanded?

  // refetch when the module changes, and whenever the page generates
  // a guide, videos or a quiz for the open module
  useEffect(() => {
    const reload = () => api.getRoadmap(roadmapId).then(setRoadmap).catch(() => null);
    reload();
    window.addEventListener("fokus:roadmap-updated", reload);
    return () => window.removeEventListener("fokus:roadmap-updated", reload);
  }, [roadmapId, activeIndex]);

  const total = roadmap?.modules.length ?? 0;
  const done = roadmap ? roadmap.modules.filter((m) => m.done).length : 0;

  return (
    <aside className="sidebar course-side">
      <div className="course-head">
        <Link to="/" className="side-link"><IconMap size={17} /><span>My roadmaps</span></Link>
      </div>

      {/* mobile only: one bar that opens the outline */}
      <button className="course-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="course-toggle-topic">{roadmap?.topic ?? "Course"}</span>
        <span className="course-toggle-count">{done}/{total} · Contents</span>
      </button>

      <div className="course-tree">
        {/* the main topic is the parent item */}
        <div className="course-topic-row">
          <span className="course-topic-name">{roadmap?.topic ?? "Loading..."}</span>
          <span className="course-topic-count">{done}/{total}</span>
        </div>
        <div className="course-bar-wrap">
          <div className="progress-bar course-bar">
            <div className="progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>

        <nav className={`course-modules ${open ? "open" : ""}`} aria-label="Course contents">
          {roadmap?.modules.map((m, i) => (
            <Fragment key={i}>
              <Link
                to={`/roadmap/${roadmapId}/m/${i}`}
                aria-current={i === activeIndex ? "page" : undefined}
                className={`course-sub ${m.done ? "done" : ""} ${i === activeIndex ? "current" : ""}`}
                onClick={() => setOpen(false)}
              >
                <span className="course-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="course-sub-title">{m.title}</span>
                {m.done ? <span className="course-sub-check"><IconCheck size={12} /></span> : null}
              </Link>

              {/* videos and the quiz of the module you are in */}
              {i === activeIndex && (
                <>
                  {(m.resources?.videos ?? []).slice(0, 2).map((v) => (
                    <a
                      key={v.id}
                      className="course-item"
                      href={`https://www.youtube.com/watch?v=${v.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${v.title} — ${v.channel}`}
                    >
                      <span className="course-ico video"><IconPlay size={9} /></span>
                      <span className="course-item-title">{v.title}</span>
                    </a>
                  ))}
                  {m.quiz && (
                    <Link
                      className="course-item"
                      to={`/roadmap/${roadmapId}/m/${i}#check`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="course-ico quiz"><IconQuiz size={10} /></span>
                      <span className="course-item-title">Quiz: {m.title}</span>
                    </Link>
                  )}
                </>
              )}
            </Fragment>
          ))}
        </nav>
      </div>

      <div className="course-footer">
        <Link to="/settings" className="side-link"><IconSettings size={16} /><span>Settings</span></Link>
      </div>
    </aside>
  );
};

export default CourseSidebar;
