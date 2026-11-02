// src/components/Sidebar.tsx
// the app's side column: brand, nav, the active roadmaps list,
// a five-week activity calendar, and the account at the bottom

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, useAuth, type Activity, type RoadmapSummary } from "../services/api";
import { IconMap, IconGrid, IconSettings, IconChart, IconUsers, IconLayers, IconLogout } from "./icons";
import CourseSidebar from "./CourseSidebar";

// a stable color per roadmap topic, echoed as a small dot in the sidebar list
const dotHues = ["#2563eb", "#059669", "#b45309", "#7c3aed", "#0e7490", "#be123c"];
const dotColor = (name: string) => dotHues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % dotHues.length];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  // the lists refresh when the route changes (toggles and creates included)
  // admins are strictly admins: skip the learner data entirely
  const isAdmin = !!user?.isAdmin;
  // inside a roadmap the side column turns into the course panel
  const courseMatch = location.pathname.match(/^\/roadmap\/(\d+)(?:\/m\/(\d+))?/);
  useEffect(() => {
    if (isAdmin || courseMatch) return;
    api.listRoadmaps().then(setRoadmaps).catch(() => setRoadmaps([]));
    api.activity().then(setActivity).catch(() => setActivity(null));
  }, [location.pathname, isAdmin]);

  if (courseMatch) {
    return (
      <CourseSidebar
        roadmapId={Number(courseMatch[1])}
        activeIndex={courseMatch[2] !== undefined ? Number(courseMatch[2]) : null}
      />
    );
  }

  const signOut = async () => {
    await api.logout();
    setUser(null);
    navigate("/login");
  };

  // which roadmap page is open right now (for the active row highlight)
  const openId = Number(location.pathname.match(/\/roadmap\/(\d+)/)?.[1]);
  const onDashboard = location.pathname === "/";
  const onSettings = location.pathname === "/settings";

  // last 35 days as a 7-column week grid, oldest first
  const days: { key: string; count: number; today: boolean }[] = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  for (let i = 34; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: activity?.days?.[key] ?? 0, today: key === todayKey });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">F</span>
        <span className="brand-name">FOKUS</span>
      </div>

      <nav className="sidebar-nav">
        {!isAdmin && (
          <Link to="/" aria-current={onDashboard ? "page" : undefined}
                className={`side-link ${onDashboard ? "active" : ""}`}>
            <IconMap size={19} />
            <span>My roadmaps</span>
          </Link>
        )}
        {!isAdmin && (
          <Link to="/settings" aria-current={onSettings ? "page" : undefined}
                className={`side-link ${onSettings ? "active" : ""}`}>
            <IconSettings size={19} />
            <span>Settings</span>
          </Link>
        )}
        {isAdmin && (
          <>
            <Link to="/admin" aria-current={location.pathname === "/admin" ? "page" : undefined}
                  className={`side-link ${location.pathname === "/admin" ? "active" : ""}`}>
              <IconGrid size={19} />
              <span>Overview</span>
            </Link>
            <Link to="/admin/usage" aria-current={location.pathname === "/admin/usage" ? "page" : undefined}
                  className={`side-link ${location.pathname === "/admin/usage" ? "active" : ""}`}>
              <IconChart size={19} />
              <span>Usage & cost</span>
            </Link>
            <Link to="/admin/users" aria-current={location.pathname === "/admin/users" ? "page" : undefined}
                  className={`side-link ${location.pathname === "/admin/users" ? "active" : ""}`}>
              <IconUsers size={19} />
              <span>Users</span>
            </Link>
            <Link to="/admin/content" aria-current={location.pathname === "/admin/content" ? "page" : undefined}
                  className={`side-link ${location.pathname === "/admin/content" ? "active" : ""}`}>
              <IconLayers size={19} />
              <span>Content</span>
            </Link>
            <Link to="/settings" aria-current={onSettings ? "page" : undefined}
                  className={`side-link ${onSettings ? "active" : ""}`}>
              <IconSettings size={19} />
              <span>Settings</span>
            </Link>
          </>
        )}
      </nav>

      {!isAdmin && (<>
      <div className="side-section">
        <h4 className="side-title">Active roadmaps</h4>
        {roadmaps === null ? (
          <p className="side-empty">Loading...</p>
        ) : roadmaps.length === 0 ? (
          <p className="side-empty">Nothing yet, create one on the dashboard</p>
        ) : (
          <div className="side-roadmaps">
            {roadmaps.map((r) => (
              <Link key={r.id} to={`/roadmap/${r.id}`}
                    className={`side-roadmap ${openId === r.id ? "open" : ""}`}>
                <span className="side-roadmap-dot" style={{ background: dotColor(r.topic) }} aria-hidden="true" />
                <span className="side-roadmap-topic">{r.topic}</span>
                <span className={`side-roadmap-count ${r.done === r.total ? "complete" : ""}`}>
                  {r.done === r.total ? "done" : `${r.done}/${r.total}`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="side-section side-calendar">
        <h4 className="side-title">Activity</h4>
        <div className="cal-grid">
          {days.map((d) => (
            <span key={d.key}
                  title={`${d.key}: ${d.count} module${d.count === 1 ? "" : "s"} done`}
                  className={`cal-day lvl${Math.min(d.count, 3)} ${d.today ? "today" : ""}`} />
          ))}
        </div>
        <p className="side-week">
          {activity && activity.week > 0
            ? `${activity.week} module${activity.week === 1 ? "" : "s"} done this week`
            : "No completions this week yet"}
        </p>
      </div>
      </>)}

      <div className="sidebar-footer">
        {user && (
          <>
            <div className="side-user">
              <span className="side-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
              <span className="side-username">{user.username}</span>
            </div>
            <button className="side-signout" onClick={signOut}>
              <IconLogout size={16} />
              <span>Sign out</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
