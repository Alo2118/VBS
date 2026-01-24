import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/app-shell";
import { DashboardPage } from "@/pages/dashboard";
import { BookingsPage } from "@/pages/bookings";
import { MembersPage } from "@/pages/members";
import { BarPage } from "@/pages/bar";
import { WalletPage } from "@/pages/wallet";

export const App = () => (
  <BrowserRouter>
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/bar" element={<BarPage />} />
        <Route path="/wallet" element={<WalletPage />} />
      </Routes>
    </AppShell>
  </BrowserRouter>
);
