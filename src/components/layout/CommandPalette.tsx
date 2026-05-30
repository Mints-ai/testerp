"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CheckSquare,
  TrendingUp,
  Wallet,
  Clock,
  Settings,
  ShieldAlert,
  Zap,
  Mail,
  Cloud,
  MessageSquare,
  UserSquare2,
  CalendarDays,
} from "lucide-react";

interface CommandPaletteProps {
  open?: boolean;
  setOpen?: (open: boolean | ((prev: boolean) => boolean)) => void;
}

export function CommandPalette({ open: externalOpen, setOpen: externalSetOpen }: CommandPaletteProps) {
  const [localOpen, setLocalOpen] = useState(false);
  
  const open = externalOpen !== undefined ? externalOpen : localOpen;
  const setOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    if (externalSetOpen) {
      if (typeof val === "function") {
        externalSetOpen(val(open));
      } else {
        externalSetOpen(val);
      }
    } else {
      if (typeof val === "function") {
        setLocalOpen(val(localOpen));
      } else {
        setLocalOpen(val);
      }
    }
  };

  const [employees, setEmployees] = useState<any[]>([]);
  const router = useRouter();
  const { role } = useAuth();

  // Keyboard shortcut listener (Cmd + K / Ctrl + K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Fetch employees list dynamically for global search capability
  useEffect(() => {
    if (!open) return;
    const fetchTeammates = async () => {
      try {
        const querySnap = await getDocs(collection(db, "employees"));
        const data = querySnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((emp: any) => emp.isActive === true);
        setEmployees(data);
      } catch (err) {
        console.error("Failed to load teammates for command palette search", err);
      }
    };
    fetchTeammates();
  }, [open]);

  const runCommand = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog 
      open={open} 
      onOpenChange={setOpen}
      title="Mints ERP Command Center"
      description="Quickly navigate, search teammates, or launch operational actions across the command deck."
      className="bg-[#0b1019]/95 border border-white/[0.08] text-white backdrop-blur-[24px] max-w-lg shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl"
    >
      <CommandInput 
        placeholder="Type a command, action, or teammate name..." 
        className="text-white border-0 focus:ring-0 placeholder:text-white/20 bg-transparent text-sm h-12"
      />
      <CommandList className="max-h-[360px] p-2 space-y-2 overflow-y-auto no-scrollbar">
        <CommandEmpty className="py-6 text-center text-xs text-white/40">
          No matches found. Try searching for a different action or teammate.
        </CommandEmpty>

        {/* Workspace Quick Links */}
        <CommandGroup heading="Command Channels" className="text-[10px] text-white/30 tracking-wider font-bold uppercase mb-1">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <LayoutDashboard className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold">Executive Dashboard</span>
            <CommandShortcut className="text-[9px] text-white/25">/dashboard</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/chat"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-semibold">Team Chat Center</span>
            <CommandShortcut className="text-[9px] text-white/25">/chat</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/mail"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <Mail className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold">Secure Mail Center</span>
            <CommandShortcut className="text-[9px] text-white/25">/mail</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/tasks"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <CheckSquare className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold">Project Tasks Kanban</span>
            <CommandShortcut className="text-[9px] text-white/25">/tasks</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/files"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <Cloud className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold">Secure Cloud Storage</span>
            <CommandShortcut className="text-[9px] text-white/25">/files</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator className="bg-white/[0.06] my-2" />

        {/* Business and Financial Portals */}
        <CommandGroup heading="Strategic Portals" className="text-[10px] text-white/30 tracking-wider font-bold uppercase mb-1">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/projects"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <Briefcase className="h-4 w-4 text-rose-400" />
            <span className="text-xs font-semibold">Workspace Projects</span>
          </CommandItem>
          
          {canAccess(role, "CREATE_PROJECT") && (
            <>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/dashboard/crm"))}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
              >
                <TrendingUp className="h-4 w-4 text-violet-400" />
                <span className="text-xs font-semibold">CRM Pipeline & Sales</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/dashboard/clients"))}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
              >
                <UserSquare2 className="h-4 w-4 text-teal-400" />
                <span className="text-xs font-semibold">Clients Center</span>
              </CommandItem>
            </>
          )}

          {canAccess(role, "MANAGE_FINANCE") && (
            <CommandItem
              onSelect={() => runCommand(() => router.push("/dashboard/finance"))}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
            >
              <Wallet className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold">Finance & Payroll Controls</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator className="bg-white/[0.06] my-2" />

        {/* Quick Operational Operations */}
        <CommandGroup heading="Quick Operations" className="text-[10px] text-white/30 tracking-wider font-bold uppercase mb-1">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/attendance"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <Clock className="h-4 w-4 text-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold">Attendance Center (Clock In / Out)</span>
            <CommandShortcut className="text-[9px] text-emerald-400 font-bold uppercase">Clock</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/leaves"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <CalendarDays className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-semibold">Apply for Leave</span>
            <CommandShortcut className="text-[9px] text-rose-400 font-bold uppercase">Leave</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard/settings"))}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
          >
            <Settings className="h-4 w-4 text-white/50" />
            <span className="text-xs font-semibold">Settings & Preferences</span>
          </CommandItem>
        </CommandGroup>

        {employees.length > 0 && (
          <>
            <CommandSeparator className="bg-white/[0.06] my-2" />
            
            {/* Teammates Directory Search */}
            <CommandGroup heading="Teammates Directory" className="text-[10px] text-white/30 tracking-wider font-bold uppercase mb-1">
              {employees.slice(0, 8).map((emp) => (
                <CommandItem
                  key={emp.id}
                  onSelect={() => runCommand(() => router.push(`/dashboard/hr/${emp.id}`))}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.04] cursor-pointer"
                >
                  <div className="h-6 w-6 rounded-full bg-blue-600/20 border border-blue-500/25 flex items-center justify-center text-[10px] font-bold text-blue-300">
                    {emp.fullName ? emp.fullName.split(" ").map((n: any) => n[0]).join("").slice(0, 2).toUpperCase() : "U"}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white leading-tight">{emp.fullName}</span>
                    <span className="text-[9px] text-white/40 leading-none mt-0.5">{emp.jobTitle || "Team Member"}</span>
                  </div>
                  <CommandShortcut className="text-[8px] text-white/20 uppercase tracking-widest font-semibold ml-auto">{emp.department || "Staff"}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
