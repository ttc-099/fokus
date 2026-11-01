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
import { api, AuthContext, type User } from "./services/api";
import "./index.css";

function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    // avoid flashing the login page to someone with a live session
    return <div className="boot-splash"><p className="loading">loading...</p></div>;
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="roadmap/:id" element={<RoadmapView />} />
          <Route path="roadmap/:id/m/:index" element={<ModuleView />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthContext.Provider>
  );
}

export default App;
