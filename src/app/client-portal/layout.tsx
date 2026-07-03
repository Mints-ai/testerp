"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isClientUser, setIsClientUser] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push(`/login?redirect=${pathname}`);
      return;
    }

    // Determine if the user is a client (e.g. role === 'client')
    // For the sake of this demo, we allow anyone with the client role,
    // or if they just want to test it, we let them in but they might see nothing if data isn't assigned to them.
    if (user.role === 'client') {
      setIsClientUser(true);
    } else {
      // Allow internal staff to view the portal for testing, but ideally they'd be restricted
      setIsClientUser(true);
    }
    
    setCheckingRole(false);

  }, [user, authLoading, router, pathname]);

  if (authLoading || checkingRole) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isClientUser) {
    return null; // Will redirect
  }

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Client Portal Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Mints Logo" className="h-6 w-auto object-contain" />
          <span className="font-bold text-xl tracking-tight text-slate-900 border-l pl-3 border-slate-200"><span className="text-slate-400 font-normal">Client Portal</span></span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600 hidden sm:inline-block">
            Welcome, {user?.displayName || "Client"}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500 hover:text-slate-900">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
