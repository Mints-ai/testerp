"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import { CompanyOverview } from "./CompanyOverview";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, Square, Coffee, Clock, CalendarIcon, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn, sendDiscordNotification } from "@/lib/utils";

// Helpers for formatting time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

export default function AttendancePage() {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<"personal" | "company">("personal");
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Attendance State Machine Variables
  const [status, setStatus] = useState<"out" | "in" | "break">("out");
  const [logs, setLogs] = useState<any[]>([]);
  const [totalWorkingSeconds, setTotalWorkingSeconds] = useState(0);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [lastActionTimestamp, setLastActionTimestamp] = useState<number>(0);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [tickingSeconds, setTickingSeconds] = useState(0);

  // 1. Live Ticking Calendar Time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Fetch and Subscribe to Today's Attendance State
  useEffect(() => {
    if (!user) return;

    const dateString = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "attendance", `${user.uid}_${dateString}`);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStatus(data.status || "out");
        setLogs(data.logs || []);
        setTotalWorkingSeconds(data.totalWorkingSeconds || 0);
        setTotalBreakSeconds(data.totalBreakSeconds || 0);
        setLastActionTimestamp(data.lastActionTimestamp || 0);
      } else {
        setStatus("out");
        setLogs([]);
        setTotalWorkingSeconds(0);
        setTotalBreakSeconds(0);
        setLastActionTimestamp(0);
      }
      setLoadingDoc(false);
    }, (error) => {
      console.error("Error subscribing to attendance session:", error);
      setLoadingDoc(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Precise Ticking Working Seconds Ticker
  useEffect(() => {
    const getLiveElapsedSeconds = () => {
      if (status === "in" && lastActionTimestamp > 0) {
        return totalWorkingSeconds + Math.floor((Date.now() - lastActionTimestamp) / 1000);
      }
      return totalWorkingSeconds;
    };

    // Initialize ticker
    setTickingSeconds(getLiveElapsedSeconds());

    const ticker = setInterval(() => {
      setTickingSeconds(getLiveElapsedSeconds());
    }, 1000);

    return () => clearInterval(ticker);
  }, [status, totalWorkingSeconds, lastActionTimestamp]);

  // Format elapsed time (HH:MM:SS)
  const formatElapsed = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatTickingHours = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // State Machine Action Commands
  const handleClockIn = async () => {
    if (!user) return;
    const dateString = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "attendance", `${user.uid}_${dateString}`);
    
    const now = new Date();
    const newLog = {
      type: "in",
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.toISOString(),
      label: "Clocked In"
    };

    try {
      const { setDoc } = await import("firebase/firestore");
      await setDoc(docRef, {
        uid: user.uid,
        employeeName: user.fullName || user.email || "Employee",
        date: dateString,
        status: "in",
        logs: [...logs, newLog], // Append if exists
        totalWorkingSeconds: totalWorkingSeconds,
        totalBreakSeconds: totalBreakSeconds,
        lastActionTimestamp: Date.now()
      }, { merge: true });
      
      await sendDiscordNotification(`⏱️ **${user.fullName || user.email}** clocked **IN** for the day.`, undefined, 'hr');
    } catch (err) {
      console.error("Error creating attendance clock-in:", err);
    }
  };

  const handleTakeBreak = async () => {
    if (!user) return;
    const dateString = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "attendance", `${user.uid}_${dateString}`);
    
    const now = new Date();
    const newLog = {
      type: "break",
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.toISOString(),
      label: "Lunch Break Start"
    };

    const elapsedWorking = lastActionTimestamp > 0 ? Math.floor((Date.now() - lastActionTimestamp) / 1000) : 0;

    try {
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(docRef, {
        status: "break",
        logs: [...logs, newLog],
        totalWorkingSeconds: totalWorkingSeconds + elapsedWorking,
        lastActionTimestamp: Date.now()
      });
      
      await sendDiscordNotification(`☕ **${user.fullName || user.email}** started a **Lunch Break**.`, undefined, 'hr');
    } catch (err) {
      console.error("Error starting break:", err);
    }
  };

  const handleResume = async () => {
    if (!user) return;
    const dateString = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "attendance", `${user.uid}_${dateString}`);
    
    const now = new Date();
    const newLog = {
      type: "in",
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.toISOString(),
      label: "Lunch Break End"
    };

    const elapsedBreak = lastActionTimestamp > 0 ? Math.floor((Date.now() - lastActionTimestamp) / 1000) : 0;

    try {
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(docRef, {
        status: "in",
        logs: [...logs, newLog],
        totalBreakSeconds: totalBreakSeconds + elapsedBreak,
        lastActionTimestamp: Date.now()
      });
      
      await sendDiscordNotification(`💼 **${user.fullName || user.email}** ended break and **Resumed Work**.`, undefined, 'hr');
    } catch (err) {
      console.error("Error resuming work:", err);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    const dateString = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "attendance", `${user.uid}_${dateString}`);
    
    const now = new Date();
    const newLog = {
      type: "out",
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.toISOString(),
      label: "Clocked Out"
    };

    const elapsedWorking = status === "in" && lastActionTimestamp > 0 ? Math.floor((Date.now() - lastActionTimestamp) / 1000) : 0;

    try {
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(docRef, {
        status: "out",
        logs: [...logs, newLog],
        totalWorkingSeconds: totalWorkingSeconds + elapsedWorking,
        lastActionTimestamp: Date.now()
      });
      
      await sendDiscordNotification(`🏁 **${user.fullName || user.email}** clocked **OUT** for the day.`, undefined, 'hr');
    } catch (err) {
      console.error("Error clocking out:", err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Attendance</h1>
          <p className="text-white/40 mt-1">Track your daily working hours, break schedules, and overtime metrics live.</p>
        </div>
        
        <div className="flex items-center gap-4 glass px-4 py-2 rounded-xl">
          <CalendarIcon className="w-5 h-5 text-blue-400" />
          <span className="font-semibold text-white">{formatDate(currentTime)}</span>
        </div>
      </div>

      {canAccess(role, "VIEW_ALL_EMPLOYEES") && (
        <div className="flex gap-2 bg-white/[0.03] p-1 rounded-xl border border-white/[0.08] shadow-inner mb-6 w-fit shrink-0">
          <button 
            onClick={() => setActiveTab("personal")}
            className={cn("px-4 py-2 rounded-lg text-sm font-semibold flex items-center transition-all cursor-pointer", 
              activeTab === "personal" 
                ? "bg-blue-600 text-white shadow-glow-blue" 
                : "text-white/40 hover:text-white/80"
            )}
          >
            My Tracker
          </button>
          <button 
            onClick={() => setActiveTab("company")}
            className={cn("px-4 py-2 rounded-lg text-sm font-semibold flex items-center transition-all cursor-pointer", 
              activeTab === "company" 
                ? "bg-blue-600 text-white shadow-glow-blue" 
                : "text-white/40 hover:text-white/80"
            )}
          >
            Company Overview
          </button>
        </div>
      )}

      {activeTab === "company" ? (
        <div className="flex-1 overflow-y-auto">
          <CompanyOverview />
        </div>
      ) : loadingDoc ? (
        <div className="flex-1 flex flex-col justify-center items-center text-white/60 font-medium gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span>Syncing with secure attendance terminal...</span>
        </div>
      ) : (
        <div className="flex-1 grid lg:grid-cols-3 gap-6 overflow-hidden">
          {/* Main Clock Section */}
          <div className="lg:col-span-2 flex flex-col h-full gap-6">
            <Card className="flex-1 border-olive-200 shadow-card flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-white to-olive-50">
              {/* Background animated rings based on status */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                {status === "in" && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="w-96 h-96 rounded-full border-4 border-olive-500"
                  />
                )}
              </div>

              <CardContent className="p-8 flex flex-col items-center z-10 w-full">
                <div className="mb-8 text-center space-y-2">
                  <Badge variant="outline" className={cn("text-xs font-bold uppercase tracking-widest border-2 px-4 py-1.5 rounded-xl shadow-none", 
                    status === "in" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                    status === "break" ? "bg-amber-50 text-amber-700 border-amber-200" : 
                    "bg-slate-50 text-slate-700 border-slate-200"
                  )}>
                    {status === "in" ? "Currently Clocked In" : status === "break" ? "On Lunch Break" : "Offline / Clocked Out"}
                  </Badge>
                </div>

                {/* Huge Clock */}
                <div className="text-7xl md:text-8xl font-black text-olive-900 tracking-tighter mb-2 tabular-nums">
                  {formatTime(currentTime)}
                </div>

                {/* Elapsed Time */}
                <div className="flex items-center gap-2 text-olive-500 font-bold text-xl mb-12">
                  <Clock className="w-5 h-5 shrink-0" />
                  <span className="tabular-nums">Worked Today: {formatElapsed(tickingSeconds)}</span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-4 w-full max-w-md">
                  {status === "out" ? (
                    <Button 
                      size="lg" 
                      className="w-full h-16 text-lg bg-olive-600 hover:bg-olive-700 text-white shadow-md hover:shadow-lg transition-all rounded-xl font-bold"
                      onClick={handleClockIn}
                    >
                      <Play className="w-6 h-6 mr-3" /> Clock In
                    </Button>
                  ) : (
                    <>
                      <Button 
                        size="lg" 
                        variant={status === "break" ? "default" : "outline"}
                        className={cn("flex-1 h-16 text-lg transition-all rounded-xl font-bold border-slate-200", 
                          status === "break" 
                            ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md border-transparent" 
                            : "bg-white text-amber-600 hover:bg-amber-50 border-amber-200"
                        )}
                        onClick={status === "break" ? handleResume : handleTakeBreak}
                      >
                        {status === "break" ? <Play className="w-5 h-5 mr-2" /> : <Coffee className="w-5 h-5 mr-2" />}
                        {status === "break" ? "Resume" : "Take Break"}
                      </Button>
                      <Button 
                        size="lg" 
                        variant="destructive"
                        className="flex-1 h-16 text-lg bg-red-500 hover:bg-red-600 text-white shadow-md transition-all rounded-xl font-bold"
                        onClick={handleClockOut}
                      >
                        <Square className="w-5 h-5 mr-2" /> Clock Out
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Rail - Logs & Summary */}
          <div className="space-y-6 overflow-y-auto">
            {/* User Profile Summary */}
            <Card className="border-olive-200 shadow-sm bg-olive-900 text-white border-0 rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <Avatar className="h-16 w-16 border-2 border-olive-700 shadow-sm">
                    <AvatarImage src={user?.photoURL || undefined} />
                    <AvatarFallback className="bg-olive-800 text-olive-100 text-xl font-bold">
                      {user?.displayName?.substring(0, 2).toUpperCase() || "JD"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-bold text-xl">{user?.displayName || "Mints Team Member"}</h3>
                    <p className="text-olive-400 font-bold uppercase tracking-wider text-xs mt-0.5">
                      {role?.replace("_", " ") || "EMPLOYEE"} {user?.role !== role && <span className="text-[10px] text-amber-400 font-bold ml-1 animate-pulse">(Simulated)</span>}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-olive-800 rounded-xl p-3">
                    <p className="text-[10px] text-olive-400 uppercase tracking-wider font-bold mb-1">Shift Target</p>
                    <p className="text-lg font-black tabular-nums">8h 00m</p>
                  </div>
                  <div className="bg-olive-800 rounded-xl p-3">
                    <p className="text-[10px] text-olive-400 uppercase tracking-wider font-bold mb-1">Shift Total</p>
                    <p className="text-lg font-black text-emerald-400 tabular-nums">
                      {formatTickingHours(tickingSeconds)}
                    </p>
                  </div>
                </div>

                {tickingSeconds > 28800 && (
                  <div className="mt-4 bg-emerald-800/40 border border-emerald-700 p-2.5 rounded-xl text-center text-xs font-bold text-emerald-300">
                    🎉 Overtime accumulated: {formatTickingHours(tickingSeconds - 28800)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Log */}
            <Card className="border-slate-200 bg-white shadow-sm flex-grow rounded-2xl overflow-hidden flex flex-col justify-between">
              <div>
                <CardHeader className="pb-4 border-b border-olive-100 flex flex-row items-center justify-between">
                  <h3 className="font-bold text-olive-900 text-lg">Today's Log</h3>
                </CardHeader>
                <CardContent className="p-0">
                  {logs.length === 0 ? (
                    <div className="text-center py-12 p-6 flex flex-col items-center">
                      <Clock className="h-10 w-10 text-slate-300 mb-3" />
                      <p className="text-sm font-semibold text-slate-800">Terminal Idle</p>
                      <p className="text-xs text-slate-500 mt-1">Log in using the terminal clock to begin tracking your work shift.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-olive-100">
                      {logs.map((log, idx) => (
                        <div key={idx} className="p-4 flex gap-4 hover:bg-olive-50/50 transition-colors">
                          <div className="shrink-0 pt-1">
                            {log.type === "in" ? (
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                <Play className="w-4 h-4" />
                              </div>
                            ) : log.type === "break" ? (
                              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                <Coffee className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                                <Square className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 flex justify-between items-center">
                            <div>
                              <p className="font-bold text-olive-900">{log.label}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Verified session</p>
                            </div>
                            <span className="font-bold text-olive-700 text-sm tabular-nums">{log.time}</span>
                          </div>
                        </div>
                      ))}
                      
                      {status === "in" && (
                        <div className="p-4 flex gap-4 bg-olive-50/30">
                          <div className="shrink-0 pt-1">
                            <div className="w-8 h-8 rounded-full border-2 border-olive-300 border-dashed flex items-center justify-center animate-spin">
                              <div className="w-1.5 h-1.5 bg-olive-500 rounded-full" />
                            </div>
                          </div>
                          <div className="flex-1 flex justify-between items-center opacity-70">
                            <div>
                              <p className="font-bold text-olive-900 italic">Working shift active...</p>
                            </div>
                            <span className="font-bold text-olive-700 text-sm tabular-nums">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
