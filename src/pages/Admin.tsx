// src/pages/Admin.tsx
// admin dashboard: instance-wide stats on users, roadmaps and llm usage.
// admin-only route; everyone else bounces to the dashboard.

import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useAuth, type AdminRoadmapRow, type AdminStats, type AdminUser } from "../services/api";

const ago = (ts: number | null) => {
  if (!ts) return "-";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const hues = ["#2563eb", "#059669", "#b45309", "#7c3aed", "#0e7490", "#be123c"];
const chipBg = (name: string) => hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];

const Admin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [content, setContent] = useState<AdminRoadmapRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"new" | "progress" | "owner">("new");
  const [openUser, setOpenUser] = useState<string | null>(null);
  const userDays = (u: { username: string }) => users?.find((x) => x.username === u.username)?.days ?? {};
  const [error, setError] = useState(false);
  const tab = useParams().tab ?? "overview";
  useEffect(() => {
    if (tab === "users" && !users) api.adminUsers().then(setUsers).catch(() => setError(true));
    if ((tab === "content" || tab === "users") && !content) api.adminRoadmaps().then(setContent).catch(() => setError(true));
  }, [tab, users, content]);

  useEffect(() => {
    if (user && !user.isAdmin) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.adminStats().then(setStats).catch(() => setError(true));
  }, []);

  if (!user?.isAdmin) return null;

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Admin</h1>
        <p className="page-sub">Could not load stats. Try again in a moment.</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="page"><p className="loading">Loading...</p></div>;
  }

  // tallest bar drives the chart scale, 1 as the floor
  const peak = Math.max(1, ...stats.series.map((d) => d.roadmaps));
  let filtered = (content ?? []).filter((r) =>
    !query || r.topic.toLowerCase().includes(query.toLowerCase())
    || r.owner.toLowerCase().includes(query.toLowerCase()));
  if (sort === "progress") filtered = [...filtered].sort((a, b) => b.done - a.done);
  else if (sort === "owner") filtered = [...filtered].sort((a, b) => a.owner.localeCompare(b.owner));
  const tokPeak = Math.max(1, ...(stats?.tokenSeries ?? []).map((d) => d.tokens));

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">
          {tab === "overview" ? "Overview" : tab === "usage" ? "Usage & cost"
            : tab === "users" ? "Users" : "Content"}
        </h1>
        <p className="page-sub">
          {tab === "overview" ? "Instance-wide stats across FOKUS."
            : tab === "usage" ? "Model usage from stored generation traces. The demo runs on groq's free tier; costs are indicative."
            : tab === "users" ? "Every account on this instance. Read-only."
            : "Every roadmap generated on this instance."}
        </p>
      </div>

      {tab === "overview" && stats && (
      <>
      <p className="admin-hero">
        <strong>{stats.roadmaps}</strong> roadmaps · <strong>{stats.users}</strong> learners
        {stats.newUsersWeek > 0 && <> · <strong>{stats.newUsersWeek}</strong> new this week</>}
        {stats.lastCreated && <> · last created {ago(stats.lastCreated)}</>}
      </p>
      <p className="admin-health">
        Avg generation {Math.round(stats.avgGenMs / 100) / 10}s per roadmap · gate rejected {stats.gateRejections} nonsense topics · db {stats.dbInfo.sizeKb} KB
      </p>

      <div className="admin-stats" role="list" aria-label="Instance stats">
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">{stats.users}</span>
          <span className="admin-stat-l">users{stats.newUsersWeek > 0 ? ` (+${stats.newUsersWeek} this week)` : ""}</span>
        </div>
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">{stats.roadmaps}</span>
          <span className="admin-stat-l">roadmaps generated</span>
        </div>
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">{stats.modulesDone}</span>
          <span className="admin-stat-l">modules completed of {stats.modules} · {stats.completionRate}%</span>
        </div>
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">{stats.activeWeek}</span>
          <span className="admin-stat-l">active learners this week</span>
        </div>
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">{stats.gateRejections}</span>
          <span className="admin-stat-l">nonsense topics rejected</span>
        </div>
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">{stats.llm.tokens.toLocaleString()}</span>
          <span className="admin-stat-l">tokens used</span>
        </div>
        <div className="admin-stat" role="listitem">
          <span className="admin-stat-n">${stats.llm.costUsd.toFixed(4)}</span>
          <span className="admin-stat-l">estimated spend</span>
        </div>
      </div>

      {tab === "overview" && stats && (
      <section className="setting-card" aria-label="Roadmaps per day">
        <h3>Roadmaps per day</h3>
        <div className="admin-chart">
          {stats.series.map((d) => (
            <div key={d.day} className="admin-bar-col"
                 title={`${d.day}: ${d.roadmaps} roadmap${d.roadmaps === 1 ? "" : "s"}`}>
              <span className="admin-bar-count">{d.roadmaps > 0 ? d.roadmaps : ""}</span>
              <span className="admin-bar-track"><span className="admin-bar" style={{ height: `${(d.roadmaps / peak) * 100}%` }} /></span>
            </div>
          ))}
        </div>
        <div className="admin-chart-dates" aria-hidden="true"><span>{stats.series[0].day.slice(5)}</span><span>{stats.series[stats.series.length - 1].day.slice(5)}</span></div>
        <p className="admin-chart-sub">Roadmaps generated, last 14 days</p>
      </section>
      )}
      </>
      )}

      {tab === "usage" && stats && (
        <>
          <div className="admin-stats" role="list" aria-label="Usage stats">
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{stats.llm.calls}</span>
              <span className="admin-stat-l">LLM calls</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{stats.llm.tokens.toLocaleString()}</span>
              <span className="admin-stat-l">tokens</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{stats.llm.tps}</span>
              <span className="admin-stat-l">tok/s average</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">${stats.llm.costUsd.toFixed(4)}</span>
              <span className="admin-stat-l">estimated spend</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{stats.gateRejections}</span>
              <span className="admin-stat-l">nonsense topics rejected</span>
            </div>
          </div>
          <section className="setting-card" aria-label="Usage trend">
            <h3>Roadmaps per day</h3>
            <div className="admin-chart">
              {stats.series.map((d) => (
                <div key={d.day} className="admin-bar-col"
                     title={`${d.day}: ${d.roadmaps} roadmap${d.roadmaps === 1 ? "" : "s"}`}>
                  <span className="admin-bar-count">{d.roadmaps > 0 ? d.roadmaps : ""}</span>
                  <span className="admin-bar-track">
                    <span className="admin-bar" style={{ height: `${(d.roadmaps / peak) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="admin-chart-dates" aria-hidden="true">
              <span>{stats.series[0].day.slice(5)}</span>
              <span>{stats.series[stats.series.length - 1].day.slice(5)}</span>
            </div>
            <p className="admin-chart-sub">Generation volume, last 14 days</p>
          </section>
          <section className="setting-card" aria-label="Tokens per day">
            <h3>Tokens per day</h3>
            <div className="admin-chart">
              {stats.tokenSeries.map((d) => (
                <div key={d.day} className="admin-bar-col" title={`${d.day}: ${d.tokens.toLocaleString()} tokens`}>
                  <span className="admin-bar-count">{d.tokens > 0 ? (d.tokens > 999 ? `${Math.round(d.tokens / 100) / 10}k` : d.tokens) : ""}</span>
                  <span className="admin-bar-track">
                    <span className="admin-bar" style={{ height: `${(d.tokens / tokPeak) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="admin-chart-dates" aria-hidden="true">
              <span>{stats.tokenSeries[0]?.day.slice(5)}</span>
              <span>{stats.tokenSeries[stats.tokenSeries.length - 1]?.day.slice(5)}</span>
            </div>
            <p className="admin-chart-sub">
              {stats.llm.costUsd > 0
                ? `If this pace keeps up: ≈ $${stats.monthCost.toFixed(2)} a month`
                : "Tokens are still on groq's free tier, so spend stays at zero."}
            </p>
          </section>
          <section className="setting-card" aria-label="Models">
            <h3>Models</h3>
            <table className="admin-table admin-db">
              <thead><tr><th>Model</th><th>Calls</th><th>Tokens</th><th>Tok/s</th><th>Est cost</th></tr></thead>
              <tbody>
                {stats.models.map((m) => (
                  <tr key={m.model}>
                    <td>{m.model}</td><td>{m.calls}</td>
                    <td>{m.tokens.toLocaleString()}</td><td>{m.tps}</td><td>${m.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="admin-columns">
            <section className="setting-card" aria-label="Agent averages">
              <h3>Agent averages</h3>
              <table className="admin-table">
                <thead><tr><th>Agent</th><th>Avg wall time</th></tr></thead>
                <tbody>
                  {Object.entries(stats.agentAverages).map(([a, ms]) => (
                    <tr key={a}><td>{a}</td><td>{ms} ms</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="setting-card" aria-label="Slowest generations">
              <h3>Slowest generations</h3>
              {stats.slowest.length === 0 ? <p className="side-empty">No traced generations yet.</p> : (
                <table className="admin-table">
                  <thead><tr><th>Topic</th><th>Time</th><th>Tokens</th></tr></thead>
                  <tbody>
                    {stats.slowest.map((x, i) => (
                      <tr key={i}><td>{x.topic}</td><td>{(x.ms / 1000).toFixed(1)}s</td><td>{x.tokens.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}

      {tab === "users" && (
        <>
        {users && users.length > 0 && (
          <div className="admin-stats" role="list" aria-label="User stats">
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{users.length}</span>
              <span className="admin-stat-l">accounts</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">
                {users.filter((u) => u.lastActive && Date.now() / 1000 - u.lastActive < 86400).length}
              </span>
              <span className="admin-stat-l">active today</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">
                {users.filter((u) => u.lastActive && Date.now() / 1000 - u.lastActive > 7 * 86400).length}
              </span>
              <span className="admin-stat-l">quiet over a week</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">
                {users.reduce((a, u) => a + u.roadmaps, 0)}
              </span>
              <span className="admin-stat-l">roadmaps across accounts</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">
                {(users.reduce((a, u) => a + u.roadmaps, 0) / Math.max(1, users.length)).toFixed(1)}
              </span>
              <span className="admin-stat-l">roadmaps per learner</span>
            </div>
          </div>
        )}
        <section className="setting-card" aria-label="All users">
          {users === null ? <p className="loading">Loading...</p> : users.length === 0 ? (
            <p className="side-empty">No accounts yet.</p>
          ) : (
            <table className="admin-table admin-db">
              <thead>
                <tr><th>Username</th><th>Roadmaps</th><th>Modules done</th><th>Latest topic</th><th>Last active</th></tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const fresh = Date.now() / 1000 - u.joined < 7 * 86400;
                  const today = u.lastActive && Date.now() / 1000 - u.lastActive < 86400;
                  const quiet = u.lastActive && Date.now() / 1000 - u.lastActive > 7 * 86400;
                  return (
                  <Fragment key={u.username}>
                  <tr className="admin-user-row" onClick={() => setOpenUser(openUser === u.username ? null : u.username)}>
                    <td>
                      <span className="admin-owner-chip" style={{ background: chipBg(u.username), color: "#fff" }} aria-hidden="true">
                        {u.username.slice(0, 2).toUpperCase()}
                      </span>{" "}
                      {u.username}
                      {fresh && <span className="row-chip">New</span>}
                      {today && <span className="row-chip ok">Active today</span>}
                      {quiet && <span className="row-chip warn">Quiet</span>}
                    </td>
                    <td>{u.roadmaps}</td>
                    <td>{u.done}</td>
                    <td>{u.lastTopic ?? "-"}</td>
                    <td>{ago(u.lastActive)}</td>
                  </tr>
                  {openUser === u.username && (
                    <tr className="admin-user-detail"><td colSpan={5}>
                      <div className="cal-grid admin-user-cal">
                        {Array.from({ length: 35 }, (_, i) => {
                          const d = new Date();
                          d.setDate(d.getDate() - (34 - i));
                          const key = d.toISOString().slice(0, 10);
                          const n = userDays(u)[key] ?? 0;
                          return <span key={key} title={`${key}: ${n} done`}
                                       className={`cal-day lvl${Math.min(n, 3)} ${key === new Date().toISOString().slice(0, 10) ? "today" : ""}`} />;
                        })}
                      </div>
                      <p className="admin-chart-sub">Their roadmaps: {(content ?? []).filter((r) => r.owner === u.username).map((r) => `${r.topic} (${r.done}/${r.total})`).join(" · ") || "None"}</p>
                    </td></tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        </>
      )}

      {tab === "content" && (
        <>
        {content && content.length > 0 && (
          <div className="admin-stats" role="list" aria-label="Content stats">
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{content.length}</span>
              <span className="admin-stat-l">roadmaps</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{content.reduce((a, r) => a + r.total, 0)}</span>
              <span className="admin-stat-l">modules generated</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{Math.round(100 * content.reduce((a, r) => a + r.done, 0) / Math.max(1, content.reduce((a, r) => a + r.total, 0)))}%</span>
              <span className="admin-stat-l">modules completed</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{content.filter((r) => r.hasResources).length}</span>
              <span className="admin-stat-l">with videos &amp; courses</span>
            </div>
            <div className="admin-stat" role="listitem">
              <span className="admin-stat-n">{content.filter((r) => r.done === 0).length}</span>
              <span className="admin-stat-l">never started</span>
            </div>
          </div>
        )}
        <section className="setting-card" aria-label="All roadmaps">
          <div className="admin-toolbar">
            <input
              className="admin-search"
              placeholder="Filter by topic or owner"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter roadmaps"
            />
            <select className="admin-search" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
                    aria-label="Sort roadmaps">
              <option value="new">Newest</option>
              <option value="progress">Most progressed</option>
              <option value="owner">By owner</option>
            </select>
            <button className="btn-secondary" onClick={() => {
              const rows = [["Topic", "Owner", "Done", "Total", "Created", "Gen seconds", "Tokens"],
                ...filtered.map((r) => [r.topic, r.owner, String(r.done), String(r.total),
                  new Date(r.created * 1000).toISOString().slice(0, 10),
                  r.genMs ? (r.genMs / 1000).toFixed(1) : "-", r.tokens ? String(r.tokens) : "-"])];
              const csv = rows.map((x) => x.map((c) => `"${c}"`).join(",")).join("\n");
              const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              const a = document.createElement("a");
              a.href = url; a.download = "fokus-content.csv"; a.click();
              URL.revokeObjectURL(url);
            }}>Export CSV</button>
          </div>
          {content === null ? <p className="loading">Loading...</p> : filtered.length === 0 ? (
            <p className="side-empty">No roadmaps match.</p>
          ) : (
            <table className="admin-table admin-db">
              <thead>
                <tr><th>Topic</th><th>Owner</th><th>Progress</th><th>Videos</th><th>Tokens</th><th>Gen time</th><th>Created</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.topic}</td>
                    <td>{r.owner}</td>
                    <td>
                      <span className="seg-bar admin-seg" aria-label={`${r.done} of ${r.total} done`}>
                        {Array.from({ length: r.total }, (_, k) => (
                          <span key={k} className={`seg ${k < r.done ? "on" : ""}`} />
                        ))}
                      </span>
                    </td>
                    <td>{r.hasResources ? "Yes" : "No"}</td>
                    <td>{r.tokens != null ? r.tokens.toLocaleString() : "-"}</td>
                    <td>{r.genMs ? `${(r.genMs / 1000).toFixed(1)}s` : "-"}</td>
                    <td>{new Date(r.created * 1000).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </section>
        </>
      )}

      {tab === "overview" && stats && (
      <section className="setting-card" aria-label="Recent roadmaps">
        <h3>Recent roadmaps</h3>
        {stats.recent.length === 0 ? (
          <p className="side-empty">Nothing generated yet.</p>
        ) : (
          <ul className="admin-recent">
            {stats.recent.map((r, i) => (
              <li key={i}>
                <span className="admin-owner-chip" aria-hidden="true">{r.owner.slice(0, 2).toUpperCase()}</span>
                <span className="admin-recent-topic">{r.topic}</span>
                <span className="admin-recent-owner">by {r.owner}</span>
                <span className="admin-recent-progress">{r.done}/{r.total} done</span>
                <span className="admin-recent-age">{new Date(r.created * 1000).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
};

export default Admin;
