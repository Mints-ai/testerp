"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  Users,
  Coffee,
  Play,
  Square,
  Building2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { ROLE_META, canAccess } from "@/lib/permissions";
import { cn, sendDiscordNotification } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const formatElapsed = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getInitials = (name: string) => {
  if (!name) return "U";
  return name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
};

export function CompanyOverview() {
  const { user: currentUser, role } = useAuth();
  const isAdmin = canAccess(role, "MANAGE_USERS");
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Force Clock Out Modal State
  const [forceOutEmployee, setForceOutEmployee] = useState<any | null>(null);
  const [forceOutReason, setForceOutReason] = useState("");
  const [submittingForceOut, setSubmittingForceOut] = useState(false);
  const [forceOutOpen, setForceOutOpen] = useState(false);

  const handleForceClockOutSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !forceOutEmployee) return;

    setSubmittingForceOut(true);
    try {
      const record = attendanceRecords[forceOutEmployee.id];
      if (!record) return;

      const attendanceDocId = `${forceOutEmployee.id}_${selectedDate}`;
      const attDocRef = doc(db, "attendance", attendanceDocId);
      
      const now = new Date();
      const newLog = {
        type: "out",
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: now.toISOString(),
        label: `Force Clocked Out by ${currentUser.fullName || currentUser.email}`
      };

      let updateFields: any = {
        status: "out",
        logs: [...(record.logs || []), newLog],
        lastActionTimestamp: Date.now(),
        forceClockedOutBy: currentUser.fullName || currentUser.email,
        forceClockedOutAt: now.toISOString(),
        forceClockedOutReason: forceOutReason
      };

      if (record.status === "in" && record.lastActionTimestamp > 0) {
        const elapsedWorking = Math.floor((Date.now() - record.lastActionTimestamp) / 1000);
        updateFields.totalWorkingSeconds = (record.totalWorkingSeconds || 0) + elapsedWorking;
      } else if (record.status === "break" && record.lastActionTimestamp > 0) {
        const elapsedBreak = Math.floor((Date.now() - record.lastActionTimestamp) / 1000);
        updateFields.totalBreakSeconds = (record.totalBreakSeconds || 0) + elapsedBreak;
      }

      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(attDocRef, updateFields);

      // Write an audit log entry
      const { collection, addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "auditLog"), {
        actorId: currentUser.uid,
        action: "FORCE_CLOCKOUT",
        targetCollection: "attendance",
        targetId: attendanceDocId,
        details: `Force clocked out ${forceOutEmployee.fullName} on ${selectedDate}. Reason: ${forceOutReason || "No reason specified"}`,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      });

      // Send Discord notification
      await sendDiscordNotification(
        `🚨 **${forceOutEmployee.fullName}** was **FORCE CLOCKED OUT** by Admin **${currentUser.fullName || currentUser.email}** on **${selectedDate}**.\n*Reason: ${forceOutReason || "No reason specified"}*`,
        undefined,
        'hr'
      );

      setForceOutOpen(false);
      setForceOutEmployee(null);
      setForceOutReason("");
    } catch (err) {
      console.error("Error force clocking out employee:", err);
    } finally {
      setSubmittingForceOut(false);
    }
  };
  
  // Date State - Default to Today
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Fetch active employees
  useEffect(() => {
    const q = query(
      collection(db, "employees"),
      where("isActive", "==", true),
      orderBy("fullName")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch attendance records for selected date
  useEffect(() => {
    const q = query(
      collection(db, "attendance"),
      where("date", "==", selectedDate)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.uid) {
          records[data.uid] = { id: doc.id, ...data };
        }
      });
      setAttendanceRecords(records);
    });
    return () => unsubscribe();
  }, [selectedDate]);

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    const today = new Date().toISOString().split('T')[0];
    if (selectedDate < today) {
      d.setDate(d.getDate() + 1);
      setSelectedDate(d.toISOString().split('T')[0]);
    }
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const filteredEmployees = employees.filter(emp => 
    emp.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.jobTitle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formattedDateLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      // Adjust timezone offset to avoid showing incorrect day
      const userTimezoneOffset = d.getTimezoneOffset() * 60000;
      const localDate = new Date(d.getTime() + userTimezoneOffset);
      return localDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 text-white pb-6">
      {/* Top Filter and Date Selector Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.06] backdrop-blur-[24px]">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
          <Input
            placeholder="Search employees by name or title..."
            className="glass-input h-9 text-xs pl-10 border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Date Selector Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevDay}
            className="glass h-9 w-9 p-0 border-white/10 text-white/60 hover:text-white hover:bg-white/5 active:scale-95 shrink-0 cursor-pointer"
            title="Previous Day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="relative shrink-0">
            <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-white/30 pointer-events-none" />
            <Input
              type="date"
              className="glass-input h-9 text-xs pl-10 pr-3 border-white/10 text-white focus:border-blue-500/60 focus:ring-0 w-40 select-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayStr)}
              max={todayStr}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNextDay}
            disabled={selectedDate >= todayStr}
            className="glass h-9 w-9 p-0 border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none active:scale-95 shrink-0 cursor-pointer"
            title="Next Day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            disabled={selectedDate === todayStr}
            className="glass h-9 text-xs px-3 border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none active:scale-95 shrink-0 cursor-pointer"
          >
            Today
          </Button>

          <Badge variant="outline" className="h-9 px-3 text-xs bg-blue-500/10 text-blue-300 border-blue-500/20 font-bold hidden sm:inline-flex items-center rounded-xl shadow-none">
            Viewing: {formattedDateLabel(selectedDate)}
          </Badge>
        </div>
      </div>

      {/* Main Attendance Card */}
      <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl">
        <CardHeader className="pb-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400 animate-pulse" />
            <h3 className="font-bold text-white text-lg">Organizational Attendance</h3>
          </div>
          <Badge variant="outline" className="text-xs text-blue-300 font-bold bg-blue-500/10 border-blue-500/20 px-3 py-1 rounded-full shadow-none">
            Date: {formattedDateLabel(selectedDate)}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/[0.02] text-white/60 text-xs uppercase font-bold border-b border-white/[0.06]">
                <tr>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Role / Dept</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Hours Worked</th>
                  <th className="px-6 py-4">Last Log</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-white/40 font-medium italic">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span>Loading organizational data...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-white/40 font-medium italic">
                      No employees found matching the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const record = attendanceRecords[emp.id];
                    const status = record?.status || "out";
                    
                    // Standard online status check (within 5 minutes in active ERP)
                    const isOnline = emp.lastSeenAt && (Date.now() - new Date(emp.lastSeenAt).getTime() < 5 * 60 * 1000);
                    
                    let liveWorkingSeconds = record?.totalWorkingSeconds || 0;
                    
                    // Ticking work calculations only apply if the selectedDate is today
                    const isToday = selectedDate === todayStr;
                    if (status === "in" && record?.lastActionTimestamp && isToday) {
                      liveWorkingSeconds += Math.floor((Date.now() - record.lastActionTimestamp) / 1000);
                    }

                    const lastLog = record?.logs?.length > 0 ? record.logs[record.logs.length - 1] : null;

                    return (
                      <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                        {/* Employee Avatar & Name */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="h-10 w-10 border border-white/10 shadow-sm bg-blue-950">
                                <AvatarImage src={emp.profilePhotoURL} />
                                <AvatarFallback className="bg-blue-800 text-blue-200 font-bold text-xs">
                                  {getInitials(emp.fullName)}
                                </AvatarFallback>
                              </Avatar>
                              {isOnline && (
                                <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-[#0c1322] shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" title="Active in ERP" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-white/90">{emp.fullName}</p>
                              <p className="text-[10px] text-white/40 font-semibold">{emp.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role & Dept */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5 items-start">
                            <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider font-bold shadow-none", ROLE_META[emp.role]?.color || "bg-white/5 border border-white/10 text-white/60 font-semibold")}>
                              {emp.jobTitle || ROLE_META[emp.role]?.label || "Employee"}
                            </Badge>
                            {emp.department && (
                              <span className="text-[10px] font-semibold text-white/60 flex items-center">
                                <Building2 className="w-3 h-3 mr-1 shrink-0 text-blue-400" /> {emp.department}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4 text-center">
                          {status === "in" ? (
                            <Badge className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 font-bold shadow-none">
                              <Play className="w-3 h-3 mr-1 fill-emerald-400/20" /> Clocked In
                            </Badge>
                          ) : status === "break" ? (
                            <Badge className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 font-bold shadow-none">
                              <Coffee className="w-3 h-3 mr-1 fill-amber-400/20" /> On Break
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-white/5 text-white/40 border-white/10 font-bold shadow-none">
                              <Square className="w-3 h-3 mr-1 fill-white/10" /> Offline
                            </Badge>
                          )}
                        </td>

                        {/* Hours Worked */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className={cn("font-mono font-bold tabular-nums text-sm", liveWorkingSeconds > 0 ? "text-white" : "text-white/30")}>
                              {formatElapsed(liveWorkingSeconds)}
                            </span>
                            {liveWorkingSeconds > 28800 && (
                              <span className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5 shadow-glow-emerald">
                                Overtime
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Last Log */}
                        <td className="px-6 py-4">
                          {lastLog ? (
                            <div>
                              <p className="font-bold text-xs text-white/80">{lastLog.label}</p>
                              <p className="text-[10px] text-white/40 font-semibold mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3 shrink-0 text-blue-400" /> {lastLog.time}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[10px] text-white/20 font-medium italic">No activity</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Dialog>
                              <DialogTrigger render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!record}
                                  className={cn(
                                    "h-8 px-3 text-white/60 hover:text-white hover:bg-white/5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer",
                                    !record && "opacity-20 cursor-not-allowed"
                                  )}
                                >
                                  <Eye className="w-3.5 h-3.5" /> View Logs
                                </Button>
                              }/>
                              <DialogContent className="max-w-md bg-[#0a1628] border border-white/[0.08] text-white backdrop-blur-xl rounded-2xl shadow-2xl">
                                <DialogHeader>
                                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
                                    <Clock className="w-5 h-5 text-blue-400 animate-pulse" />
                                    Shift Activity Logs
                                  </DialogTitle>
                                  <DialogDescription className="text-white/40 text-xs mt-1">
                                    Detailed chronological timeline for <span className="text-white font-bold">{emp.fullName}</span> on <span className="text-blue-400 font-bold">{formattedDateLabel(selectedDate)}</span>
                                  </DialogDescription>
                                </DialogHeader>

                                <div className="mt-6 space-y-4 max-h-[350px] overflow-y-auto pr-1">
                                  {record?.logs && record.logs.length > 0 ? (
                                    <div className="relative pl-6 border-l border-white/10 space-y-4 ml-3 py-1">
                                      {record.logs.map((log: any, idx: number) => (
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

                            {isAdmin && record && (status === "in" || status === "break") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setForceOutEmployee(emp);
                                  setForceOutReason("");
                                  setForceOutOpen(true);
                                }}
                                className="h-8 px-3 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" /> Force Clock Out
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

      {/* Admin Force Clock Out Dialog */}
      <Dialog open={forceOutOpen} onOpenChange={setForceOutOpen}>
        <DialogContent className="max-w-md bg-[#0a1628] border border-white/[0.08] text-white backdrop-blur-xl rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />
              Force Clock Out
            </DialogTitle>
            <DialogDescription className="text-white/40 text-xs mt-1">
              You are about to force clock out <span className="text-white font-bold">{forceOutEmployee?.fullName}</span>. This will immediately end their active working session for <span className="text-blue-400 font-bold">{formattedDateLabel(selectedDate)}</span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForceClockOutSubmit} className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Reason for Force Clock Out</label>
              <textarea
                required
                rows={3}
                placeholder="State clearly why you are force clocking out this employee (e.g. Forgot to clock out, Left premises)..."
                value={forceOutReason}
                onChange={(e) => setForceOutReason(e.target.value)}
                className="w-full bg-[#0c1322] border border-white/10 rounded-xl p-3 text-xs focus:border-blue-500/60 focus:ring-0 text-white placeholder:text-white/20 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForceOutOpen(false);
                  setForceOutEmployee(null);
                  setForceOutReason("");
                }}
                className="h-10 px-4 text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 rounded-xl cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submittingForceOut || !forceOutReason.trim()}
                className="h-10 px-4 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-glow-rose rounded-xl border-0 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {submittingForceOut ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                ) : (
                  "Confirm Force Clock Out"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
