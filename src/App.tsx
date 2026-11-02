// src/App.tsx
// routes + auth gate: check the session once, then show the right pages

import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RoadmapView from "./pages/RoadmapView";
import ModuleView from "./pages/ModuleView";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Landing from "./pages/Landing";
import { api, AuthContext, type User } from "./services/api";
import { cachedUser } from "./services/offline";
import "./index.css";

function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me()
      .then((u) => {
        setUser(u);
        if (u) cachedUser.save(u);
      })
      .catch(() => {
        // offline: keep the last signed-in identity rather than bouncing to the landing page
        setUser(cachedUser.read());
      });
  }, []);

  if (user === undefined) {
    // avoid flashing the login page to someone with a live session
    return <div className="boot-splash"><p className="loading">Loading...</p></div>;
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        {/* signed out, the front door is the publicity landing page */}
        <Route path="/" element={user ? <Layout /> : <Landing />}>
          {/* admins are strictly admins: their home is the admin dashboard */}
          <Route index element={user?.isAdmin ? <Admin /> : <Dashboard />} />
          <Route path="roadmap/:id" element={user?.isAdmin ? <Navigate to="/admin" replace /> : <RoadmapView />} />
          <Route path="admin/:tab?" element={<Admin />} />
          <Route path="roadmap/:id/m/:index" element={user?.isAdmin ? <Navigate to="/admin" replace /> : <ModuleView />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthContext.Provider>
  );
}

export default App;
