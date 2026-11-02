// src/components/Layout.tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import OfflineNotice from './OfflineNotice'

const Layout = () => {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar />
      <div className="mobile-topbar">
        <span className="brand-mark">F</span>
        <span className="brand-name">FOKUS</span>
      </div>
      <main className="main-canvas" id="main">
        <OfflineNotice />
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
