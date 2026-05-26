"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Briefcase, CheckSquare, UserSquare2,
  Wallet, CalendarOff, Bell, BarChart3, Settings, LogOut,
  Clock, Target, Monitor, TrendingUp, AlignLeft, Cloud,
  MessageSquare, ChevronRight, Zap, Menu, X, Mail
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ROLE_META } from "@/lib/permissions";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { name: "Dashboard",    href: "/dashboard",                    icon: LayoutDashboard,  permission: null },
      { name: "Team Chat",    href: "/dashboard/chat",               icon: MessageSquare,    permission: null },
      { name: "Secure Mail",  href: "/dashboard/mail",               icon: Mail,             permission: null },
      { name: "Tasks",        href: "/dashboard/tasks",              icon: CheckSquare,      permission: null },
      { name: "Cloud Drive",  href: "/dashboard/files",              icon: Cloud,            permission: null },
    ]
  },
  {
    label: "Business",
    items: [
      { name: "Projects",     href: "/dashboard/projects",           icon: Briefcase,        permission: null },
      { name: "Capacity",     href: "/dashboard/projects/capacity",  icon: AlignLeft,        permission: "CREATE_PROJECT" },
      { name: "CRM & Sales",  href: "/dashboard/crm",               icon: TrendingUp,       permission: "CREATE_PROJECT" },
      { name: "Clients",      href: "/dashboard/clients",            icon: UserSquare2,      permission: "VIEW_ALL_EMPLOYEES" },
    ]
  },
  {
    label: "People",
    items: [
      { name: "HR & Team",    href: "/dashboard/hr",                 icon: Users,            permission: null },
      { name: "Payroll",      href: "/dashboard/hr/payroll",         icon: Wallet,           permission: "MANAGE_USERS" },
      { name: "Goals (OKRs)", href: "/dashboard/hr/okrs",            icon: Target,           permission: "MANAGE_USERS" },
      { name: "Assets",       href: "/dashboard/hr/assets",          icon: Monitor,          permission: "MANAGE_USERS" },
      { name: "Attendance",   href: "/dashboard/attendance",         icon: Clock,            permission: null },
      { name: "Leaves",       href: "/dashboard/leaves",             icon: CalendarOff,      permission: null },
      { name: "Notice Board", href: "/dashboard/announcements",      icon: Bell,             permission: null },
    ]
  },
  {
    label: "Finance",
    items: [
      { name: "Finance",      href: "/dashboard/finance",            icon: Wallet,           permission: "MANAGE_FINANCE" },
      { name: "Reports",      href: "/dashboard/reports",            icon: BarChart3,        permission: "MANAGE_FINANCE" },
    ]
  },
  {
    label: "System",
    items: [
      { name: "Settings",     href: "/dashboard/settings",           icon: Settings,         permission: "SYSTEM_SETTINGS" },
    ]
  }
];

function SidebarContent({ isExpanded, onNavigate }: { isExpanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, role, logout } = useAuth();
  const roleMeta = ROLE_META[role || "employee"];

  const getInitials = (name: string) =>
    name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 gap-3 shrink-0 border-b border-white/[0.06]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-glow-blue shrink-0">
          <Zap className="h-4.5 w-4.5 text-white fill-white/20 animate-pulse" />
        </div>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col"
          >
            <span className="font-bold text-sm tracking-tight text-white leading-tight">Mints Global</span>
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest leading-none">ERP Platform</span>
          </motion.div>
        )}
      </div>

      {/* Nav List */}
      <div className="flex-1 py-6 px-3 space-y-6 overflow-y-auto scrollbar-hide">
        {NAV_GROUPS.map((group, gi) => {
          const visible = group.items.filter(item =>
            !item.permission || canAccess(role, item.permission as any)
          );
          if (!visible.length) return null;
          return (
            <div key={gi} className="space-y-1.5">
              {isExpanded && (
                <div className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20 mb-2">
                  {group.label}
                </div>
              )}
              <div className="space-y-1">
                {visible.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={onNavigate}
                      title={!isExpanded ? item.name : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative border border-transparent",
                        active
                          ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm"
                          : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
                      )}
                    >
                      {active && (
                        <motion.div
                          layoutId="activeNavIndicator"
                          className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-r-full"
                        />
                      )}
                      <item.icon
                        className={cn(
                          "h-5 w-5 shrink-0 relative z-10",
                          active ? "text-blue-400" : "text-white/30 group-hover:text-white/60"
                        )}
                      />
                      {isExpanded && (
                        <span className="relative z-10 font-medium whitespace-nowrap">{item.name}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-white/[0.06] bg-blue-950/40 shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-white/10 ring-2 ring-blue-500/20 ring-offset-2 ring-offset-transparent shrink-0">
            <AvatarImage src={user?.photoURL || undefined} alt={user?.fullName || user?.displayName || "User"} />
            <AvatarFallback className="bg-blue-800 text-blue-200 text-[10px] font-bold">
              {getInitials(user?.fullName || user?.displayName || "")}
            </AvatarFallback>
          </Avatar>
          
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              className="flex-1 min-w-0"
            >
              <p className="text-xs font-bold text-white truncate leading-tight">{user?.fullName || user?.displayName || "User"}</p>
              <p className="text-[10px] text-blue-400/80 font-medium capitalize truncate leading-none mt-0.5">
                {user?.jobTitle || roleMeta?.label || role} {user?.role !== role && <span className="text-[9px] text-amber-400 font-bold ml-1 animate-pulse">(Sim)</span>}
              </p>
            </motion.div>
          )}

          {isExpanded && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => logout()}
              className="p-1.5 ml-auto text-white/20 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="h-4 w-4 shrink-0" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [isHovered, setIsHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={{ width: 68 }}
        animate={{ width: isHovered ? 248 : 68 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed inset-y-0 left-0 z-50 glass-dark hidden lg:flex flex-col overflow-hidden"
      >
        <SidebarContent isExpanded={isHovered} />
      </motion.aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center glass rounded-xl text-white/60 hover:text-white cursor-pointer"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0 border-r border-white/[0.08] bg-[#0d1f3c] text-white">
          <SidebarContent isExpanded={true} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
