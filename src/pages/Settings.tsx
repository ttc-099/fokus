// src/pages/Settings.tsx
import { useAuth } from "../context/AuthContext";
import { apiHealth } from "../services/api";
import { useEffect, useState } from "react";

const Settings = () => {
  const { user } = useAuth();
  const [aiProvider, setAiProvider] = useState<string>("…");

  // show which ai provider the server is running with
  useEffect(() => {
    apiHealth()
      .then((h) => setAiProvider(h.aiProvider))
      .catch(() => setAiProvider("unavailable"));
  }, []);

  return (
    <div className="page-container">
      <h1>Settings</h1>
      <p>Configure your application settings here.</p>

      <div className="setting-card">
        <h3>Account</h3>
        <p>Signed in as <strong>{user?.name ?? user?.email}</strong> ({user?.email}).</p>
        <p className="api-info">
          Your roadmaps are saved to your account and available on any device you log in from.
        </p>
      </div>

      <div className="setting-card">
        <h3>AI Provider</h3>
        <p>
          Currently generating with: <strong>{aiProvider}</strong>
        </p>
        <p className="api-info">
          Set AI_PROVIDER, AI_API_KEY, AI_BASE_URL and AI_MODEL in server/.env to
          switch between offline templates, OpenAI, or Hugging Face.
        </p>
      </div>

      <div className="setting-card">
        <h3>Appearance</h3>
        <p>Customize the look and feel of the application</p>
        <div className="theme-options">
          <button className="theme-btn">Light</button>
          <button className="theme-btn active">Dark</button>
          <button className="theme-btn">Auto</button>
        </div>
      </div>

      <div className="setting-card">
        <h3>Data & Storage</h3>
        <p>Manage your learning paths and application data</p>
        <div className="storage-actions">
          <button>Export Data</button>
          <button>Clear History</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
