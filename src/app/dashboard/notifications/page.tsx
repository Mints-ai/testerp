"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, CheckCircle2, AlertTriangle, MessageSquare, TrendingUp, Sparkles, Trash2, Check, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Firestore error loading notifications:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true
      });
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user || notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (!n.read) {
          const ref = doc(db, "notifications", n.id);
          batch.update(ref, { read: true });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  const handleDeleteAll = async () => {
    if (!user || notifications.length === 0) return;
    if (!confirm("Are you sure you want to clear all notifications?")) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        const ref = doc(db, "notifications", n.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (err) {
      console.error("Error clearing all notifications:", err);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === "unread") return !n.read;
    if (filter === "read") return n.read;
    return true;
  });

  const getIcon = (title?: string) => {
    const t = title?.toLowerCase() || "";
    if (t.includes("onboarding") || t.includes("checklist")) return <Sparkles className="h-4.5 w-4.5 text-accent" />;
    if (t.includes("chat") || t.includes("message")) return <MessageSquare className="h-4.5 w-4.5 text-primary" />;
    if (t.includes("approved") || t.includes("success")) return <CheckCircle2 className="h-4.5 w-4.5 text-accent" />;
    if (t.includes("warning") || t.includes("denied") || t.includes("failed")) return <AlertTriangle className="h-4.5 w-4.5 text-rose-400" />;
    if (t.includes("project") || t.includes("budget") || t.includes("lead")) return <TrendingUp className="h-4.5 w-4.5 text-amber-400" />;
    return <Inbox className="h-4.5 w-4.5 text-foreground/50" />;
  };

  return (
    <div className="space-y-6 text-foreground pb-24">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary fill-indigo-500/10" />
            Centralized Notifications Hub
          </h1>
          <p className="text-xs text-foreground/40 mt-1">Manage system-wide alerts, milestone verification changes, and task updates.</p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleMarkAllAsRead}
            disabled={notifications.filter(n => !n.read).length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed border border-border text-xs font-bold transition-all"
          >
            <Check className="h-3.5 w-3.5" />
            Mark All Read
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={notifications.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/20 text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6 items-start">
        {/* Navigation Sidebar inside tab */}
        <Card className="bg-card border border-border shadow-sm rounded-lg border-border p-4 space-y-2">
          <h3 className="text-xs font-bold text-foreground/35 uppercase tracking-wider px-2.5 mb-3">Filter Options</h3>
          
          <button
            onClick={() => setFilter("all")}
            className={cn("w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex justify-between items-center",
              filter === "all" ? "bg-primary text-foreground shadow-md shadow-indigo-600/20" : "text-foreground/50 hover:text-foreground hover:"
            )}
          >
            <span>All Notifications</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-border text-foreground/60 font-mono">
              {notifications.length}
            </Badge>
          </button>

          <button
            onClick={() => setFilter("unread")}
            className={cn("w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex justify-between items-center",
              filter === "unread" ? "bg-primary text-foreground shadow-md shadow-indigo-600/20" : "text-foreground/50 hover:text-foreground hover:"
            )}
          >
            <span>Unread Feed</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 bg-primary/10 text-accent font-mono animate-pulse">
              {notifications.filter(n => !n.read).length}
            </Badge>
          </button>

          <button
            onClick={() => setFilter("read")}
            className={cn("w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex justify-between items-center",
              filter === "read" ? "bg-primary text-foreground shadow-md shadow-indigo-600/20" : "text-foreground/50 hover:text-foreground hover:"
            )}
          >
            <span>Read Logs</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-border bg-transparent text-foreground/40 font-mono">
              {notifications.filter(n => n.read).length}
            </Badge>
          </button>
        </Card>

        {/* Notifications list feed */}
        <Card className="bg-card border border-border shadow-sm rounded-lg border-border md:col-span-3 overflow-hidden">
          <CardHeader className="p-5 border-b border-border">
            <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Inbox className="h-4 w-4 text-accent" /> Notifications Feed Ledger
            </CardTitle>
            <CardDescription className="text-xs text-foreground/40">Real-time dynamic system events and actions logged specifically to your user session.</CardDescription>
          </CardHeader>

          <CardContent className="p-0 divide-y divide-white/[0.04]">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Synchronizing feed...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="py-24 text-center space-y-2">
                <Inbox className="h-10 w-10 text-foreground/10 mx-auto" />
                <h4 className="text-xs font-bold text-foreground/40 uppercase tracking-widest">Inbox is Completely Clear</h4>
                <p className="text-xs text-foreground/30 leading-normal max-w-xs mx-auto">All logged events have been processed or cleared. No pending attention needed.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                <AnimatePresence initial={false}>
                  {filteredNotifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn("p-5 flex gap-4 hover: transition-all group relative items-start",
                        !notif.read && "bg-primary/[0.02]"
                      )}
                    >
                      {/* Status indicator bar for unread */}
                      {!notif.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                      )}

                      {/* Icon */}
                      <div className="p-2.5 rounded-xl border border-border shrink-0 mt-0.5">
                        {getIcon(notif.title)}
                      </div>

                      {/* Text details */}
                      <div className="flex-1 space-y-1 pr-12">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-foreground leading-tight">{notif.title}</span>
                          {!notif.read && (
                            <Badge variant="outline" className="text-xs font-bold px-1.5 py-0 border-primary/30 bg-primary/10 text-accent uppercase tracking-widest shrink-0 animate-pulse">
                              New
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-foreground/60 leading-relaxed font-medium">{notif.message}</p>
                        <span className="text-xs font-mono text-foreground/30 uppercase tracking-wider block pt-1">
                          {notif.createdAt ? new Date(notif.createdAt.seconds * 1000).toLocaleString() : "Just now"}
                        </span>
                      </div>

                      {/* Quick Hover Action Panel */}
                      <div className="absolute right-5 top-5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notif.read && (
                          <button
                            onClick={() => handleMarkAsRead(notif.id)}
                            title="Mark as read"
                            className="p-1.5 rounded-lg border border-border hover:bg-muted/80 text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteNotification(notif.id)}
                          title="Delete notification"
                          className="p-1.5 rounded-lg bg-rose-600/10 border border-rose-500/20 hover:bg-rose-600/25 text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
