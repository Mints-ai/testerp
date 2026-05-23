"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Bell, Search, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CommandPalette } from "./CommandPalette";
import { ROLE_META } from "@/lib/permissions";

export function TopNav() {
  const { user, role, simulatedRole, setSimulatedRole, logout } = useAuth();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const hasNotifs = notifications.some(n => !n.read);
  const roleMeta = ROLE_META[role || "employee"];

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "in", [user.uid, "global"]),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [user]);

  const markAllRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.read).forEach(n => {
        batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <header className="h-16 border-b border-white/[0.06] bg-blue-900/30 backdrop-blur-xl flex items-center justify-between pl-16 lg:pl-8 pr-4 lg:pr-8 z-40 sticky top-0 text-white">
        <div className="flex items-center flex-1 gap-4 lg:gap-8">
          
          <div className="hidden lg:block">
            <h2 className="text-sm font-semibold text-white tracking-tight">
              {greeting}, {user?.displayName ? user.displayName.split(' ')[0] : 'there'}
            </h2>
            <p className="text-[10px] text-white/40 font-medium mt-0.5">{today}</p>
          </div>

          <button 
            onClick={() => setCmdOpen(true)}
            className="hidden md:flex relative w-full max-w-sm items-center gap-2 rounded-xl glass border border-white/[0.07] px-4 py-2 text-xs text-white/30 hover:text-white/60 hover:border-white/[0.12] transition-all cursor-text group"
          >
            <Search className="h-3.5 w-3.5 text-white/40 group-hover:text-white/70 transition-colors" />
            <span>Search workspace...</span>
            <kbd className="pointer-events-none absolute right-3 hidden h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[9px] font-medium text-white/40 sm:flex">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </button>
        </div>

        <div className="flex items-center space-x-4">
          {/* Dynamic Role Switcher for Founders / Admins */}
          {user?.role === "founder" && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.12] rounded-xl px-2.5 py-1.5 transition-all text-white shadow-sm">
              <span className="text-[9px] uppercase font-bold text-blue-400 tracking-wider">Simulate:</span>
              <select
                value={simulatedRole || "founder"}
                onChange={(e) => {
                  const val = e.target.value;
                  setSimulatedRole(val === "founder" ? null : val);
                }}
                className="bg-transparent text-xs font-bold text-white border-0 outline-none focus:ring-0 cursor-pointer pr-1 py-0 scrollbar-hide select-none max-w-[130px] overflow-hidden truncate"
                style={{
                  colorScheme: "dark"
                }}
              >
                <option value="founder" className="bg-[#0d1f3c] text-white">Founder (Admin)</option>
                <option value="c_suite" className="bg-[#0d1f3c] text-white">C-Suite</option>
                <option value="manager" className="bg-[#0d1f3c] text-white">Manager</option>
                <option value="senior_employee" className="bg-[#0d1f3c] text-white">Senior Employee</option>
                <option value="employee" className="bg-[#0d1f3c] text-white">Employee</option>
                <option value="intern" className="bg-[#0d1f3c] text-white">Intern</option>
              </select>
            </div>
          )}

          <Sheet>
            <SheetTrigger 
              render={
                <button className="relative text-white/40 hover:text-white p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all cursor-pointer">
                  <Bell className="h-4.5 w-4.5" />
                  {hasNotifs && <span className="notif-dot"></span>}
                </button>
              }
            />
            <SheetContent side="right" className="w-[360px] p-6 border-l border-white/[0.08] bg-[#0d1f3c] text-white flex flex-col h-full">
              <SheetHeader className="border-b border-white/[0.06] pb-4 mb-4">
                <SheetTitle className="flex justify-between items-center text-white">
                  <span className="text-base font-bold">Notifications</span>
                  <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer">
                    <Check className="h-3.5 w-3.5" /> Mark all read
                  </button>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-3 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-xs text-white/40 italic text-center py-4">No notifications</p>
                ) : (
                  notifications.map(notif => (
                    <div key={notif.id} className={`flex gap-3 p-3.5 rounded-xl border transition-colors ${notif.read ? 'bg-transparent border-transparent hover:border-white/[0.04] hover:bg-white/[0.02]' : 'bg-white/[0.03] border-white/[0.06] shadow-sm'}`}>
                      {notif.read ? (
                        <div className="h-2 w-2 mt-1.5 rounded-full bg-transparent shrink-0" />
                      ) : (
                        <div className="h-2 w-2 mt-1.5 rounded-full bg-blue-500 shadow-glow-blue shrink-0 animate-pulse" />
                      )}
                      <div>
                        <p className={`text-xs font-semibold ${!notif.read ? 'text-white' : 'text-white/80'}`}>{notif.title}</p>
                        <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{notif.message}</p>
                        <p className="text-[9px] font-mono text-blue-400/80 mt-2.5 uppercase tracking-wider">
                          {notif.createdAt?.toDate().toLocaleString() || 'Just now'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger 
              render={
                <button className="flex items-center space-x-2 focus:outline-none hover:bg-white/5 p-1 pr-3 rounded-full transition-colors cursor-pointer border border-transparent hover:border-white/10">
                  <Avatar className="h-7 w-7 border border-white/10 ring-2 ring-blue-500/20 ring-offset-2 ring-offset-transparent shadow-sm">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.fullName || user?.displayName || "User"} />
                    <AvatarFallback className="bg-blue-800 text-blue-200 font-bold text-[10px]">
                      {getInitials(user?.fullName || user?.displayName || "User")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-xs font-bold text-white leading-none">{(user?.fullName || user?.displayName || "User").split(" ")[0]}</p>
                    <p className="text-[9px] text-blue-400/80 font-medium capitalize mt-1 leading-none">
                      {roleMeta?.label || role} {user?.role !== role && <span className="text-[8px] text-amber-400 font-bold ml-0.5 animate-pulse">(Sim)</span>}
                    </p>
                  </div>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 shadow-xl border-white/[0.08] bg-[#0d1f3c] text-white">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-white/40 text-xs">My Account</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-white/[0.06]" />
              <DropdownMenuItem onClick={() => user?.uid && router.push(`/dashboard/hr/${user.uid}`)} className="hover:bg-white/5 focus:bg-white/5 cursor-pointer text-white/80 text-xs">Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")} className="hover:bg-white/5 focus:bg-white/5 cursor-pointer text-white/80 text-xs">Settings</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/[0.06]" />
              <DropdownMenuItem onClick={() => logout()} className="text-red-400 focus:bg-white/5 focus:text-red-300 cursor-pointer font-semibold text-xs">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={cmdOpen} setOpen={setCmdOpen} />
    </>
  );
}
