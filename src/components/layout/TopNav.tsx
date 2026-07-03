"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, writeBatch, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Bell, Search, Check, Trash2, Sun, Moon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CommandPalette } from "./CommandPalette";
import { ROLE_META } from "@/lib/permissions";

export function TopNav() {
  const { user, role, simulatedRole, setSimulatedRole, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const hasNotifs = notifications.some(n => !n.read);
  const roleMeta = ROLE_META[role || "employee"];

  const prevNotifsRef = useRef<string[]>([]);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "in", [user.uid, "global"]),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setNotifications(data);

      if (isFirstLoad.current) {
        prevNotifsRef.current = data.map(n => n.id);
        isFirstLoad.current = false;
      } else {
        data.forEach(n => {
          if (!n.read && !prevNotifsRef.current.includes(n.id)) {
            const title = n.title?.toLowerCase() || "";
            let type: "success" | "warning" | "error" | "info" = "info";
            if (title.includes("approved") || title.includes("success")) {
              type = "success";
            } else if (title.includes("warning") || title.includes("denied") || title.includes("failed")) {
              type = "warning";
            } else if (title.includes("error")) {
              type = "error";
            }
            showToast(n.message, type);
          }
        });
        prevNotifsRef.current = data.map(n => n.id);
      }
    }, (error) => {
      console.error("Error fetching notifications in TopNav:", error);
    });
    return () => unsub();
  }, [user, showToast]);

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

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllNotifications = async () => {
    if (confirm("Clear all notifications?")) {
      try {
        const batch = writeBatch(db);
        notifications.forEach(n => {
          batch.delete(doc(db, "notifications", n.id));
        });
        await batch.commit();
      } catch (err) {
        console.error(err);
      }
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
      <header className="h-16 border-b border-border bg-card flex items-center justify-between pl-16 lg:pl-8 pr-4 lg:pr-8 z-40 sticky top-0 text-foreground transition-colors">
        <div className="flex items-center flex-1 gap-4 lg:gap-8">
          
          <div className="hidden lg:block">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              {greeting}, {user?.fullName ? user.fullName.split(' ')[0] : (user?.displayName ? user.displayName.split(' ')[0] : 'there')}
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">{today}</p>
          </div>

          <button 
            onClick={() => setCmdOpen(true)}
            className="hidden md:flex relative w-full max-w-sm items-center gap-2 rounded-xl bg-card border border-border shadow-sm border border-border px-4 py-2 text-xs text-muted-foreground/80 hover:text-foreground hover:border-border transition-all cursor-text group"
          >
            <Search className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Search workspace...</span>
            <kbd className="pointer-events-none absolute right-3 hidden h-5 select-none items-center gap-1 rounded border border-border bg-secondary px-1.5 font-mono text-xs font-medium text-muted-foreground sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        <div className="flex items-center space-x-4">
          {/* Dynamic Role Switcher for Founders / Admins */}
          {(user?.role === "founder" || user?.role === "system_admin") && (
            <div className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-xl px-2.5 py-1.5 transition-all text-foreground shadow-sm">
              <span className="text-xs uppercase font-bold text-primary dark:text-primary tracking-wider">Simulate:</span>
              <select
                value={simulatedRole || user?.role || "founder"}
                onChange={(e) => {
                  const val = e.target.value;
                  setSimulatedRole(val === user?.role ? null : val);
                }}
                className="bg-transparent text-xs font-bold text-foreground border-0 outline-none focus:ring-0 cursor-pointer pr-1 py-0 scrollbar-hide select-none max-w-[130px] overflow-hidden truncate"
                style={{
                  colorScheme: theme
                }}
              >
                <option value="founder" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>Founder (Admin)</option>
                <option value="system_admin" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>System Admin</option>
                <option value="c_suite" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>C-Suite</option>
                <option value="manager" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>Manager</option>
                <option value="senior_employee" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>Senior Employee</option>
                <option value="employee" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>Employee</option>
                <option value="intern" style={{ backgroundColor: theme === "dark" ? "#0b1329" : "#ffffff", color: theme === "dark" ? "#ffffff" : "#0f172a" }}>Intern</option>
              </select>
            </div>
          )}

          {/* Theme Toggler */}
          <button 
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-secondary/80 border border-transparent hover:border-border transition-all cursor-pointer"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </button>

          <Sheet>
            <SheetTrigger 
              render={
                <button className="relative text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-secondary/80 border border-transparent hover:border-border transition-all cursor-pointer">
                  <Bell className="h-4.5 w-4.5" />
                  {hasNotifs && <span className="notif-dot"></span>}
                </button>
              }
            />
            <SheetContent side="right" className="w-[360px] p-6 border-l border-border bg-popover text-popover-foreground flex flex-col h-full">
              <SheetHeader className="border-b border-border pb-4 mb-4">
                <SheetTitle className="flex justify-between items-center text-foreground">
                  <span className="text-base font-bold">Notifications</span>
                  <div className="flex gap-3">
                    <button onClick={markAllRead} className="text-xs text-primary dark:text-primary hover:text-primary dark:hover:text-primary/80 font-medium flex items-center gap-1 cursor-pointer uppercase tracking-wider">
                      <Check className="h-3.5 w-3.5" /> Read All
                    </button>
                    <button onClick={clearAllNotifications} className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1 cursor-pointer uppercase tracking-wider">
                      <Trash2 className="h-3.5 w-3.5" /> Clear All
                    </button>
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-3 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">No notifications</p>
                ) : (
                  notifications.map(notif => (
                    <div key={notif.id} className={`flex gap-3 p-3.5 rounded-xl border transition-colors ${notif.read ? 'bg-transparent border-transparent hover:border-border/40 hover:bg-secondary/40' : 'bg-secondary/30 border-border/80 shadow-sm'}`}>
                      {notif.read ? (
                        <div className="h-2 w-2 mt-1.5 rounded-full bg-transparent shrink-0" />
                      ) : (
                        <div className="h-2 w-2 mt-1.5 rounded-full bg-primary shadow-sm shrink-0 animate-pulse" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className={`text-xs font-semibold ${!notif.read ? 'text-foreground' : 'text-foreground/80'} truncate`}>{notif.title}</p>
                          <button onClick={() => deleteNotification(notif.id)} className="text-muted-foreground hover:text-rose-500 transition-colors p-1 rounded hover:bg-rose-500/10 cursor-pointer shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
                        <p className="text-xs font-mono text-primary/80 dark:text-primary/80 mt-2.5 uppercase tracking-wider">
                          {notif.createdAt ? (typeof notif.createdAt.toDate === 'function' ? notif.createdAt.toDate().toLocaleString() : new Date(notif.createdAt).toLocaleString()) : 'Just now'}
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
                <button className="flex items-center space-x-2 focus:outline-none hover:bg-secondary p-1 pr-3 rounded-full transition-colors cursor-pointer border border-transparent hover:border-border">
                  <Avatar className="h-7 w-7 border border-border ring-2 ring-primary/20 ring-offset-2 ring-offset-transparent shadow-sm">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.fullName || user?.displayName || "User"} />
                    <AvatarFallback className="bg-primary/20 text-primary/70 font-bold text-xs">
                      {getInitials(user?.fullName || user?.displayName || "User")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-xs font-bold text-foreground leading-none">{(user?.fullName || user?.displayName || "User").split(" ")[0]}</p>
                    <p className="text-xs text-primary dark:text-primary/80 font-medium capitalize mt-1 leading-none">
                      {user?.jobTitle || roleMeta?.label || role} {user?.role !== role && <span className="text-xs text-amber-500 dark:text-amber-400 font-bold ml-0.5 animate-pulse">(Sim)</span>}
                    </p>
                  </div>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 shadow-xl border-border bg-popover text-popover-foreground">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-xs">My Account</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={() => user?.uid && router.push(`/dashboard/hr/${user.uid}`)} className="hover:bg-secondary focus:bg-secondary cursor-pointer text-foreground/80 text-xs">Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")} className="hover:bg-secondary focus:bg-secondary cursor-pointer text-foreground/80 text-xs">Settings</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={() => logout()} className="text-red-500 focus:bg-secondary focus:text-red-400 cursor-pointer font-semibold text-xs">
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
