// src/components/Navigation.tsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <nav className="navigation">
      <div className="nav-logo">FOKUS</div>
      <div className="nav-links">
        <Link
          to="/"
          className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
        >
          Dashboard
        </Link>
        <Link
          to="/settings"
          className={`nav-link ${location.pathname === "/settings" ? "active" : ""}`}
        >
          Settings
        </Link>
      </div>

      {/* account area: name + logout, or a login link */}
      <div className="nav-auth">
        {user ? (
          <>
            <span className="nav-user">{user.name ?? user.email}</span>
            <button
              className="btn-ghost"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <Link to="/login" className="nav-link">
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
