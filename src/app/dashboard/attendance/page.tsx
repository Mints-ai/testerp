"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot, collection, query, where, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import { CompanyOverview } from "./CompanyOverview";
import { AttendanceHistory } from "./AttendanceHistory";
import { CorrectionRequestsTab } from "./CorrectionRequestsTab";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, Square, Coffee, Clock, CalendarIcon, Send, History } from "lucide-react";
import { motion } from "framer-motion";
import { cn, sendDiscordNotification } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Helpers for formatting time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const formatTimeString = (timeStr: string) => {
  if (!timeStr) return "";
  try {
    const parts = timeStr.split(":");
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  } catch {
    return timeStr;
  }
};

export default function AttendancePage() {
  const { user, role } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Attendance State Machine Variables
  const [status, setStatus] = useState<"out" | "in" | "break">("out");
  const [logs, setLogs] = useState<any[]>([]);
  const [totalWorkingSeconds, setTotalWorkingSeconds] = useState(0);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [lastActionTimestamp, setLastActionTimestamp] = useState<number>(0);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [tickingSeconds, setTickingSeconds] = useState(0);

  // Recharts Chart Dataset
  const [chartData, setChartData] = useState<any[]>([]);

  // Time Correction Request State
  const [corrDate, setCorrDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [corrType, setCorrType] = useState<"in" | "out" | "both">("both");
  const [corrIn, setCorrIn] = useState("09:00");
  const [corrOut, setCorrOut] = useState("18:00");
  const [corrReason, setCorrReason] = useState("");
  const [submittingCorr, setSubmittingCorr] = useState(false);
  const [corrSuccess, setCorrSuccess] = useState(false);
  const [myCorrections, setMyCorrections] = useState<any[]>([]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch chart workload metrics for the past 7 days
  useEffect(() => {
    if (!user) return;

    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const q = query(
      collection(db, "attendance"),
      where("uid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbRecords = new Map<string, number>();
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.date && data.date >= startDate && data.date <= endDate) {
          dbRecords.set(data.date, data.totalWorkingSeconds || 0);
        }
      });

      const dataSet = dates.map(dateStr => {
        const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
        const seconds = dbRecords.get(dateStr) || 0;
        const hours = parseFloat((seconds / 3600).toFixed(2));
        return {
          date: dateStr,
          day: dayName,
          hours: hours,
        };
      });
      setChartData(dataSet);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch standard employee's correction requests
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "attendanceCorrections"),
      where("uid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMyCorrections(list);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSubCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !corrReason.trim()) return;

    setSubmittingCorr(true);
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      const corrRef = await addDoc(collection(db, "attendanceCorrections"), {
        uid: user.uid,
        employeeName: user.fullName || user.displayName || user.email || "Employee",
        date: corrDate,
        requestType: corrType,
        proposedClockIn: corrType === "out" ? "" : corrIn,
        proposedClockOut: corrType === "in" ? "" : corrOut,
        reason: corrReason,
        status: "pending",
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.displayName || user.email || "Employee",
        action: "ATTENDANCE_CORRECTION_REQUEST",
        targetCollection: "attendanceCorrections",
        targetId: corrRef.id,
        details: `Submitted attendance correction request for ${corrDate} (${corrType === "both" ? "both In/Out" : corrType === "in" ? "Clock In only" : "Clock Out only"}). Reason: ${corrReason}`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      });

      await sendDiscordNotification(`🔧 **${user.fullName || user.displayName || user.email}** submitted a manual **Attendance Correction** request for **${corrDate}**.`, undefined, 'hr');

      setCorrReason("");
      setCorrSuccess(true);
      setTimeout(() => setCorrSuccess(false), 3000);
    } catch (err) {
      console.error("Error submitting attendance correction:", err);
    } finally {
      setSubmittingCorr(false);
    }
  };

  const formattedDateLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const userTimezoneOffset = d.getTimezoneOffset() * 60000;
      const localDate = new Date(d.getTime() + userTimezoneOffset);
      return localDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

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
      
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.email || "Employee",
        action: "ATTENDANCE_CLOCK_IN",
        targetCollection: "attendance",
        targetId: `${user.uid}_${dateString}`,
        details: `Clocked in for the day at ${newLog.time}`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      });

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
      
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.email || "Employee",
        action: "ATTENDANCE_BREAK_START",
        targetCollection: "attendance",
        targetId: `${user.uid}_${dateString}`,
        details: `Started a lunch break at ${newLog.time}`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
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
      
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.email || "Employee",
        action: "ATTENDANCE_BREAK_END",
        targetCollection: "attendance",
        targetId: `${user.uid}_${dateString}`,
        details: `Ended break and resumed work at ${newLog.time}`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
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
      
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.email || "Employee",
        action: "ATTENDANCE_CLOCK_OUT",
        targetCollection: "attendance",
        targetId: `${user.uid}_${dateString}`,
        details: `Clocked out for the day at ${newLog.time}`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      });

      await sendDiscordNotification(`🏁 **${user.fullName || user.email}** clocked **OUT** for the day.`, undefined, 'hr');
    } catch (err) {
      console.error("Error clocking out:", err);
    }
  };

  return (
    <div className="flex flex-col h-auto lg:h-[calc(100vh-8rem)] text-foreground">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Attendance</h1>
          <p className="text-foreground/40 mt-1">Track your daily working hours, break schedules, and overtime metrics live.</p>
        </div>
        
        <div className="flex items-center gap-4 border border-border bg-card shadow-sm px-4 py-2 rounded-xl">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground/80">{formatDate(currentTime)}</span>
        </div>
      </div>

      <Tabs defaultValue="personal" className="w-full flex flex-col min-h-0">
        <TabsList className="mb-6 border border-border p-1 rounded-xl w-full sm:w-fit shrink-0 gap-1 text-foreground flex overflow-x-auto scrollbar-hide flex-nowrap max-w-full justify-start">
          <TabsTrigger value="personal" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0">
            My Tracker
          </TabsTrigger>
          {canAccess(role, "VIEW_ALL_EMPLOYEES") && (
            <TabsTrigger value="company" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0">
              Company Live
            </TabsTrigger>
          )}
          {canAccess(role, "VIEW_ALL_EMPLOYEES") && (
            <TabsTrigger value="corrections" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0">
              Correction Requests
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0">
            {canAccess(role, "VIEW_ALL_EMPLOYEES") ? "All History" : "My History"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="flex-1 min-h-0 focus-visible:outline-none overflow-y-auto">
          {loadingDoc ? (
            <div className="h-full flex flex-col justify-center items-center text-foreground/60 font-medium gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span>Syncing with secure attendance terminal...</span>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6 pb-6">
              {/* Main Clock Section */}
              <div className="lg:col-span-2 flex flex-col h-full gap-6 min-w-0">
                <Card className="flex-1 border-border shadow-card flex flex-col items-center justify-center relative overflow-hidden rounded-2xl min-h-[400px]">
                  {/* Background animated rings based on status */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    {status === "in" && (
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        className="w-[450px] h-[450px] rounded-full border-4 border-primary/20"
                      />
                    )}
                  </div>

                  <CardContent className="p-8 flex flex-col items-center z-10 w-full text-center">
                    <div className="mb-8 space-y-2">
                      <Badge variant="outline" className={cn("text-xs font-bold uppercase tracking-widest border px-4 py-1.5 rounded-xl shadow-sm", 
                        status === "in" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : 
                        status === "break" ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : 
                        " text-foreground/70 border-border"
                      )}>
                        {status === "in" ? "Currently Clocked In" : status === "break" ? "On Lunch Break" : "Offline / Clocked Out"}
                      </Badge>
                    </div>

                    {/* Huge Clock */}
                    <div className="text-7xl md:text-8xl font-black text-foreground tracking-tighter mb-2 tabular-nums">
                      {formatTime(currentTime)}
                    </div>

                    {/* Elapsed Time */}
                    <div className="flex items-center gap-2 text-foreground/50 font-bold text-xl mb-12">
                      <Clock className="w-5 h-5 shrink-0 text-primary" />
                      <span className="tabular-nums text-foreground/80">Worked Today: <strong className="text-primary font-mono">{formatElapsed(tickingSeconds)}</strong></span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap justify-center gap-4 w-full max-w-md">
                      {status === "out" ? (
                        <Button 
                          size="lg" 
                          className="w-full h-16 text-lg bg-primary hover:bg-blue-700 text-foreground shadow-sm transition-all rounded-xl font-bold border-0 cursor-pointer"
                          onClick={handleClockIn}
                        >
                          <Play className="w-6 h-6 mr-3 fill-white/20 animate-pulse" /> Clock In
                        </Button>
                      ) : (
                        <>
                          <Button 
                            size="lg" 
                            className={cn("flex-1 h-16 text-lg transition-all rounded-xl font-bold border cursor-pointer", 
                              status === "break" 
                                ? "bg-amber-500 hover:bg-amber-600 text-foreground shadow-glow-amber border-transparent" 
                                : " text-amber-300 hover:bg-muted/80 border-border"
                            )}
                            onClick={status === "break" ? handleResume : handleTakeBreak}
                          >
                            {status === "break" ? <Play className="w-5 h-5 mr-2" /> : <Coffee className="w-5 h-5 mr-2" />}
                            {status === "break" ? "Resume" : "Take Break"}
                          </Button>
                          <Button 
                            size="lg" 
                            variant="destructive"
                            className="flex-1 h-16 text-lg bg-rose-600 hover:bg-rose-700 text-foreground shadow-glow-rose transition-all rounded-xl font-bold border-0 cursor-pointer"
                            onClick={handleClockOut}
                          >
                            <Square className="w-5 h-5 mr-2 fill-white/20" /> Clock Out
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Recharts Weekly Workload Bar Chart */}
                <Card className="border-border shadow-card rounded-2xl p-6 shrink-0 flex flex-col justify-between">
                  <CardHeader className="p-0 pb-4 border-b border-border flex flex-row items-center justify-between">
                    <div>
                      <h3 className="font-bold text-foreground text-base">Weekly Workload</h3>
                      <p className="text-xs text-foreground/40 mt-0.5">Hours logged per day over the past week</p>
                    </div>
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary/80 border-primary/20 font-bold px-3 py-1 rounded-full shadow-none">
                      7 Days Activity
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-6 px-0 pb-0 h-[220px] w-full relative">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis 
                            dataKey="day" 
                            stroke="rgba(255,255,255,0.3)" 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false} 
                          />
                          <YAxis 
                            stroke="rgba(255,255,255,0.3)" 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false}
                            tickFormatter={(value) => `${value}h`}
                            domain={[0, 12]}
                          />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-[#0b1329]/95 border border-border rounded-xl p-3 shadow-xl">
                                    <p className="text-xs text-foreground/40 font-bold uppercase tracking-wider">{new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                    <p className="text-xs font-black text-primary mt-1">{data.hours} hours logged</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={30}>
                            {chartData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={entry.hours >= 8 ? 'url(#barCyanGrad)' : 'url(#barBlueGrad)'} 
                                className="transition-all duration-300 hover:opacity-80"
                              />
                            ))}
                          </Bar>
                          <defs>
                            <linearGradient id="barBlueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.8}/>
                              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.2}/>
                            </linearGradient>
                            <linearGradient id="barCyanGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8}/>
                              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.2}/>
                            </linearGradient>
                          </defs>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-foreground/20">Loading workload metrics...</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Rail - Logs & Summary */}
              <div className="space-y-6 flex flex-col h-auto lg:h-full justify-start lg:justify-between">
                {/* User Profile Summary */}
                <Card className="border-border shadow-card rounded-2xl overflow-hidden shrink-0">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                      <Avatar className="h-16 w-16 border border-border ring-2 ring-primary/20 bg-blue-950">
                        <AvatarImage src={user?.photoURL || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary/70 text-xl font-bold">
                          {user?.displayName?.substring(0, 2).toUpperCase() || "JD"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-xl text-foreground truncate">{user?.displayName || "Mints Team Member"}</h3>
                        <p className="text-primary font-bold uppercase tracking-wider text-xs mt-0.5 truncate">
                          {role?.replace("_", " ") || "EMPLOYEE"} {user?.role !== role && <span className="text-xs text-amber-400 font-bold ml-1 animate-pulse">(Simulated)</span>}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="rounded-xl p-3 border border-border">
                        <p className="text-xs text-foreground/40 uppercase tracking-wider font-bold mb-1">Shift Target</p>
                        <p className="text-lg font-black text-foreground/90 tabular-nums">8h 00m</p>
                      </div>
                      <div className="rounded-xl p-3 border border-border">
                        <p className="text-xs text-foreground/40 uppercase tracking-wider font-bold mb-1">Shift Total</p>
                        <p className="text-lg font-black text-accent tabular-nums">
                          {formatTickingHours(tickingSeconds)}
                        </p>
                      </div>
                    </div>

                    {tickingSeconds > 28800 && (
                      <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-center text-xs font-bold text-emerald-300 shadow-glow-emerald">
                        🎉 Overtime accumulated: {formatTickingHours(tickingSeconds - 28800)}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Activity Log */}
                <Card className="border-border shadow-card rounded-2xl overflow-hidden min-h-[300px]">
                  <div>
                    <CardHeader className="pb-4 border-b border-border flex flex-row items-center justify-between">
                      <h3 className="font-bold text-foreground text-lg">Today's Log</h3>
                      
                      {/* Request Correction Dialog Form */}
                      <Dialog>
                        <DialogTrigger render={
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2.5 border border-border hover:bg-muted/80 text-foreground/70 hover:text-foreground rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            Request Correction
                          </Button>
                        }/>
                        <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-2xl">
                          <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                              <Send className="w-5 h-5 text-primary" />
                              Time Correction Request
                            </DialogTitle>
                            <DialogDescription className="text-foreground/40 text-xs mt-1">
                              Submit adjustment requests if you missed a terminal clock action or logged incorrect shift times.
                            </DialogDescription>
                          </DialogHeader>

                          {corrSuccess && (
                            <div className="p-3 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-center font-medium">
                              🎉 Correction request submitted successfully!
                            </div>
                          )}

                          <form onSubmit={handleSubCorrection} className="space-y-4 mt-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Target Date</label>
                              <Input
                                type="date"
                                required
                                value={corrDate}
                                onChange={(e) => setCorrDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border text-foreground focus:border-primary/60 focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Adjustment Scope</label>
                              <select
                                value={corrType}
                                onChange={(e) => setCorrType(e.target.value as any)}
                                className="w-full h-10 border border-border rounded-xl px-3 text-xs focus:border-primary/60 focus:ring-0 bg-card text-foreground cursor-pointer"
                              >
                                <option value="both">Correct Entire Shift (In & Out)</option>
                                <option value="in">Correct Clock-In Only</option>
                                <option value="out">Correct Clock-Out Only</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {corrType !== "out" && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Proposed Clock-In</label>
                                  <Input
                                    type="time"
                                    required
                                    value={corrIn}
                                    onChange={(e) => setCorrIn(e.target.value)}
                                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border text-foreground focus:border-primary/60 focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                                  />
                                </div>
                              )}
                              {corrType !== "in" && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Proposed Clock-Out</label>
                                  <Input
                                    type="time"
                                    required
                                    value={corrOut}
                                    onChange={(e) => setCorrOut(e.target.value)}
                                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border text-foreground focus:border-primary/60 focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Explanation Reason</label>
                              <textarea
                                required
                                rows={3}
                                placeholder="State clearly why you need this manual adjustment (e.g. Forgot to clock out at the end of the shift)..."
                                value={corrReason}
                                onChange={(e) => setCorrReason(e.target.value)}
                                className="w-full bg-card border border-border rounded-xl p-3 text-xs focus:border-primary/60 focus:ring-0 text-foreground placeholder:text-foreground/20 resize-none"
                              />
                            </div>

                            <Button
                              type="submit"
                              disabled={submittingCorr || !corrReason.trim()}
                              className="w-full h-11 text-xs font-semibold btn-primary"
                            >
                              {submittingCorr ? "Submitting Request..." : "Submit Correction Request"}
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>
                    <CardContent className="p-0">
                      {logs.length === 0 ? (
                        <div className="text-center py-12 p-6 flex flex-col items-center">
                          <Clock className="h-10 w-10 text-foreground/20 mb-3" />
                          <p className="text-sm font-semibold text-foreground/60">Terminal Idle</p>
                          <p className="text-xs text-foreground/40 mt-1 text-center">Log in using the terminal clock to begin tracking your work shift.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.04] max-h-[320px] overflow-y-auto">
                          {logs.map((log, idx) => (
                            <div key={idx} className="p-4 flex gap-4 hover: transition-colors">
                              <div className="shrink-0 pt-1">
                                {log.type === "in" ? (
                                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-accent flex items-center justify-center">
                                    <Play className="w-4 h-4" />
                                  </div>
                                ) : log.type === "break" ? (
                                  <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                                    <Coffee className="w-4 h-4" />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                                    <Square className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-foreground/90">{log.label}</p>
                                  <p className="text-xs text-foreground/30 font-bold uppercase tracking-wider">Verified session</p>
                                </div>
                                <span className="font-bold text-primary text-sm tabular-nums">{log.time}</span>
                              </div>
                            </div>
                          ))}
                          
                          {status === "in" && (
                            <div className="p-4 flex gap-4">
                              <div className="shrink-0 pt-1">
                                <div className="w-8 h-8 rounded-full border border-primary/30 border-dashed flex items-center justify-center animate-spin">
                                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                                </div>
                              </div>
                              <div className="flex-1 flex justify-between items-center opacity-70">
                                <div>
                                  <p className="font-bold text-foreground italic">Working shift active...</p>
                                </div>
                                <span className="font-bold text-primary text-sm tabular-nums">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </div>
                </Card>

                {/* Standard Employee's Personal Correction Requests List */}
                {myCorrections.length > 0 && (
                  <Card className="border-border shadow-card rounded-2xl overflow-hidden shrink-0">
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center gap-1.5">
                      <History className="w-4 h-4 text-primary" />
                      <h3 className="font-bold text-foreground text-sm">My Correction Requests</h3>
                    </CardHeader>
                    <CardContent className="p-3 max-h-[220px] overflow-y-auto space-y-2">
                      {myCorrections.map(req => (
                        <div key={req.id} className="border border-border p-3 rounded-xl flex items-center justify-between hover: transition-colors">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-foreground">{formattedDateLabel(req.date)}</p>
                            <p className="text-xs text-foreground/50 leading-relaxed">
                              {req.requestType === "in" ? `In: ${formatTimeString(req.proposedClockIn)}` :
                               req.requestType === "out" ? `Out: ${formatTimeString(req.proposedClockOut)}` :
                               `In: ${formatTimeString(req.proposedClockIn)} | Out: ${formatTimeString(req.proposedClockOut)}`}
                            </p>
                            <p className="text-xs text-foreground/30 italic truncate max-w-[150px]">"{req.reason}"</p>
                          </div>
                          <Badge variant="outline" className={cn("text-xs uppercase tracking-wider font-bold shadow-none",
                            req.status === "approved" ? "bg-emerald-500/10 text-accent border-emerald-500/20" :
                            req.status === "rejected" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          )}>
                            {req.status}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {canAccess(role, "VIEW_ALL_EMPLOYEES") && (
          <TabsContent value="company" className="flex-1 min-h-0 focus-visible:outline-none overflow-y-auto">
            <CompanyOverview />
          </TabsContent>
        )}

        {canAccess(role, "VIEW_ALL_EMPLOYEES") && (
          <TabsContent value="corrections" className="flex-1 min-h-0 focus-visible:outline-none overflow-y-auto">
            <CorrectionRequestsTab />
          </TabsContent>
        )}

        <TabsContent value="history" className="flex-1 min-h-0 focus-visible:outline-none overflow-y-auto">
          <AttendanceHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
