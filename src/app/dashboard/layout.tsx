"use client";

import { RouteGuard } from "@/components/layout/RoleGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { GlobalTimer } from "@/components/layout/GlobalTimer";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ToastProvider } from "@/context/ToastContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard>
      <ToastProvider>
        <div className="min-h-screen bg-gradient-olive selection:bg-olive-300">
          <Sidebar />
          <div className="lg:pl-64 flex flex-col min-h-screen">
            <TopNav />
            <main className="flex-1 p-4 md:p-8 overflow-y-auto relative">
              {children}
            </main>
          </div>
          <GlobalTimer />
          <CommandPalette />
        </div>
      </ToastProvider>
    </RouteGuard>
  );
}
