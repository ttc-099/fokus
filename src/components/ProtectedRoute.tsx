// guards private pages — redirects to /login when not signed in
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();

  // still checking the saved token? show a quiet placeholder
  if (loading) {
    return <div className="page-container"><p className="api-info">Loading…</p></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
