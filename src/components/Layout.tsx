// src/components/Layout.tsx
import { Outlet } from 'react-router-dom'
import Navigation from './Navigation'

const Layout = () => {
  return (
    <div className="app-wrapper">
      <Navigation />
      <main className="main-wrapper">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout