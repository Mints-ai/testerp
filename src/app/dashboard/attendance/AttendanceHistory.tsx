"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, onSnapshot } from "firebase/firestore";
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
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
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
    if (!user) return;

    let q = query(
      collection(db, "attendance"),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "desc")
    );

    // Apply client-side employee filter if not "all" (or always restrict if standard employee)
    const targetUid = isAdminOrManager 
      ? (selectedEmployeeId === "all" ? null : selectedEmployeeId)
      : user.uid;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let filtered = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter by employee if needed
      if (targetUid) {
        filtered = filtered.filter((r: any) => r.uid === targetUid);
      }

      setRecords(filtered);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to attendance history logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, startDate, endDate, selectedEmployeeId, isAdminOrManager]);

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
    <div className="space-y-6 text-white pb-6">
      {/* Search & Filter Control Panel */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-[24px] rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          
          {/* Admin Employee Selector Dropdown */}
          {isAdminOrManager && (
            <div className="space-y-1.5 md:col-span-1">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Employee Scope</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full h-9 border border-white/10 rounded-xl pl-9 pr-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0c1322] text-white cursor-pointer"
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
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Start Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-white/30 pointer-events-none" />
              <Input
                type="date"
                className="glass-input h-9 text-xs pl-10 pr-3 border-white/10 text-white focus:border-blue-500/60 focus:ring-0 w-full [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate}
              />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">End Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-white/30 pointer-events-none" />
              <Input
                type="date"
                className="glass-input h-9 text-xs pl-10 pr-3 border-white/10 text-white focus:border-blue-500/60 focus:ring-0 w-full [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
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
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Search Table</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                <Input
                  placeholder="Filter table by name..."
                  className="glass-input h-9 text-xs pl-10 border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2 h-full pb-0.5">
              <Badge variant="outline" className="h-9 px-3 text-xs bg-blue-500/10 text-blue-300 border-blue-500/20 font-bold w-full flex items-center justify-center rounded-xl gap-1 shrink-0 shadow-none">
                <CalendarDays className="w-3.5 h-3.5" />
                Active date filters
              </Badge>
            </div>
          )}
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <span className="text-white/40 font-bold uppercase tracking-wider text-[10px] mr-2">Presets:</span>
          <button
            onClick={() => handleQuickRange(7)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white font-medium transition-all active:scale-95 cursor-pointer"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handleQuickRange(30)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white font-medium transition-all active:scale-95 cursor-pointer"
          >
            Last 30 Days
          </button>
          <button
            onClick={handleThisMonth}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white font-medium transition-all active:scale-95 cursor-pointer"
          >
            This Month
          </button>
        </div>
      </div>

      {/* Historical Logs List Card */}
      <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl">
        <CardHeader className="pb-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-lg">Historical Records Log</h3>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleExportCSV}
              variant="outline"
              className="h-8 px-3 rounded-lg text-xs bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
              Export Timesheets
            </Button>
            <Badge variant="outline" className="text-xs text-blue-300 font-bold bg-blue-500/10 border-blue-500/20 px-3 py-1 rounded-full shadow-none">
              Found {filteredRecords.length} records
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/[0.02] text-white/60 text-xs uppercase font-bold border-b border-white/[0.06]">
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
                    <td colSpan={isAdminOrManager && selectedEmployeeId === "all" ? 7 : 6} className="px-6 py-12 text-center text-white/40 font-medium italic">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span>Syncing security historical logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrManager && selectedEmployeeId === "all" ? 7 : 6} className="px-6 py-12 text-center text-white/40 font-medium italic">
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
                      <tr key={rec.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                        {/* Date */}
                        <td className="px-6 py-4 font-bold text-white">
                          {formattedDateLabel(rec.date)}
                        </td>

                        {/* Employee Details (Only if Admin & All View) */}
                        {isAdminOrManager && selectedEmployeeId === "all" && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7 border border-white/10 bg-blue-950">
                                <AvatarFallback className="bg-blue-800 text-blue-200 font-bold text-[10px]">
                                  {getInitials(rec.employeeName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-white/95">{rec.employeeName || "Employee"}</span>
                            </div>
                          </td>
                        )}

                        {/* Clock In */}
                        <td className="px-6 py-4 text-center">
                          {clockInLog ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono font-bold shadow-none">
                              {clockInLog.time}
                            </Badge>
                          ) : (
                            <span className="text-xs text-white/20 italic">N/A</span>
                          )}
                        </td>

                        {/* Clock Out */}
                        <td className="px-6 py-4 text-center">
                          {clockOutLog ? (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-mono font-bold shadow-none">
                              {clockOutLog.time}
                            </Badge>
                          ) : rec.status === "in" || rec.status === "break" ? (
                            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/25 font-bold shadow-glow-blue animate-pulse">
                              Active Shift
                            </Badge>
                          ) : (
                            <span className="text-xs text-white/20 italic">N/A</span>
                          )}
                        </td>

                        {/* Total Working Hours */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className={cn("font-mono font-bold tabular-nums text-sm text-white")}>
                              {formatElapsed(workingSec)}
                            </span>
                            {workingSec > 28800 ? (
                              <span className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5 shadow-glow-emerald" title="Overtime shift target exceeded (>8h)">
                                Overtime (+{formatElapsedShort(workingSec - 28800)})
                              </span>
                            ) : workingSec > 0 ? (
                              <span className="text-[9px] text-white/40 font-bold uppercase mt-0.5">
                                Regular Shift
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Total Break Duration */}
                        <td className="px-6 py-4 text-center font-mono font-semibold text-white/60">
                          {breakSec > 0 ? formatElapsed(breakSec) : "00:00:00"}
                        </td>

                        {/* Action Details Dialog */}
                        <td className="px-6 py-4 text-center">
                          <Dialog>
                            <DialogTrigger render={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-3 text-white/60 hover:text-white hover:bg-white/5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 mx-auto cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" /> Details
                              </Button>
                            }/>
                            <DialogContent className="max-w-md bg-[#0a1628] border border-white/[0.08] text-white backdrop-blur-xl rounded-2xl shadow-2xl">
                              <DialogHeader>
                                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
                                  <Clock className="w-5 h-5 text-blue-400 animate-pulse" />
                                  Shift Activity Timeline
                                </DialogTitle>
                                <DialogDescription className="text-white/40 text-xs mt-1">
                                  Chronological logs for <span className="text-white font-bold">{rec.employeeName || "Employee"}</span> on <span className="text-blue-400 font-bold">{formattedDateLabel(rec.date)}</span>
                                </DialogDescription>
                              </DialogHeader>

                              {/* Stats Overview inside Modal */}
                              <div className="grid grid-cols-2 gap-4 mt-4 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 text-center">
                                <div>
                                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Total Work Time</p>
                                  <p className="text-lg font-bold text-emerald-400 font-mono mt-1">{formatElapsed(workingSec)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Total Break Time</p>
                                  <p className="text-lg font-bold text-amber-400 font-mono mt-1">{formatElapsed(breakSec)}</p>
                                </div>
                              </div>

                              <div className="mt-6 space-y-4 max-h-[350px] overflow-y-auto pr-1">
                                {rec.logs && rec.logs.length > 0 ? (
                                  <div className="relative pl-6 border-l border-white/10 space-y-4 ml-3 py-1">
                                    {rec.logs.map((log: any, idx: number) => (
                                      <div key={idx} className="relative">
                                        {/* Dot node */}
                                        <div className={cn(
                                          "absolute -left-[30px] top-1.5 w-2 h-2 rounded-full ring-4 ring-[#0a1628]",
                                          log.type === "in" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" :
                                          log.type === "break" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" :
                                          "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                        )} />
                                        <div className="flex justify-between items-center bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 hover:bg-white/[0.04] transition-colors">
                                          <div>
                                            <h4 className="font-bold text-sm text-white">{log.label}</h4>
                                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-0.5">Terminal Action</p>
                                          </div>
                                          <span className="font-bold text-sm text-blue-400 font-mono tabular-nums">{log.time}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-8 text-white/40 italic">
                                    No activity logs found for this date.
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
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
    </div>
  );
}
