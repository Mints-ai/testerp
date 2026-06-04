"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Edit } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { cn, sendDiscordNotification } from "@/lib/utils";

const LEAVE_TYPES = [
  "Annual Leave", "Sick Leave", "Unpaid Leave", "Emergency Leave", "Maternity/Paternity"
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

export default function LeaveManagement() {
  const { user, role } = useAuth();
  const isManagerOrAbove = canAccess(role, "APPROVE_LEAVE");
  
  const [leaves, setLeaves] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [balance, setBalance] = useState({ totalAnnual: 30, usedAnnual: 0, usedSick: 0 });
  const [loading, setLoading] = useState(true);
  const [employeesMap, setEmployeesMap] = useState<Record<string, any>>({});
  // Admin edit state
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [newLeave, setNewLeave] = useState({ type: "", startDate: "", endDate: "", reason: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!user) return;

    let qLeaves;
    
    if (isManagerOrAbove) {
      // Manager sees all pending approvals (could be filtered by department in reality)
      const qPending = query(
        collection(db, "leaves"),
        where("status", "==", "pending")
      );
      
      onSnapshot(qPending, (snapshot) => {
        setPendingLeaves(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      // Manager sees all leaves in "All Leaves" tab
      qLeaves = query(collection(db, "leaves"), orderBy("createdAt", "desc"));
    } else {
      // Employee sees only their leaves
      qLeaves = query(
        collection(db, "leaves"),
        where("employeeId", "==", user.uid)
      );
    }

    const unsubscribeLeaves = onSnapshot(qLeaves, (snapshot) => {
      setLeaves(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // Fetch leave balance (simulated structure)
    const currentYear = new Date().getFullYear();
    const unsubscribeBalance = onSnapshot(doc(db, "leaveBalances", `${user.uid}_${currentYear}`), (docSnap) => {
      if (docSnap.exists()) {
        setBalance(docSnap.data() as any);
      }
    });

    // Fetch all employees for mapping details
    if (isManagerOrAbove) {
      getDocs(collection(db, "employees")).then(snap => {
        const map: Record<string, any> = {};
        snap.docs.forEach(d => {
          map[d.id] = d.data();
        });
        setEmployeesMap(map);
      }).catch(console.error);
    }

    return () => {
      unsubscribeLeaves();
      unsubscribeBalance();
    };
  }, [user, isManagerOrAbove]);

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    let count = 0;
    const curDate = new Date(s.getTime());
    while (curDate <= e) {
      const dayOfWeek = curDate.getDay();
      if(dayOfWeek !== 0 && dayOfWeek !== 6) count++; // Exclude Sun/Sat
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    
    const daysCount = calculateDays(newLeave.startDate, newLeave.endDate);

    try {
      await addDoc(collection(db, "leaves"), {
        employeeId: user.uid,
        employeeName: user.fullName || user.email || "Employee", // Denormalized for easy viewing by manager
        leaveType: newLeave.type,
        startDate: newLeave.startDate,
        endDate: newLeave.endDate,
        daysCount,
        reason: newLeave.reason,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      
      await sendDiscordNotification(
        `📅 **New Leave Request**\n**${user.fullName || user.email}** requested **${daysCount} days** of ${newLeave.type} from ${newLeave.startDate} to ${newLeave.endDate}.\nReason: *${newLeave.reason}*`,
        undefined,
        'hr'
      );

      setIsApplyOpen(false);
      setNewLeave({ type: "", startDate: "", endDate: "", reason: "" });
    } catch (err) {
      console.error("Error applying for leave:", err);
    }
    setIsSubmitting(false);
  };

  const handleApproveReject = async (leaveId: string, status: "approved" | "rejected") => {
    try {
      await updateDoc(doc(db, "leaves", leaveId), {
        status,
        reviewedBy: user?.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(`Error updating leave status to ${status}:`, err);
    }
  };

  // Open edit dialog with selected leave
  const handleEditOpen = (leave: any) => {
    setSelectedLeave(leave);
    setIsEditOpen(true);
  };

  // Save edited leave details
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) return;
    const { id, leaveType, startDate, endDate, reason } = selectedLeave;
    try {
      await updateDoc(doc(db, "leaves", id), {
        leaveType,
        startDate,
        endDate,
        reason,
        updatedAt: serverTimestamp(),
      });
      setIsEditOpen(false);
      setSelectedLeave(null);
    } catch (err) {
      console.error("Error editing leave:", err);
    }
  };

  const daysRequested = calculateDays(newLeave.startDate, newLeave.endDate);
  const annualPercentage = (balance.usedAnnual / balance.totalAnnual) * 100;

  const getDaysInMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  };
  
  const days = getDaysInMonth();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const approvedLeaves = leaves.filter(l => l.status === "approved");

  return (
    <div className="space-y-6 text-white pb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Leave Management</h1>
          <p className="text-white/40 mt-1">Manage time off, sick leaves, and holidays.</p>
        </div>
        
        <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold h-10 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white shadow-glow-blue border-0 cursor-pointer transition-all">
            <CalendarIcon className="mr-2 h-4 w-4" /> Apply for Leave
          </DialogTrigger>
          <DialogContent className="max-w-md bg-[#0a1628] border border-white/[0.08] text-white backdrop-blur-xl rounded-2xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-400 animate-pulse" />
                Apply for Leave
              </DialogTitle>
              <DialogDescription className="text-white/40 text-xs mt-1">
                Submit a new leave request. Weekends and public holidays are automatically excluded from the calculation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleApplyLeave} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-white/70">Leave Type</Label>
                <Select value={newLeave.type} onValueChange={(val) => setNewLeave({...newLeave, type: val || ""})} required>
                  <SelectTrigger className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white bg-[#0c1322]">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1322] border border-white/10 text-white rounded-xl">
                    {LEAVE_TYPES.map(t => <SelectItem key={t} value={t} className="focus:bg-white/5 cursor-pointer">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-white/70">Start Date</Label>
                  <Input type="date" required min={new Date().toISOString().split("T")[0]} 
                         value={newLeave.startDate} onChange={e => setNewLeave({...newLeave, startDate: e.target.value})}
                         className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-white/70">End Date</Label>
                  <Input type="date" required min={newLeave.startDate || new Date().toISOString().split("T")[0]} 
                         value={newLeave.endDate} onChange={e => setNewLeave({...newLeave, endDate: e.target.value})}
                         className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
                </div>
              </div>

              {daysRequested > 0 && (
                <div className="p-3 bg-white/5 border border-white/[0.06] rounded-xl text-sm flex justify-between items-center text-white">
                  <span className="text-white/60">Working days requested:</span>
                  <span className="font-bold text-blue-400 font-mono">{daysRequested} Days</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-white/70">Reason (Optional)</Label>
                <Textarea placeholder="Brief explanation..." 
                          value={newLeave.reason} onChange={e => setNewLeave({...newLeave, reason: e.target.value})}
                          className="glass-input min-h-[80px] text-xs border-white/10 p-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white" />
              </div>
              
              <Button type="submit" disabled={isSubmitting || daysRequested === 0} className="w-full h-11 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-glow-blue border-0 cursor-pointer rounded-xl">
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!isManagerOrAbove ? (
        /* ================= EMPLOYEE VIEW ================= */
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-white">Annual Leave Balance</CardTitle>
                <CardDescription className="text-white/40 text-xs">Global Standard</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-3xl font-black text-blue-400">{balance.totalAnnual - balance.usedAnnual}</span>
                  <span className="text-xs text-white/40 mb-1 font-semibold">days remaining</span>
                </div>
                <Progress value={annualPercentage} className="h-3 bg-white/5 rounded-full overflow-hidden [&>div]:bg-blue-500" />
                <p className="text-xs text-white/40 mt-2 text-right font-semibold">{balance.usedAnnual} of {balance.totalAnnual} days used</p>
              </CardContent>
            </Card>
            
            <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-white">Sick Leave</CardTitle>
                <CardDescription className="text-white/40 text-xs">Current year usage</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col justify-between h-[84px]">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-3xl font-black text-emerald-400">{balance.usedSick}</span>
                  <span className="text-xs text-white/40 mb-1 font-semibold">days used</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
            <CardHeader className="border-b border-white/[0.06] pb-4">
              <CardTitle className="text-lg text-white">My Leave History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-white/40 font-medium italic">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span>Loading leave records...</span>
                  </div>
                </div>
              ) : leaves.length === 0 ? (
                <div className="text-center py-12 p-6 flex flex-col items-center">
                  <CalendarIcon className="h-10 w-10 text-white/20 mb-3" />
                  <p className="text-sm font-semibold text-white/60">No Leave History</p>
                  <p className="text-xs text-white/40 mt-1 text-center">You have not submitted any leave requests yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white/[0.02] text-white/60 text-xs uppercase font-bold border-b border-white/[0.06]">
                      <tr>
                        <th className="px-6 py-4 font-bold">Type</th>
                        <th className="px-6 py-4 font-bold">Dates</th>
                        <th className="px-6 py-4 font-bold text-center">Days</th>
                        <th className="px-6 py-4 font-bold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {leaves.map((leave) => (
                        <tr key={leave.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                          <td className="px-6 py-4 font-bold text-white/90">{leave.leaveType}</td>
                          <td className="px-6 py-4 text-white/60 whitespace-nowrap">
                            {leave.startDate} to {leave.endDate}
                          </td>
                          <td className="px-6 py-4 text-center font-bold font-mono text-blue-400">{leave.daysCount}</td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant="outline" className={cn("font-bold shadow-none text-xs", STATUS_COLORS[leave.status] || STATUS_COLORS.pending)}>
                              {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ================= MANAGER VIEW ================= */
        <Tabs defaultValue="pending" className="w-full flex flex-col min-h-0">
          <TabsList className="mb-6 bg-white/[0.03] border border-white/[0.08] p-1 rounded-xl w-fit shrink-0 gap-1 text-white">
            <TabsTrigger value="pending" className="relative px-4 py-2 rounded-lg text-sm font-semibold transition-all">
              Pending Approvals
              {pendingLeaves.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-glow-rose">
                  {pendingLeaves.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all">Team Calendar</TabsTrigger>
            <TabsTrigger value="all" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all">All Leaves</TabsTrigger>
          </TabsList>
          
          <TabsContent value="pending" className="space-y-4 focus-visible:outline-none">
            {pendingLeaves.length === 0 ? (
              <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center text-white/40">
                  <CheckCircle2 className="h-12 w-12 text-blue-400 mb-4 animate-pulse" />
                  <p className="text-lg font-bold text-white">You're all caught up!</p>
                  <p className="text-xs text-white/40 mt-1">There are no pending leave requests to review.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {pendingLeaves.map((leave) => {
                  const emp = employeesMap[leave.employeeId];
                  return (
                    <Card key={leave.id} className="border-l-4 border-l-amber-500 border-t-white/[0.08] border-r-white/[0.08] border-b-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
                      <CardHeader className="pb-3 flex-row items-start justify-between">
                        <div>
                          <CardTitle className="text-lg text-white font-bold">{emp?.fullName || leave.employeeName || "Employee"}</CardTitle>
                          <CardDescription className="text-xs text-white/40 mt-1">
                            {emp ? `${emp.employeeId || ""} • ${emp.role || ""} • ${emp.department || (emp.departments?.[0] || "")}` : leave.leaveType}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-bold shadow-none text-xs">Pending</Badge>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="bg-white/[0.02] border border-white/[0.06] p-3 rounded-xl flex gap-4 text-xs">
                          <div>
                            <p className="text-white/40 text-[10px] uppercase font-bold mb-1">Dates</p>
                            <p className="font-bold text-white/90">{new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}</p>
                          </div>
                          <div className="px-4 border-l border-white/[0.06]">
                            <p className="text-white/40 text-[10px] uppercase font-bold mb-1">Duration</p>
                            <p className="font-bold text-blue-400 font-mono">{leave.daysCount} Working Days</p>
                          </div>
                        </div>
                        
                        {leave.reason && (
                          <div className="bg-white/5 border border-white/[0.04] p-3 rounded-xl">
                            <p className="text-[10px] text-white/40 font-bold uppercase mb-1">Reason provided:</p>
                            <p className="text-xs italic text-white/80">"{leave.reason}"</p>
                          </div>
                        )}
                        
                        <div className="flex gap-4 pt-2 border-t border-white/[0.06]">
                          <Button 
                            className="flex-1 h-10 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-glow-emerald border-0 cursor-pointer" 
                            onClick={() => handleApproveReject(leave.id, "approved")}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                          </Button>
                          <Button
                            variant="destructive" 
                            className="flex-1 h-10 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-glow-rose border-0 cursor-pointer" 
                            onClick={() => handleApproveReject(leave.id, "rejected")}>
                            <XCircle className="mr-2 h-4 w-4" /> Reject
                          </Button>
                          {canAccess(role, "EDIT_LEAVE") && (
                            <Button
                              className="flex-1 h-10 text-xs bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl shadow-glow-gray border-0 cursor-pointer" 
                              onClick={() => handleEditOpen({ ...leave })}>
                              Edit
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

{/* Edit Leave Dialog */}
<Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
  <DialogContent className="max-w-md bg-[#0a1628] border border-white/[0.08] text-white backdrop-blur-xl rounded-2xl shadow-2xl">
    <DialogHeader>
      <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
        <Edit className="w-5 h-5 text-blue-400 animate-pulse" /> Edit Leave
      </DialogTitle>
      <DialogDescription className="text-white/40 text-xs mt-1">
        Modify leave details and save.
      </DialogDescription>
    </DialogHeader>
    {selectedLeave && (
      <form onSubmit={handleEditSave} className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-white/70">Leave Type</Label>
          <Select
            value={selectedLeave.leaveType}
            onValueChange={(val) => setSelectedLeave({ ...selectedLeave, leaveType: val })}
          >
            <SelectTrigger className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white bg-[#0c1322]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className="bg-[#0c1322] border border-white/10 text-white rounded-xl">
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="focus:bg-white/5 cursor-pointer">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-white/70">Start Date</Label>
            <Input
              type="date"
              required
              value={selectedLeave.startDate}
              onChange={(e) => setSelectedLeave({ ...selectedLeave, startDate: e.target.value })}
              className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-white/70">End Date</Label>
            <Input
              type="date"
              required
              value={selectedLeave.endDate}
              onChange={(e) => setSelectedLeave({ ...selectedLeave, endDate: e.target.value })}
              className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-white/70">Reason (Optional)</Label>
          <Textarea
            placeholder="Brief explanation..."
            value={selectedLeave.reason}
            onChange={(e) => setSelectedLeave({ ...selectedLeave, reason: e.target.value })}
            className="glass-input min-h-[80px] text-xs border-white/10 p-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 text-white"
          />
        </div>
        <Button type="submit" className="w-full h-11 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-glow-blue border-0 cursor-pointer rounded-xl">
          Save Changes
        </Button>
      </form>
    )}
  </DialogContent>
</Dialog>

          <TabsContent value="calendar" className="focus-visible:outline-none">
            <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-white/[0.06] gap-4">
                <CardTitle className="text-lg text-white">Team Leave Calendar</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="glass h-8 w-8 p-0 border-white/10 text-white/60 hover:text-white hover:bg-white/5 cursor-pointer" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-semibold text-sm w-36 text-center text-white/80 select-none">
                    {format(currentDate, "MMMM yyyy")}
                  </span>
                  <Button variant="outline" size="sm" className="glass h-8 w-8 p-0 border-white/10 text-white/60 hover:text-white hover:bg-white/5 cursor-pointer" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-7 gap-2 text-center">
                  {weekDays.map(day => (
                    <div key={day} className="text-xs font-bold text-white/40 py-2">{day}</div>
                  ))}
                  
                  {Array.from({ length: days[0].getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-28 bg-white/[0.01] rounded-xl border border-white/[0.04]"></div>
                  ))}
                  
                  {days.map(day => {
                    const dayLeaves = approvedLeaves.filter(leave => {
                      const start = new Date(leave.startDate);
                      const end = new Date(leave.endDate);
                      start.setHours(0,0,0,0);
                      end.setHours(23,59,59,999);
                      return day >= start && day <= end;
                    });
                    
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <div key={day.toString()} className={cn(
                        "h-28 p-1.5 flex flex-col rounded-xl border overflow-hidden",
                        isToday 
                          ? "border-blue-500 bg-blue-500/5 shadow-glow-blue" 
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                      )}>
                        <div className="flex justify-between items-start w-full">
                          <span className="text-[9px] text-white/40 font-bold pl-1">
                            {dayLeaves.length > 0 ? `${dayLeaves.length} away` : ""}
                          </span>
                          <span className={cn(
                            "text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full shrink-0",
                            isToday ? "bg-blue-600 text-white" : "text-white/60"
                          )}>
                            {format(day, 'd')}
                          </span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-1 mt-1 pr-1 scrollbar-hide">
                          {dayLeaves.map((leave, idx) => {
                            const empName = employeesMap[leave.employeeId]?.fullName || leave.employeeName || "Employee";
                            const firstWord = empName.split(" ")[0] || "Staff";
                            const leaveShort = leave.leaveType ? leave.leaveType.replace(" Leave", "") : "Time Off";
                            const displayLabel = `${firstWord} (${leaveShort})`;
                            
                            // Determine gorgeous color pill styles based on leave type
                            const t = leave.leaveType?.toLowerCase() || "";
                            let pillStyle = "bg-indigo-500/15 text-indigo-300 border-indigo-500/25";
                            if (t.includes("annual")) {
                              pillStyle = "bg-blue-500/15 text-blue-300 border-blue-500/25";
                            } else if (t.includes("sick")) {
                              pillStyle = "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
                            } else if (t.includes("unpaid")) {
                              pillStyle = "bg-amber-500/15 text-amber-300 border-amber-500/25";
                            } else if (t.includes("emergency")) {
                              pillStyle = "bg-rose-500/15 text-rose-300 border-rose-500/25";
                            }
                            
                            return (
                              <div 
                                key={`${leave.id}-${idx}`} 
                                className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded border truncate font-bold text-left block transition-colors hover:bg-white/5",
                                  pillStyle
                                )} 
                                title={`${empName} - ${leave.leaveType}`}
                              >
                                {displayLabel}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="focus-visible:outline-none">
            <Card className="border-white/[0.08] bg-white/[0.02] shadow-card rounded-2xl overflow-hidden backdrop-blur-xl text-white">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white/[0.02] text-white/60 text-xs uppercase font-bold border-b border-white/[0.06]">
                      <tr>
                        <th className="px-6 py-4 font-bold">Employee</th>
                        <th className="px-6 py-4 font-bold">Details</th>
                        <th className="px-6 py-4 font-bold">Type</th>
                        <th className="px-6 py-4 font-bold">Dates</th>
                        <th className="px-6 py-4 font-bold text-center">Days</th>
                        <th className="px-6 py-4 font-bold text-center">Actions</th>
<th className="px-6 py-4 font-bold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {leaves.map((leave) => {
                        const emp = employeesMap[leave.employeeId];
                        return (
                          <tr key={leave.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-white/90">{emp?.fullName || leave.employeeName || "Employee"}</span>
                                <span className="text-[10px] text-white/30 font-mono mt-0.5">{emp?.employeeId || "No ID"}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col text-xs">
                                <span className="font-semibold text-white/80">{emp?.role || "Role N/A"}</span>
                                <span className="text-white/40 mt-0.5">{emp?.department || (emp?.departments?.[0] || "Dept N/A")}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-white/60">{leave.leaveType}</td>
                            <td className="px-6 py-4 text-white/60 whitespace-nowrap">
                              {leave.startDate} to {leave.endDate}
                            </td>
                            <td className="px-6 py-4 text-center font-bold font-mono text-blue-400">{leave.daysCount}</td>
                            <td className="px-6 py-4 text-center">
                              {canAccess(role, "EDIT_LEAVE") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => handleEditOpen({ ...leave })}
                                >
                                  Edit
                                </Button>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <Badge variant="outline" className={cn("font-bold shadow-none text-xs", STATUS_COLORS[leave.status] || STATUS_COLORS.pending)}>
                                {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
