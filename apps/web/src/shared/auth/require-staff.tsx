import type React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

/** Protegge le rotte riservate allo staff: i soci vengono reindirizzati. */
export const RequireStaff = ({ children }: { children: React.ReactNode }) => {
  const { isStaff } = useAuth();
  if (!isStaff) return <Navigate to="/bookings" replace />;
  return <>{children}</>;
};
