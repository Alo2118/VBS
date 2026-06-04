import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/app-shell";
import { BookingsPage } from "@/pages/bookings";
import { MyBookingsPage } from "@/pages/my-bookings";
import { MembersPage } from "@/pages/members";
import { LoginPage } from "@/pages/login";
import { Spinner } from "@/shared/ui/spinner";
import { ToastProvider } from "@/shared/ui/toast";
import { AuthProvider, useAuth } from "@/shared/auth/auth-context";

const AuthenticatedApp = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/bookings" replace />} />
      <Route path="/bookings" element={<BookingsPage />} />
      <Route path="/my-bookings" element={<MyBookingsPage />} />
      <Route path="/members" element={<MembersPage />} />
      <Route path="*" element={<Navigate to="/bookings" replace />} />
    </Routes>
  </AppShell>
);

const Gate = () => {
  const { loading, isAuthenticated } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Spinner />
      </div>
    );
  }
  return isAuthenticated ? <AuthenticatedApp /> : <LoginPage />;
};

export const App = () => (
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
);
