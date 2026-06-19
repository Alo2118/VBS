import type React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

/** Protegge Cassa e Bar: accessibili a gestione + personale bar. */
export const RequireCashier = ({ children }: { children: React.ReactNode }) => {
  const { isCashier } = useAuth();
  if (!isCashier) return <Navigate to="/bookings" replace />;
  return <>{children}</>;
};
