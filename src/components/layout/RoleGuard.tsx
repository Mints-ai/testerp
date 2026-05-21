"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PERMISSIONS, canAccess } from "@/lib/permissions";

export function RoleGuard({ 
  permission, 
  children, 
  fallback = null 
}: { 
  permission: keyof typeof PERMISSIONS
  children: React.ReactNode
  fallback?: React.ReactNode 
}) {
  const { role, loading } = useAuth();

  if (loading) return null; // or a tiny spinner
  
  if (!canAccess(role, permission)) return <>{fallback}</>;
  
  return <>{children}</>;
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="h-screen w-full flex items-center justify-center bg-background">Loading...</div>;
  }

  return <>{children}</>;
}
