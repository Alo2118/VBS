import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/app-shell";
import { BookingsPage } from "@/pages/bookings";
import { MyBookingsPage } from "@/pages/my-bookings";
import { AccountPage } from "@/pages/account";
import { DashboardPage } from "@/pages/dashboard";
import { MembersPage } from "@/pages/members";
import { SchedulePage } from "@/pages/schedule";
import { PricingPage } from "@/pages/pricing";
import { AttendancePage } from "@/pages/attendance";
import { CashboxPage } from "@/pages/cashbox";
import { BarPage } from "@/pages/bar";
import { ProductsPage } from "@/pages/products";
import { LoginPage } from "@/pages/login";
import { Spinner } from "@/shared/ui/spinner";
import { ToastProvider } from "@/shared/ui/toast";
import { AuthProvider, useAuth } from "@/shared/auth/auth-context";
import { RequireStaff } from "@/shared/auth/require-staff";
import { RequireCashier } from "@/shared/auth/require-cashier";

const AuthenticatedApp = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/bookings" replace />} />
      <Route path="/bookings" element={<BookingsPage />} />
      <Route path="/my-bookings" element={<MyBookingsPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route
        path="/cassa"
        element={
          <RequireCashier>
            <CashboxPage />
          </RequireCashier>
        }
      />
      <Route
        path="/bar"
        element={
          <RequireCashier>
            <BarPage />
          </RequireCashier>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireStaff>
            <DashboardPage />
          </RequireStaff>
        }
      />
      <Route
        path="/members"
        element={
          <RequireStaff>
            <MembersPage />
          </RequireStaff>
        }
      />
      <Route
        path="/listino"
        element={
          <RequireStaff>
            <ProductsPage />
          </RequireStaff>
        }
      />
      <Route
        path="/schedule"
        element={
          <RequireStaff>
            <SchedulePage />
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
      <Route path="*" element={<Navigate to="/bookings" replace />} />
    </Routes>
  </AppShell>
);

const Gate = () => {
  const { loading, isAuthenticated } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spinner />
      </div>
    );
  }
  return isAuthenticated ? <AuthenticatedApp /> : <LoginPage />;
};

// Routing coerente con il base path del deploy (GitHub Pages: "/<repo>").
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export const App = () => (
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
);
