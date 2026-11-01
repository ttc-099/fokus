// src/components/Sidebar.tsx
// the app's side column: brand, nav sections, account at the bottom

import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, useAuth } from "../services/api";
import { IconGrid, IconSettings, IconLogout } from "./icons";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const signOut = async () => {
    await api.logout();
    setUser(null);
    navigate("/login");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">F</span>
        <span className="brand-name">FOKUS</span>
      </div>

      <nav className="sidebar-nav">
        <Link to="/" className={`side-link ${location.pathname === "/" ? "active" : ""}`}>
          <IconGrid size={19} />
          <span>my roadmaps</span>
        </Link>
        <Link to="/settings" className={`side-link ${location.pathname === "/settings" ? "active" : ""}`}>
          <IconSettings size={19} />
          <span>settings</span>
        </Link>
      </nav>

      <div className="sidebar-footer">
        {user && (
          <>
            <div className="side-user">
              <span className="side-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
              <span className="side-username">{user.username}</span>
            </div>
            <button className="side-signout" onClick={signOut}>
              <IconLogout size={16} />
              <span>sign out</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
