// src/pages/ModuleView.tsx
// one module as a guided player: watch the video, read the guide,
// pass the short check, then continue to the next module.

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, type Roadmap, type SourceLink } from "../services/api";
import { offline } from "../services/offline";
import {
  IconBack, IconCheck, IconExternal, IconNext, IconPlay, IconAlert,
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
  const navigate = useNavigate();
  const { hash } = useLocation();

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [missing, setMissing] = useState(false);
  const [detailPending, setDetailPending] = useState(false);
  const [resPending, setResPending] = useState(false);

  // the check state for this module
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);

  // nudge the course sidebar when guides, videos or quiz state change
  const refreshSidebar = () => window.dispatchEvent(new Event("fokus:roadmap-updated"));

  const load = () => {
    const rid = Number(id);
    api.getRoadmap(rid)
      .then((r) => { setRoadmap(r); setMissing(false); setOfflineMode(false); })
      .catch(() => {
        const saved = offline.get(rid);
        if (saved) {
          setRoadmap(saved.roadmap);
          setMissing(false);
          setOfflineMode(true);
        } else {
          setMissing(true);
        }
      });
  };

  // fetch the page data, then lazily fill in guide + resources
  useEffect(() => { setRoadmap(null); load(); /* eslint-disable-next-line */ }, [id, indexParam]);

  // every module opens with a clean check
  useEffect(() => { setAnswers([]); setSubmitted(false); setQuizError(""); }, [indexParam]);

  useEffect(() => {
    if (!roadmap || offlineMode || index < 0 || index >= roadmap.modules.length) return;
    const m = roadmap.modules[index];
    let cancelled = false;
    (async () => {
      // modules from the bullet/section era lack the prose format (v2):
      // regenerate those; original free-form texts stay untouched
      const hasProse = !!m.detail?.v || !!m.fullContent;
      if (!hasProse) {
        setDetailPending(true);
        try { if (!cancelled) { setRoadmap(await api.moduleDetail(roadmap.id, index)); refreshSidebar(); } } catch { /* keep old */ }
        finally { if (!cancelled) setDetailPending(false); }
      }
      if (!m.resources) {
        setResPending(true);
        try { if (!cancelled) { setRoadmap(await api.moduleResources(roadmap.id, index)); refreshSidebar(); } } catch { /* keep old */ }
        finally { if (!cancelled) setResPending(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [roadmap?.id, indexParam]); // eslint-disable-line

  useEffect(() => {
    if (hash !== "#check") return;
    const el = document.getElementById("check");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, roadmap?.id, indexParam]);

  if (missing) {
    return (
      <div className="page">
        <h1 className="page-title">Not found</h1>
        <p className="page-sub">This module does not exist.</p>
        <Link to="/" className="btn-secondary">Back to my roadmaps</Link>
      </div>
    );
  }

  if (!roadmap || index < 0 || index >= roadmap.modules.length) {
    return <div className="page"><p className="loading">loading...</p></div>;
  }

  const m = roadmap.modules[index];
  const total = roadmap.modules.length;
  const doneCount = roadmap.modules.filter((x) => x.done).length;
  const isLast = index === total - 1;

  const toggle = async () => {
    // optimistic flip, server call, refetch on failure
    setRoadmap({
      ...roadmap,
      modules: roadmap.modules.map((x, i) => (i === index ? { ...x, done: !x.done } : x)),
    });
    try {
      setRoadmap(await api.toggleModule(roadmap.id, index));
      refreshSidebar();
    } catch {
      load();
    }
  };

  // one tap: mark done if needed, then move to the next module
  const completeAndContinue = async () => {
    if (!m.done) {
      try { await api.toggleModule(roadmap.id, index); } catch { load(); return; }
    }
    if (!isLast) {
      navigate(`/roadmap/${roadmap.id}/m/${index + 1}`);
    } else {
      navigate(`/roadmap/${roadmap.id}`);
    }
  };

  const startQuiz = async () => {
    setQuizError("");
    setQuizLoading(true);
    try {
      const r = await api.moduleQuiz(roadmap.id, index);
      setRoadmap(r);
      refreshSidebar();
      setAnswers([]);
      setSubmitted(false);
    } catch {
      setQuizError("The check could not load right now. You can still continue.");
    } finally {
      setQuizLoading(false);
    }
  };

  const quiz = m.quiz;
  const score = quiz ? quiz.questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0) : 0;
  // the number of questions is set per module, so the pass mark travels with the quiz
  const passMark = quiz ? (quiz.pass ?? Math.max(2, Math.ceil(quiz.questions.length * 2 / 3))) : 0;
  const quizPassed = !!quiz && submitted && score >= passMark;
  const allAnswered = quiz ? quiz.questions.every((_, i) => answers[i] !== undefined) : false;
  // the check gates continuing, unless it could not be generated
  const canContinue = !quiz || quizPassed || !!quizError;

  const sources: SourceLink[] = m.detail?.sources ?? [];
  const hasVideos = (m.resources?.videos?.length ?? 0) > 0;
  const video0 = m.resources?.videos?.[0];

  return (
    <div className="module-page">
      <div className="module-topbar">
        <Link to={`/roadmap/${roadmap.id}`} className="btn-ghost"><IconBack size={17} /> {roadmap.topic}</Link>
        <span className="module-count">Module {index + 1} of {total} · {doneCount} done</span>
      </div>

      {offlineMode && (
        <p className="offline-banner">
          Offline copy. Guides already saved read fine; videos, checks and new guides need a connection.
        </p>
      )}

      <div className={`module-hero cell-${(index % 8) + 1} ${m.done ? "is-done" : ""}`}>
        <span className="module-hero-step">{m.done ? <IconCheck size={18} /> : String(index + 1).padStart(2, "0")}</span>
        <h1>{m.title}</h1>
        <p>{m.content}</p>
      </div>

      <div className="module-steps">
        {m.resources?.videos?.length ? <span className="module-step">1 Watch</span> : null}
        <span className="module-step">{m.resources?.videos?.length ? 2 : 1} Read</span>
        <span className="module-step">{m.resources?.videos?.length ? 3 : 2} Check</span>
      </div>

      <section className="section-card">
        <h3><span className="step-badge">1</span> Watch</h3>
        {resPending && !m.resources && <p className="content-loading">Finding videos...</p>}
        {m.resources ? (
          hasVideos && video0 ? (
            <>
              <div className="video-embed video-embed-page">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${video0.id}`}
                  title={video0.title}
                  loading="lazy"
                  allowFullScreen
                />
              </div>
              <p className="video-title-line">{video0.title}</p>
              {m.resources.videos.slice(1).map((v) => (
                <a key={v.id} className="video-row" href={`https://www.youtube.com/watch?v=${v.id}`}
                   target="_blank" rel="noopener noreferrer" title={`${v.title} — ${v.channel}`}>
                  <span className="video-row-title"><IconPlay size={13} /> {v.title}</span>
                  <span className="video-row-channel">{v.channel}</span>
                </a>
              ))}
            </>
          ) : !resPending ? <p className="content-loading">No videos found for this module, read on below.</p> : null
        ) : !resPending ? <p className="content-loading">Videos load the first time you open a module</p> : null}
      </section>

      <section className="section-card">
        <h3><span className="step-badge">2</span> Read</h3>
        {detailPending && <p className="content-loading">Writing your study guide...</p>}
        {m.detail?.v === 2 && m.detail.content ? (
          <>
            <ProseGuide text={m.detail.content} />
            {sources.length > 0 && (
              <>
                <h4>Sources</h4>
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
          <p className="content-loading">Open this module again to load the guide</p>
        ) : null}
        {m.resources && m.resources.links.length > 0 && (
          <>
            <h4>Courses to go deeper</h4>
            <div className="link-list link-list-page">
              {m.resources.links.map((l) => (
                <a key={l.url} className="course-row" href={l.url} target="_blank" rel="noopener noreferrer" title={l.name}>
                  <span className="course-platform">{l.platform}</span>
                  <span className="course-name">{l.name}</span>
                  <IconExternal size={14} />
                </a>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="section-card" id="check">
        <h3><span className="step-badge">3</span> Check</h3>
        {!quiz && !quizLoading && (
          <>
            <p className="quiz-intro">
              A short check on what this module covered, a few questions, some asking you to use
              the idea rather than recall it. Pass two thirds and the next module unlocks.
            </p>
            <button className="btn-primary" onClick={startQuiz}>Start the check</button>
            {quizError && <p className="quiz-error"><IconAlert size={15} /> {quizError}</p>}
          </>
        )}

        {quizLoading && <p className="content-loading">Writing your questions...</p>}

        {quiz && (
          <div className="quiz-block">
            {quiz.questions.map((q, qi) => (
              <div key={qi} className="quiz-question">
                <p className="quiz-q-text">{qi + 1}. {q.q}</p>
                {q.kind && q.kind !== "recall" && (
                  <span className={`quiz-kind ${q.kind}`}>
                    {q.kind === "apply" ? "Applying it" : "Common mistake"}
                  </span>
                )}
                <div className="quiz-options">
                  {q.options.map((opt, oi) => {
                    const picked = answers[qi] === oi;
                    const correct = submitted && oi === q.answer;
                    const wrong = submitted && picked && oi !== q.answer;
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={submitted}
                        className={`quiz-opt ${picked ? "picked" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                        onClick={() => {
                          const next = [...answers];
                          next[qi] = oi;
                          setAnswers(next);
                        }}
                      >
                        <span className="quiz-opt-letter">{"ABCD"[oi]}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {submitted && (
                  <p className={`quiz-why ${answers[qi] === q.answer ? "ok" : ""}`}>
                    {answers[qi] === q.answer ? "Correct. " : `Not quite, it's ${"ABCD"[q.answer]}. `}
                    {q.why}
                  </p>
                )}
              </div>
            ))}

            {!submitted ? (
              <button className="btn-primary" disabled={!allAnswered} onClick={() => setSubmitted(true)}>
                Check my answers
              </button>
            ) : (
              <div className="quiz-result">
                <p className={quizPassed ? "quiz-score ok" : "quiz-score"}>
                  {score} of {quiz.questions.length} correct.
                  {quizPassed
                    ? " The next module is unlocked below."
                    : ` ${passMark} needed to pass, try once more.`}
                </p>
                {!quizPassed && (
                  <button className="btn-secondary" onClick={() => { setAnswers([]); setSubmitted(false); }}>
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="module-actions">
        <button
          className={m.done ? "btn-secondary" : "btn-primary"}
          onClick={completeAndContinue}
          disabled={!m.done && !canContinue}
        >
          <IconCheck size={17} />
          {m.done
            ? (isLast ? "Back to the roadmap" : "Continue to next module")
            : (isLast ? "Complete this module" : "Complete and continue")}
        </button>
        {m.done && (
          <button className="btn-ghost small-undo" onClick={toggle}>Mark as not done</button>
        )}
        {!canContinue && !m.done && (
          <p className="complete-hint">Pass the check above to unlock continuing.</p>
        )}
      </div>

      <div className="prevnext">
        {index > 0 ? (
          <Link to={`/roadmap/${roadmap.id}/m/${index - 1}`} className="prevnext-btn">
            <IconBack size={15} />
            <span className="prevnext-text">
              <span className="prevnext-word">Previous</span>
              <span className="prevnext-label">{roadmap.modules[index - 1].title}</span>
            </span>
          </Link>
        ) : <span />}
        {!isLast ? (
          <Link to={`/roadmap/${roadmap.id}/m/${index + 1}`} className="prevnext-btn prevnext-next">
            <span className="prevnext-text">
              <span className="prevnext-word">Next</span>
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
