// src/components/Navigation.tsx
import { Link, useLocation } from "react-router-dom";

const Navigation = () => {
  const location = useLocation();
  
  return (
    <nav className="navigation">
      <div className="nav-logo">Cell Based UI</div>
      <div className="nav-links">
        <Link 
          to="/" 
          className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
        >
          Learning Path
        </Link>
        <Link 
          to="/new-page" 
          className={`nav-link ${location.pathname === "/new-page" ? "active" : ""}`}
        >
          New Page
        </Link>
        <Link 
          to="/settings" 
          className={`nav-link ${location.pathname === "/settings" ? "active" : ""}`}
        >
          Settings
        </Link>
      </div>
    </nav>
  );
};

export default Navigation;