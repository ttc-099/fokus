// src/pages/ModuleView.tsx
// a full page for one module: study guide formatted into sections,
// videos, courses, mark-as-done, and prev/next navigation

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Roadmap, type SourceLink } from "../services/api";
import {
  IconBack, IconCheck, IconExternal, IconNext, IconPlay,
} from "../components/icons";

// guides render as free-form prose: paragraphs only, no headings or lists
const ProseGuide = ({ text }: { text: string }) => (
  <div className="guide-body">
    {text.split(/\n+/).map((line, i) => {
      const t = line.trim();
      // "Sources:" lines are rendered separately from structured data
      if (!t || /^sources?:/i.test(t)) return null;
      return <p key={i}>{t}</p>;
    })}
  </div>
);

const ModuleView = () => {
  const { id, index: indexParam } = useParams();
  const index = Number(indexParam);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [missing, setMissing] = useState(false);
  const [detailPending, setDetailPending] = useState(false);
  const [resPending, setResPending] = useState(false);

  const load = () => {
    api.getRoadmap(Number(id))
      .then((r) => { setRoadmap(r); setMissing(false); })
      .catch(() => setMissing(true));
  };

  // fetch the page data, then lazily fill in guide + resources
  useEffect(() => { setRoadmap(null); load(); /* eslint-disable-next-line */ }, [id, indexParam]);

  useEffect(() => {
    if (!roadmap || index < 0 || index >= roadmap.modules.length) return;
    const m = roadmap.modules[index];
    let cancelled = false;
    (async () => {
      // modules from the bullet/section era lack the prose format (v2):
      // regenerate those; original free-form texts stay untouched
      const hasProse = !!m.detail?.v || !!m.fullContent;
      if (!hasProse) {
        setDetailPending(true);
        try { if (!cancelled) setRoadmap(await api.moduleDetail(roadmap.id, index)); } catch { /* keep old */ }
        finally { if (!cancelled) setDetailPending(false); }
      }
      if (!m.resources) {
        setResPending(true);
        try { if (!cancelled) setRoadmap(await api.moduleResources(roadmap.id, index)); } catch { /* keep old */ }
        finally { if (!cancelled) setResPending(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [roadmap?.id, indexParam]); // eslint-disable-line

  if (missing) {
    return (
      <div className="page">
        <h1 className="page-title">not found</h1>
        <p className="page-sub">this module does not exist.</p>
        <Link to="/" className="btn-secondary">back to my roadmaps</Link>
      </div>
    );
  }

  if (!roadmap || index < 0 || index >= roadmap.modules.length) {
    return <div className="page"><p className="loading">loading...</p></div>;
  }

  const m = roadmap.modules[index];
  const total = roadmap.modules.length;
  const doneCount = roadmap.modules.filter((x) => x.done).length;

  const toggle = async () => {
    // optimistic flip, server call, refetch on failure
    setRoadmap({
      ...roadmap,
      modules: roadmap.modules.map((x, i) => (i === index ? { ...x, done: !x.done } : x)),
    });
    try {
      setRoadmap(await api.toggleModule(roadmap.id, index));
    } catch {
      load();
    }
  };

  const sources: SourceLink[] = m.detail?.sources ?? [];
  const hasVideos = (m.resources?.videos?.length ?? 0) > 0;

  return (
    <div className="module-page">
      <div className="module-topbar">
        <Link to={`/roadmap/${roadmap.id}`} className="btn-ghost"><IconBack size={17} /> {roadmap.topic}</Link>
        <span className="module-count">module {index + 1} of {total} · {doneCount} done</span>
      </div>

      <div className={`module-hero cell-${(index % 8) + 1} ${m.done ? "is-done" : ""}`}>
        <span className="module-hero-step">{m.done ? <IconCheck size={18} /> : String(index + 1).padStart(2, "0")}</span>
        <h1>{m.title}</h1>
        <p>{m.content}</p>
      </div>

      <section className="section-card">
        <h3>study guide</h3>
        {detailPending && <p className="content-loading">writing your study guide...</p>}
        {m.detail?.v === 2 && m.detail.content ? (
          <>
            <ProseGuide text={m.detail.content} />
            {sources.length > 0 && (
              <>
                <h4>sources</h4>
                <div className="sources-list">
                  {sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title} <IconExternal size={13} />
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        ) : m.fullContent ? (
          <ProseGuide text={m.fullContent} />
        ) : !detailPending ? (
          <p className="content-loading">open this module again to load the guide</p>
        ) : null}
      </section>

      <section className="section-card">
        <h3>videos</h3>
        {resPending && <p className="content-loading">finding videos...</p>}
        {m.resources ? (
          hasVideos ? (
            <>
              <div className="video-embed video-embed-page">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${m.resources.videos[0].id}`}
                  title={m.resources.videos[0].title}
                  loading="lazy"
                  allowFullScreen
                />
              </div>
              {m.resources.videos.slice(1).map((v) => (
                <a key={v.id} className="video-row" href={`https://www.youtube.com/watch?v=${v.id}`}
                   target="_blank" rel="noopener noreferrer" title={`${v.title} — ${v.channel}`}>
                  <span className="video-row-title"><IconPlay size={13} /> {v.title}</span>
                  <span className="video-row-channel">{v.channel}</span>
                </a>
              ))}
            </>
          ) : !resPending ? <p className="content-loading">no videos found for this module</p> : null
        ) : !resPending ? <p className="content-loading">videos load the first time you open a module</p> : null}
      </section>

      <section className="section-card">
        <h3>courses</h3>
        {m.resources ? (
          <div className="link-list link-list-page">
            {m.resources.links.map((l) => (
              <a key={l.url} className="course-row" href={l.url} target="_blank" rel="noopener noreferrer" title={l.name}>
                <span className="course-platform">{l.platform}</span>
                <span className="course-name">{l.name}</span>
                <IconExternal size={14} />
              </a>
            ))}
          </div>
        ) : (
          <p className="content-loading">{resPending ? "finding courses..." : "loading..."}</p>
        )}
      </section>

      <div className="module-actions">
        <button className={m.done ? "btn-secondary" : "btn-primary"} onClick={toggle}>
          <IconCheck size={17} />
          {m.done ? "done — tap to undo" : "mark as done"}
        </button>
      </div>

      <div className="prevnext">
        {index > 0 ? (
          <Link to={`/roadmap/${roadmap.id}/m/${index - 1}`} className="prevnext-btn">
            <IconBack size={15} />
            <span className="prevnext-text">
              <span className="prevnext-word">previous</span>
              <span className="prevnext-label">{roadmap.modules[index - 1].title}</span>
            </span>
          </Link>
        ) : <span />}
        {index < total - 1 ? (
          <Link to={`/roadmap/${roadmap.id}/m/${index + 1}`} className="prevnext-btn prevnext-next">
            <span className="prevnext-text">
              <span className="prevnext-word">next</span>
              <span className="prevnext-label">{roadmap.modules[index + 1].title}</span>
            </span>
            <IconNext size={15} />
          </Link>
        ) : <span />}
      </div>
    </div>
  );
};

export default ModuleView;
