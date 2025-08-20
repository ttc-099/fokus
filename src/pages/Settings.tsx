// src/pages/Settings.tsx
const Settings = () => {
  return (
    <div className="page-container">
      <h1>Settings</h1>
      <p>Configure your application settings here.</p>
  
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