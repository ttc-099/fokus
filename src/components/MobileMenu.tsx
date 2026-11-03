// src/components/MobileMenu.tsx
// the phone chrome: a three-line button top left that opens the sections
// and sign out, since the side column is hidden on a narrow screen

import { useEffect, useState, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../services/api";
import { signOut } from "../services/session";
import {
  IconMap, IconGrid, IconSettings, IconChart, IconUsers, IconLayers,
  IconLogout, IconMenu, IconClose,
} from "./icons";

type NavItem = { to: string; label: string; icon: ReactElement; exact?: boolean };

const learnerNav: NavItem[] = [
  { to: "/", label: "My roadmaps", icon: <IconMap size={19} />, exact: true },
  { to: "/settings", label: "Settings", icon: <IconSettings size={19} /> },
];

const adminNav: NavItem[] = [
  { to: "/admin", label: "Overview", icon: <IconGrid size={19} />, exact: true },
  { to: "/admin/usage", label: "Usage & cost", icon: <IconChart size={19} /> },
  { to: "/admin/users", label: "Users", icon: <IconUsers size={19} /> },
  { to: "/admin/content", label: "Content", icon: <IconLayers size={19} /> },
  { to: "/settings", label: "Settings", icon: <IconSettings size={19} /> },
];

const MobileMenu = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);

  // any navigation closes the drawer, so it never floats over a new page
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // escape closes it too, and the page must not scroll behind the drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const items = user?.isAdmin ? adminNav : learnerNav;
  const isActive = (item: NavItem) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  const doSignOut = async () => {
    await signOut(setUser);
    navigate("/login", { replace: true });
  };

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label="Open the menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <IconMenu size={22} />
        </button>
        <span className="brand-mark">F</span>
        <span className="brand-name">FOKUS</span>
      </div>

      {open && (
        <div className="sheet-wrap">
          <button className="sheet-backdrop" aria-label="Close the menu"
                  onClick={() => setOpen(false)} />
          <aside className="sheet" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="sheet-head">
              <span className="sheet-brand">
                <span className="brand-mark">F</span>
                <span className="brand-name">FOKUS</span>
              </span>
              <button type="button" className="sheet-close" aria-label="Close the menu"
                      onClick={() => setOpen(false)}>
                <IconClose size={20} />
              </button>
            </div>

            <nav className="sheet-nav">
              {items.map((item) => (
                <Link key={item.to} to={item.to}
                      aria-current={isActive(item) ? "page" : undefined}
                      className={`sheet-link ${isActive(item) ? "active" : ""}`}>
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="sheet-foot">
              {user && (
                <>
                  <div className="side-user">
                    <span className="side-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
                    <span className="side-username">{user.username}</span>
                  </div>
                  <button className="side-signout" onClick={doSignOut}>
                    <IconLogout size={16} />
                    <span>Sign out</span>
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default MobileMenu;
