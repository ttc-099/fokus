// src/components/Layout.tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

const Layout = () => {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="mobile-topbar">
        <span className="brand-mark">F</span>
        <span className="brand-name">FOKUS</span>
      </div>
      <main className="main-canvas">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
