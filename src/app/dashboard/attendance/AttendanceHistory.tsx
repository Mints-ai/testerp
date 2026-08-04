"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Search,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Eye,
  CalendarDays,
  User,
  Coffee,
  Play,
  Square,
  Download,
  Edit3,
  Plus,
  Trash2,
  Save,
  ShieldAlert
} from "lucide-react";
import { cn, sendDiscordNotification } from "@/lib/utils";
import { downloadCSV } from "@/lib/exportUtils";

// Formatting Helpers
const formatElapsed = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatElapsedShort = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const getInitials = (name: string) => {
  if (!name) return "U";
  return name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
};

export function AttendanceHistory() {
  const { user, role } = useAuth();
  const isAdminOrManager = canAccess(role, "VIEW_ALL_EMPLOYEES");

  // Date Filters - Default to past 7 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Employee Filter (Only used for Admins)
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Timecard Editor States
  const [editRecord, setEditRecord] = useState<any | null>(null);
  const [editLogs, setEditLogs] = useState<any[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);

  // Timecard Helpers
  const getHHMM = (timestampStr: string) => {
    try {
      const d = new Date(timestampStr);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return "";
    }
  };

  const combineDateAndTime = (dateStr: string, hhmm: string) => {
    const [hours, minutes] = hhmm.split(":").map(Number);
    const d = new Date(dateStr);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  };

  const formatHHMMTo12h = (hhmm: string) => {
    let [hours, minutes] = hhmm.split(":").map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes.toString().padStart(2, '0');
    return `${hours.toString().padStart(2, '0')}:${minutesStr} ${ampm}`;
  };

  const calculateShiftSeconds = (logsList: any[]) => {
    const sortedLogs = [...logsList].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let totalWorkingSeconds = 0;
    let totalBreakSeconds = 0;
    
    let currentSessionStart: number | null = null;
    let currentBreakStart: number | null = null;
    let currentState: "out" | "in" | "break" = "out";

    for (const log of sortedLogs) {
      const logTime = new Date(log.timestamp).getTime();
      
      if (log.type === "in") {
        if (currentState === "break" && currentBreakStart !== null) {
          const breakDuration = Math.floor((logTime - currentBreakStart) / 1000);
          totalBreakSeconds += breakDuration;
          currentBreakStart = null;
        }
        if (currentState === "out" || currentState === "break") {
          currentSessionStart = logTime;
        }
        currentState = "in";
      } else if (log.type === "break") {
        if (currentState === "in" && currentSessionStart !== null) {
          const workDuration = Math.floor((logTime - currentSessionStart) / 1000);
          totalWorkingSeconds += workDuration;
          currentSessionStart = null;
        }
        if (currentState === "in" || currentState === "out") {
          currentBreakStart = logTime;
        }
        currentState = "break";
      } else if (log.type === "out") {
        if (currentState === "in" && currentSessionStart !== null) {
          const workDuration = Math.floor((logTime - currentSessionStart) / 1000);
          totalWorkingSeconds += workDuration;
          currentSessionStart = null;
        } else if (currentState === "break" && currentBreakStart !== null) {
          const breakDuration = Math.floor((logTime - currentBreakStart) / 1000);
          totalBreakSeconds += breakDuration;
          currentBreakStart = null;
        }
        currentState = "out";
      }
    }
    
    return {
      totalWorkingSeconds,
      totalBreakSeconds,
      status: currentState
    };
  };

  const handleSaveOverride = async () => {
    if (!user || !editRecord) return;
    setSavingOverride(true);
    try {
      const { totalWorkingSeconds, totalBreakSeconds, status } = calculateShiftSeconds(editLogs);
      const sortedLogs = [...editLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      // Update lastActionTimestamp to be the timestamp of the last log
      const lastActionLog = sortedLogs[sortedLogs.length - 1];
      const lastActionTimestamp = lastActionLog ? new Date(lastActionLog.timestamp).getTime() : Date.now();

      const attDocRef = doc(db, "attendance", editRecord.id);
      const { updateDoc } = await import("firebase/firestore");
      
      await updateDoc(attDocRef, {
        logs: sortedLogs,
        totalWorkingSeconds,
        totalBreakSeconds,
        status,
        lastActionTimestamp,
        modifiedBy: user.fullName || user.email || "Admin",
        modifiedAt: new Date().toISOString()
      });

      // Write an audit log entry
      const { collection, addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.email || "Admin",
        action: "ATTENDANCE_SHIFT_EDIT",
        targetCollection: "attendance",
        targetId: editRecord.id,
        details: `Admin modified shift logs for ${editRecord.employeeName} on ${editRecord.date}. Recalculated work: ${formatElapsed(totalWorkingSeconds)}, break: ${formatElapsed(totalBreakSeconds)}.`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      });

      // Send Discord notification
      await sendDiscordNotification(
        `✏️ **Shift Override Completed** by Admin **${user.fullName || user.email}** for **${editRecord.employeeName}** on **${editRecord.date}**.\n` +
        `* Recalculated Work: \`${formatElapsed(totalWorkingSeconds)}\` (was \`${formatElapsed(editRecord.totalWorkingSeconds || 0)}\`)\n` +
        `* Recalculated Break: \`${formatElapsed(totalBreakSeconds)}\` (was \`${formatElapsed(editRecord.totalBreakSeconds || 0)}\`)\n` +
        `* Status Set To: \`${status.toUpperCase()}\``,
        undefined,
        'hr'
      );

      setEditorOpen(false);
      setEditRecord(null);
      setEditLogs([]);
    } catch (err) {
      console.error("Error saving timecard overrides:", err);
    } finally {
      setSavingOverride(false);
    }
  };

  // Fetch employees list if Admin/Manager
  useEffect(() => {
    if (!isAdminOrManager) return;
    const q = query(
      collection(db, "employees"),
      where("isActive", "==", true),
      orderBy("fullName")
    );
    getDocs(q).then((snap) => {
      const emps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
    }).catch(console.error);
  }, [isAdminOrManager]);

  // Fetch attendance history records
  useEffect(() => {
    if (!user || role === null || role === undefined) return;

    const targetUid = isAdminOrManager 
      ? (selectedEmployeeId === "all" ? null : selectedEmployeeId)
      : user.uid;

    let q;
    if (targetUid) {
      // Query specific employee's attendance to satisfy Firestore security rules
      q = query(
        collection(db, "attendance"),
        where("uid", "==", targetUid)
      );
    } else {
      // Admin querying all employees: query by date range
      q = query(
        collection(db, "attendance"),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "desc")
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // If we queried a specific employee, filter dates and sort client-side (avoids compound index requirement)
      if (targetUid) {
        fetched = fetched.filter((r: any) => r.date >= startDate && r.date <= endDate);
        fetched.sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
      }

      setRecords(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to attendance history logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, role, startDate, endDate, selectedEmployeeId, isAdminOrManager]);

  // Filter records in-memory if admin is searching table by employee name
  const filteredRecords = records.filter(rec => {
    if (isAdminOrManager && selectedEmployeeId === "all" && searchTerm.trim() !== "") {
      return rec.employeeName?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleQuickRange = (days: number) => {
    const today = new Date().toISOString().split('T')[0];
    const past = new Date();
    past.setDate(past.getDate() - days);
    setStartDate(past.toISOString().split('T')[0]);
    setEndDate(today);
  };

  const handleThisMonth = () => {
    const today = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setDate(1); // First day of current month
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(today);
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

  const handleExportCSV = () => {
    const formatted = filteredRecords.map(rec => {
      const clockInLog = rec.logs?.find((l: any) => l.type === "in")?.time || "N/A";
      const clockOutLog = rec.logs?.slice().reverse().find((l: any) => l.type === "out")?.time || "Active";
      return {
        ...rec,
        clockIn: clockInLog,
        clockOut: clockOutLog,
        workingTime: formatElapsed(rec.totalWorkingSeconds || 0),
        breakTime: formatElapsed(rec.totalBreakSeconds || 0),
      };
    });
    downloadCSV(
      formatted,
      ["Date", "Employee Name", "Clock In", "Clock Out", "Working Hours", "Break Hours"],
      ["date", "employeeName", "clockIn", "clockOut", "workingTime", "breakTime"],
      `Mints_Global_Attendance_${startDate}_to_${endDate}.csv`
    );
  };

  return (
    <div className="space-y-6 text-foreground pb-6">
      {/* Search & Filter Control Panel */}
      <div className="border border-border bg-card shadow-sm rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          
          {/* Admin Employee Selector Dropdown */}
          {isAdminOrManager && (
            <div className="space-y-1.5 md:col-span-1">
              <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Employee Scope</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full h-9 border border-border rounded-xl pl-9 pr-3 text-xs focus:border-primary/60 focus:ring-0 bg-card text-foreground cursor-pointer"
                >
                  <option value="all">All Employees (Org-wide)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Start Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30 pointer-events-none" />
              <Input
                type="date"
                className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs pl-10 pr-3 border-border text-foreground focus:border-primary/60 focus:ring-0 w-full [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate}
              />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">End Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30 pointer-events-none" />
              <Input
                type="date"
                className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs pl-10 pr-3 border-border text-foreground focus:border-primary/60 focus:ring-0 w-full [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Quick Name Search (If Admin & Viewing All) */}
          {isAdminOrManager && selectedEmployeeId === "all" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground/40 uppercase tracking-widest pl-1">Search Table</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
                <Input
                  placeholder="Filter table by name..."
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs pl-10 border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full text-foreground"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2 h-full pb-0.5">
              <Badge variant="outline" className="h-9 px-3 text-xs bg-primary/10 text-primary/80 border-primary/20 font-bold w-full flex items-center justify-center rounded-xl gap-1 shrink-0 shadow-none">
                <CalendarDays className="w-3.5 h-3.5" />
                Active date filters
              </Badge>
            </div>
          )}
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <span className="text-foreground/40 font-bold uppercase tracking-wider text-xs mr-2">Presets:</span>
          <button
            onClick={() => handleQuickRange(7)}
            className="px-3 py-1.5 rounded-lg border border-border text-foreground/70 hover:bg-muted/80 hover:text-foreground font-medium transition-all active:scale-95 cursor-pointer"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handleQuickRange(30)}
            className="px-3 py-1.5 rounded-lg border border-border text-foreground/70 hover:bg-muted/80 hover:text-foreground font-medium transition-all active:scale-95 cursor-pointer"
          >
            Last 30 Days
          </button>
          <button
            onClick={handleThisMonth}
            className="px-3 py-1.5 rounded-lg border border-border text-foreground/70 hover:bg-muted/80 hover:text-foreground font-medium transition-all active:scale-95 cursor-pointer"
          >
            This Month
          </button>
        </div>
      </div>

      {/* Historical Logs List Card */}
      <Card className="border-border shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-lg">Historical Records Log</h3>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleExportCSV}
              variant="outline"
              className="h-8 px-3 rounded-lg text-xs border-border text-foreground/80 hover:bg-muted/80 hover:text-foreground"
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-accent" />
              Export Timesheets
            </Button>
            <Badge variant="outline" className="text-xs text-primary/80 font-bold bg-primary/10 border-primary/20 px-3 py-1 rounded-full shadow-none">
              Found {filteredRecords.length} records
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-foreground/60 text-xs uppercase font-bold border-b border-border">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  {isAdminOrManager && selectedEmployeeId === "all" && (
                    <th className="px-6 py-4">Employee</th>
                  )}
                  <th className="px-6 py-4 text-center">Clock In</th>
                  <th className="px-6 py-4 text-center">Clock Out</th>
                  <th className="px-6 py-4 text-center">Total Working Hours</th>
                  <th className="px-6 py-4 text-center">Total Break Duration</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan={isAdminOrManager && selectedEmployeeId === "all" ? 7 : 6} className="px-6 py-12 text-center text-foreground/40 font-medium italic">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span>Syncing security historical logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrManager && selectedEmployeeId === "all" ? 7 : 6} className="px-6 py-12 text-center text-foreground/40 font-medium italic">
                      No attendance records found for the selected scope and dates.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    // Extract clock-in and clock-out logs
                    const clockInLog = rec.logs?.find((l: any) => l.type === "in");
                    const clockOutLog = rec.logs?.slice().reverse().find((l: any) => l.type === "out");

                    const workingSec = rec.totalWorkingSeconds || 0;
                    const breakSec = rec.totalBreakSeconds || 0;

                    return (
                      <tr key={rec.id} className="hover: transition-colors border-b border-border last:border-b-0">
                        {/* Date */}
                        <td className="px-6 py-4 font-bold text-foreground">
                          {formattedDateLabel(rec.date)}
                        </td>

                        {/* Employee Details (Only if Admin & All View) */}
                        {isAdminOrManager && selectedEmployeeId === "all" && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7 border border-border bg-blue-950">
                                <AvatarFallback className="bg-primary/20 text-primary/70 font-bold text-xs">
                                  {getInitials(rec.employeeName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-foreground/95">{rec.employeeName || "Employee"}</span>
                            </div>
                          </td>
                        )}

                        {/* Clock In */}
                        <td className="px-6 py-4 text-center">
                          {clockInLog ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-accent border-emerald-500/20 font-mono font-bold shadow-none">
                              {clockInLog.time}
                            </Badge>
                          ) : (
                            <span className="text-xs text-foreground/20 italic">N/A</span>
                          )}
                        </td>

                        {/* Clock Out */}
                        <td className="px-6 py-4 text-center">
                          {clockOutLog ? (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-mono font-bold shadow-none">
                              {clockOutLog.time}
                            </Badge>
                          ) : rec.status === "in" || rec.status === "break" ? (
                            <Badge className="bg-primary/15 text-primary/80 border-primary/25 font-bold shadow-sm animate-pulse">
                              Active Shift
                            </Badge>
                          ) : (
                            <span className="text-xs text-foreground/20 italic">N/A</span>
                          )}
                        </td>

                        {/* Total Working Hours */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className={cn("font-mono font-bold tabular-nums text-sm text-foreground")}>
                              {formatElapsed(workingSec)}
                            </span>
                            {workingSec > 28800 ? (
                              <span className="text-xs text-accent font-bold uppercase mt-0.5 shadow-glow-emerald" title="Overtime shift target exceeded (>8h)">
                                Overtime (+{formatElapsedShort(workingSec - 28800)})
                              </span>
                            ) : workingSec > 0 ? (
                              <span className="text-xs text-foreground/40 font-bold uppercase mt-0.5">
                                Regular Shift
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Total Break Duration */}
                        <td className="px-6 py-4 text-center font-mono font-semibold text-foreground/60">
                          {breakSec > 0 ? formatElapsed(breakSec) : "00:00:00"}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Dialog>
                              <DialogTrigger render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-foreground/60 hover:text-foreground hover: rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Details
                                </Button>
                              }/>
                              <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-2xl">
                                <DialogHeader>
                                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                                    <Clock className="w-5 h-5 text-primary animate-pulse" />
                                    Shift Activity Timeline
                                  </DialogTitle>
                                  <DialogDescription className="text-foreground/40 text-xs mt-1">
                                    Chronological logs for <span className="text-foreground font-bold">{rec.employeeName || "Employee"}</span> on <span className="text-primary font-bold">{formattedDateLabel(rec.date)}</span>
                                  </DialogDescription>
                                </DialogHeader>

                                {/* Stats Overview inside Modal */}
                                <div className="grid grid-cols-2 gap-4 mt-4 border border-border rounded-xl p-3 text-center">
                                  <div>
                                    <p className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Total Work Time</p>
                                    <p className="text-lg font-bold text-accent font-mono mt-1">{formatElapsed(workingSec)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Total Break Time</p>
                                    <p className="text-lg font-bold text-amber-400 font-mono mt-1">{formatElapsed(breakSec)}</p>
                                  </div>
                                </div>

                                <div className="mt-6 space-y-4 max-h-[350px] overflow-y-auto pr-1">
                                  {rec.logs && rec.logs.length > 0 ? (
                                    <div className="relative pl-6 border-l border-border space-y-4 ml-3 py-1">
                                      {rec.logs.map((log: any, idx: number) => (
                                        <div key={idx} className="relative">
                                          {/* Dot node */}
                                          <div className={cn("absolute -left-[30px] top-1.5 w-2 h-2 rounded-full ring-4 ring-[#0a1628]",
                                            log.type === "in" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" :
                                            log.type === "break" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" :
                                            "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                          )} />
                                          <div className="flex justify-between items-center border border-border rounded-xl p-3 hover: transition-colors">
                                            <div>
                                              <h4 className="font-bold text-sm text-foreground">{log.label}</h4>
                                              <p className="text-xs text-foreground/40 font-bold uppercase tracking-wider mt-0.5">Terminal Action</p>
                                            </div>
                                            <span className="font-bold text-sm text-primary font-mono tabular-nums">{log.time}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-foreground/40 italic">
                                      No activity logs found for this date.
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>

                            {isAdminOrManager && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditRecord(rec);
                                  setEditLogs(rec.logs || []);
                                  setEditorOpen(true);
                                }}
                                className="h-8 px-3 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Edit Logs
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Admin Edit Shift Logs Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl bg-card border border-border text-foreground rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <ShieldAlert className="w-5 h-5 text-primary animate-pulse" />
              Override Shift Logs
            </DialogTitle>
            <DialogDescription className="text-foreground/40 text-xs mt-1">
              Directly edit, delete, or append chronological logs for <span className="text-foreground font-bold">{editRecord?.employeeName}</span> on <span className="text-primary font-bold">{formattedDateLabel(editRecord?.date)}</span>.
            </DialogDescription>
          </DialogHeader>

          {/* Editor Area */}
          <div className="mt-4 space-y-4">
            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3">
              {editLogs.map((log, idx) => (
                <div key={idx} className="flex items-center gap-3 border border-border rounded-xl p-3">
                  <div className="w-32 shrink-0">
                    <select
                      value={log.type}
                      onChange={(e) => {
                        const newLogs = [...editLogs];
                        newLogs[idx] = {
                          ...newLogs[idx],
                          type: e.target.value,
                          label: e.target.value === "in" ? "Clocked In" : e.target.value === "break" ? "On Break" : "Clocked Out"
                        };
                        setEditLogs(newLogs);
                      }}
                      className="w-full h-9 border border-border rounded-xl px-2 text-xs focus:border-primary/60 focus:ring-0 bg-card text-foreground cursor-pointer"
                    >
                      <option value="in">Clock In</option>
                      <option value="break">On Break</option>
                      <option value="out">Clock Out</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <Input
                      type="time"
                      value={getHHMM(log.timestamp)}
                      onChange={(e) => {
                        const newLogs = [...editLogs];
                        const newTimestamp = combineDateAndTime(editRecord.date, e.target.value);
                        newLogs[idx] = {
                          ...newLogs[idx],
                          timestamp: newTimestamp,
                          time: formatHHMMTo12h(e.target.value)
                        };
                        setEditLogs(newLogs);
                      }}
                      className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border text-foreground focus:border-primary/60 focus:ring-0 w-full [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newLogs = editLogs.filter((_, i) => i !== idx);
                      setEditLogs(newLogs);
                    }}
                    className="h-9 w-9 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              {editLogs.length === 0 && (
                <div className="text-center py-8 text-foreground/40 italic">
                  No logs in this shift. Click "Add Log Entry" to construct one.
                </div>
              )}
            </div>

            {/* Actions for editing list */}
            <div className="flex justify-between items-center border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const newLog = {
                    type: "in",
                    label: "Clocked In",
                    time: formatHHMMTo12h("09:00"),
                    timestamp: combineDateAndTime(editRecord.date, "09:00")
                  };
                  setEditLogs([...editLogs, newLog]);
                }}
                className="h-9 px-3 text-xs font-semibold border-border text-primary hover:text-primary/80 hover:bg-primary/10 rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Log Entry
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditorOpen(false);
                    setEditRecord(null);
                    setEditLogs([]);
                  }}
                  className="h-9 px-4 text-xs font-semibold text-foreground/60 hover:text-foreground hover: rounded-xl cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={savingOverride}
                  onClick={handleSaveOverride}
                  className="h-9 px-4 text-xs font-semibold bg-primary hover:bg-blue-700 text-foreground shadow-sm rounded-xl border-0 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {savingOverride ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> Save Override
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
