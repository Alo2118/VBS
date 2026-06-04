import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/app-shell";
import { BookingsPage } from "@/pages/bookings";
import { MyBookingsPage } from "@/pages/my-bookings";
import { MembersPage } from "@/pages/members";
import { PricingPage } from "@/pages/pricing";
import { AttendancePage } from "@/pages/attendance";
import { ChargesPage } from "@/pages/charges";
import { LoginPage } from "@/pages/login";
import { Spinner } from "@/shared/ui/spinner";
import { ToastProvider } from "@/shared/ui/toast";
import { AuthProvider, useAuth } from "@/shared/auth/auth-context";
import { RequireStaff } from "@/shared/auth/require-staff";

const AuthenticatedApp = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/bookings" replace />} />
      <Route path="/bookings" element={<BookingsPage />} />
      <Route path="/my-bookings" element={<MyBookingsPage />} />
      <Route
        path="/members"
        element={
          <RequireStaff>
            <MembersPage />
          </RequireStaff>
        }
      />
      <Route
        path="/pricing"
        element={
          <RequireStaff>
            <PricingPage />
          </RequireStaff>
        }
      />
      <Route
        path="/attendance"
        element={
          <RequireStaff>
            <AttendancePage />
          </RequireStaff>
        }
      />
      <Route
        path="/charges"
        element={
          <RequireStaff>
            <ChargesPage />
          </RequireStaff>
        }
      />
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
