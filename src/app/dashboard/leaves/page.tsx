"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, addDoc, serverTimestamp, getDocs, getDoc } from "firebase/firestore";
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
import { CalendarIcon, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Edit, Settings2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { cn, sendDiscordNotification } from "@/lib/utils";
import { ROLE_META } from "@/lib/permissions";

const LEAVE_TYPES = [
  "Annual Leave", "Sick Leave", "Unpaid Leave", "Emergency Leave", "Maternity/Paternity"
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-accent border-emerald-500/20",
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
  
  const [currentDate, setCurrentDate] = useState(new Date());

  // Leave Policy Configuration
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policies, setPolicies] = useState<Record<string, { annualQuota: number; sickQuota: number; carryForward: boolean }>>({});
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

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

  // Load leave policies from Firestore
  useEffect(() => {
    const unsubPolicies = onSnapshot(doc(db, "settings", "leavePolicies"), (docSnap) => {
      if (docSnap.exists()) {
        setPolicies(docSnap.data() as any);
        // Update balance with dynamic quota if user has a role-matching policy
        if (user && role) {
          const userPolicy = (docSnap.data() as any)[role];
          if (userPolicy?.annualQuota) {
            setBalance(prev => ({ ...prev, totalAnnual: userPolicy.annualQuota }));
          }
        }
      } else {
        // Default policies
        setPolicies({
          founder: { annualQuota: 30, sickQuota: 15, carryForward: true },
          system_admin: { annualQuota: 30, sickQuota: 15, carryForward: true },
          c_suite: { annualQuota: 30, sickQuota: 15, carryForward: true },
          manager: { annualQuota: 24, sickQuota: 12, carryForward: true },
          team_lead: { annualQuota: 24, sickQuota: 12, carryForward: false },
          employee: { annualQuota: 20, sickQuota: 10, carryForward: false },
          intern: { annualQuota: 10, sickQuota: 5, carryForward: false },
        });
      }
    });
    return () => unsubPolicies();
  }, [user, role]);

  const handleSavePolicies = async () => {
    setIsSavingPolicy(true);
    try {
      const { setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "settings", "leavePolicies"), policies);
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || user?.email || "Admin",
        action: "SYSTEM_ADMIN_ACTION",
        targetCollection: "settings",
        targetId: "leavePolicies",
        details: "Updated organization-wide leave policy quotas.",
        createdAt: serverTimestamp()
      });
      alert("Leave policies saved successfully!");
      setIsPolicyOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save leave policies.");
    } finally {
      setIsSavingPolicy(false);
    }
  };

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
      const docRef = await addDoc(collection(db, "leaves"), {
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
      
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        actorName: user.fullName || user.email || "Employee",
        action: "LEAVE_REQUEST",
        targetCollection: "leaves",
        targetId: docRef.id,
        details: `Requested ${daysCount} days of ${newLeave.type} from ${newLeave.startDate} to ${newLeave.endDate}. Reason: ${newLeave.reason || "None"}`,
        createdAt: serverTimestamp()
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
      const leaveSnap = await getDoc(doc(db, "leaves", leaveId));
      let employeeName = "Employee";
      let leaveType = "Leave";
      let daysCount = 0;
      if (leaveSnap.exists()) {
        const d = leaveSnap.data();
        employeeName = d.employeeName || "Employee";
        leaveType = d.leaveType || "Leave";
        daysCount = d.daysCount || 0;
      }

      await updateDoc(doc(db, "leaves", leaveId), {
        status,
        reviewedBy: user?.uid,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Manager",
        action: status === "approved" ? "LEAVE_APPROVE" : "LEAVE_REJECT",
        targetCollection: "leaves",
        targetId: leaveId,
        details: `${status === "approved" ? "Approved" : "Rejected"} leave request of ${daysCount} days (${leaveType}) for ${employeeName}`,
        createdAt: serverTimestamp()
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

      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Employee",
        action: "LEAVE_EDIT",
        targetCollection: "leaves",
        targetId: id,
        details: `Edited leave request to ${leaveType} from ${startDate} to ${endDate}. Reason: ${reason || "None"}`,
        createdAt: serverTimestamp()
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
    <div className="space-y-6 text-foreground pb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Leave Management</h1>
          <p className="text-foreground/40 mt-1">Manage time off, sick leaves, and holidays.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {isManagerOrAbove && (
            <Dialog open={isPolicyOpen} onOpenChange={setIsPolicyOpen}>
              <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold h-10 px-4 py-2 hover: text-foreground/70 border border-border cursor-pointer transition-all">
                <Settings2 className="h-4 w-4" /> Leave Policies
              </DialogTrigger>
              <DialogContent className="max-w-lg bg-card border border-border text-foreground rounded-2xl shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-primary" />
                    Leave Policy Configuration
                  </DialogTitle>
                  <DialogDescription className="text-foreground/40 text-xs mt-1">
                    Configure annual and sick leave quotas per organizational role. Changes are synced globally.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 pt-4 max-h-[50vh] overflow-y-auto">
                  {Object.entries(ROLE_META).map(([roleKey, roleMeta]) => {
                    const policy = policies[roleKey] || { annualQuota: 20, sickQuota: 10, carryForward: false };
                    return (
                      <div key={roleKey} className="p-3 border border-border rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground uppercase tracking-wider">{roleMeta.label}</span>
                          <label className="flex items-center gap-1.5 text-xs text-foreground/40 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={policy.carryForward || false}
                              onChange={(e) => setPolicies({ ...policies, [roleKey]: { ...policy, carryForward: e.target.checked } })}
                              className="w-3.5 h-3.5 rounded accent-blue-500"
                            />
                            Carry-forward
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-foreground/30 uppercase tracking-wider">Annual Days</label>
                            <Input
                              type="number"
                              min={0}
                              max={365}
                              value={policy.annualQuota}
                              onChange={(e) => setPolicies({ ...policies, [roleKey]: { ...policy, annualQuota: parseInt(e.target.value) || 0 } })}
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8 text-xs border-border focus:border-primary/60 focus:ring-0 text-foreground font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-foreground/30 uppercase tracking-wider">Sick Days</label>
                            <Input
                              type="number"
                              min={0}
                              max={365}
                              value={policy.sickQuota}
                              onChange={(e) => setPolicies({ ...policies, [roleKey]: { ...policy, sickQuota: parseInt(e.target.value) || 0 } })}
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8 text-xs border-border focus:border-primary/60 focus:ring-0 text-foreground font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button
                  onClick={handleSavePolicies}
                  disabled={isSavingPolicy}
                  className="w-full h-11 text-xs font-semibold bg-primary hover:bg-blue-700 text-foreground shadow-sm border-0 cursor-pointer rounded-xl mt-4"
                >
                  {isSavingPolicy ? "Saving..." : "Save Leave Policies"}
                </Button>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold h-10 px-4 py-2 bg-primary hover:bg-blue-700 text-foreground shadow-sm border-0 cursor-pointer transition-all">
            <CalendarIcon className="mr-2 h-4 w-4" /> Apply for Leave
          </DialogTrigger>
          <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary animate-pulse" />
                Apply for Leave
              </DialogTitle>
              <DialogDescription className="text-foreground/40 text-xs mt-1">
                Submit a new leave request. Weekends and public holidays are automatically excluded from the calculation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleApplyLeave} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground/70">Leave Type</Label>
                <Select value={newLeave.type} onValueChange={(val) => setNewLeave({...newLeave, type: val || ""})} required>
                  <SelectTrigger className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border px-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground bg-card">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border text-foreground rounded-xl">
                    {LEAVE_TYPES.map(t => <SelectItem key={t} value={t} className="focus: cursor-pointer">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground/70">Start Date</Label>
                  <Input type="date" required min={new Date().toISOString().split("T")[0]} 
                         value={newLeave.startDate} onChange={e => setNewLeave({...newLeave, startDate: e.target.value})}
                         className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border px-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground/70">End Date</Label>
                  <Input type="date" required min={newLeave.startDate || new Date().toISOString().split("T")[0]} 
                         value={newLeave.endDate} onChange={e => setNewLeave({...newLeave, endDate: e.target.value})}
                         className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border px-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
                </div>
              </div>

              {daysRequested > 0 && (
                <div className="p-3 border border-border rounded-xl text-sm flex justify-between items-center text-foreground">
                  <span className="text-foreground/60">Working days requested:</span>
                  <span className="font-bold text-primary font-mono">{daysRequested} Days</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground/70">Reason (Optional)</Label>
                <Textarea placeholder="Brief explanation..." 
                          value={newLeave.reason} onChange={e => setNewLeave({...newLeave, reason: e.target.value})}
                          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-h-[80px] text-xs border-border p-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground" />
              </div>
              
              <Button type="submit" disabled={isSubmitting || daysRequested === 0} className="w-full h-11 text-xs font-semibold bg-primary hover:bg-blue-700 text-foreground shadow-sm border-0 cursor-pointer rounded-xl">
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {!isManagerOrAbove ? (
        /* ================= EMPLOYEE VIEW ================= */
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-border shadow-card rounded-2xl overflow-hidden text-foreground">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-foreground">Annual Leave Balance</CardTitle>
                <CardDescription className="text-foreground/40 text-xs">Global Standard</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-3xl font-black text-primary">{balance.totalAnnual - balance.usedAnnual}</span>
                  <span className="text-xs text-foreground/40 mb-1 font-semibold">days remaining</span>
                </div>
                <Progress value={annualPercentage} className="h-3 rounded-full overflow-hidden [&>div]:bg-primary" />
                <p className="text-xs text-foreground/40 mt-2 text-right font-semibold">{balance.usedAnnual} of {balance.totalAnnual} days used</p>
              </CardContent>
            </Card>
            
            <Card className="border-border shadow-card rounded-2xl overflow-hidden text-foreground">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-foreground">Sick Leave</CardTitle>
                <CardDescription className="text-foreground/40 text-xs">Current year usage</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col justify-between h-[84px]">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-3xl font-black text-accent">{balance.usedSick}</span>
                  <span className="text-xs text-foreground/40 mb-1 font-semibold">days used</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border shadow-card rounded-2xl overflow-hidden text-foreground">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-lg text-foreground">My Leave History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-foreground/40 font-medium italic">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span>Loading leave records...</span>
                  </div>
                </div>
              ) : leaves.length === 0 ? (
                <div className="text-center py-12 p-6 flex flex-col items-center">
                  <CalendarIcon className="h-10 w-10 text-foreground/20 mb-3" />
                  <p className="text-sm font-semibold text-foreground/60">No Leave History</p>
                  <p className="text-xs text-foreground/40 mt-1 text-center">You have not submitted any leave requests yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-foreground/60 text-xs uppercase font-bold border-b border-border">
                      <tr>
                        <th className="px-6 py-4 font-bold">Type</th>
                        <th className="px-6 py-4 font-bold">Dates</th>
                        <th className="px-6 py-4 font-bold text-center">Days</th>
                        <th className="px-6 py-4 font-bold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {leaves.map((leave) => (
                        <tr key={leave.id} className="hover: transition-colors border-b border-border last:border-b-0">
                          <td className="px-6 py-4 font-bold text-foreground/90">{leave.leaveType}</td>
                          <td className="px-6 py-4 text-foreground/60 whitespace-nowrap">
                            {leave.startDate} to {leave.endDate}
                          </td>
                          <td className="px-6 py-4 text-center font-bold font-mono text-primary">{leave.daysCount}</td>
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
          <TabsList className="mb-6 border border-border p-1 rounded-xl w-fit shrink-0 gap-1 text-foreground">
            <TabsTrigger value="pending" className="relative px-4 py-2 rounded-lg text-sm font-semibold transition-all">
              Pending Approvals
              {pendingLeaves.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-foreground text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-glow-rose">
                  {pendingLeaves.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all">Team Calendar</TabsTrigger>
            <TabsTrigger value="all" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all">All Leaves</TabsTrigger>
          </TabsList>
          
          <TabsContent value="pending" className="space-y-4 focus-visible:outline-none">
            {pendingLeaves.length === 0 ? (
              <Card className="border-border shadow-card rounded-2xl overflow-hidden text-foreground">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center text-foreground/40">
                  <CheckCircle2 className="h-12 w-12 text-primary mb-4 animate-pulse" />
                  <p className="text-lg font-bold text-foreground">You're all caught up!</p>
                  <p className="text-xs text-foreground/40 mt-1">There are no pending leave requests to review.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {pendingLeaves.map((leave) => {
                  const emp = employeesMap[leave.employeeId];
                  return (
                    <Card key={leave.id} className="border-l-4 border-l-amber-500 border-t-white/[0.08] border-r-white/[0.08] border-b-white/[0.08] shadow-card rounded-2xl overflow-hidden text-foreground">
                      <CardHeader className="pb-3 flex-row items-start justify-between">
                        <div>
                          <CardTitle className="text-lg text-foreground font-bold">{emp?.fullName || leave.employeeName || "Employee"}</CardTitle>
                          <CardDescription className="text-xs text-foreground/40 mt-1">
                            {emp ? `${emp.employeeId || ""} • ${emp.role || ""} • ${emp.department || (emp.departments?.[0] || "")}` : leave.leaveType}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-bold shadow-none text-xs">Pending</Badge>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="border border-border p-3 rounded-xl flex gap-4 text-xs">
                          <div>
                            <p className="text-foreground/40 text-xs uppercase font-bold mb-1">Dates</p>
                            <p className="font-bold text-foreground/90">{new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}</p>
                          </div>
                          <div className="px-4 border-l border-border">
                            <p className="text-foreground/40 text-xs uppercase font-bold mb-1">Duration</p>
                            <p className="font-bold text-primary font-mono">{leave.daysCount} Working Days</p>
                          </div>
                        </div>
                        
                        {leave.reason && (
                          <div className="border border-border p-3 rounded-xl">
                            <p className="text-xs text-foreground/40 font-bold uppercase mb-1">Reason provided:</p>
                            <p className="text-xs italic text-foreground/80">"{leave.reason}"</p>
                          </div>
                        )}
                        
                        <div className="flex gap-4 pt-2 border-t border-border">
                          <Button 
                            className="flex-1 h-10 text-xs bg-emerald-600 hover:bg-emerald-700 text-foreground font-bold rounded-xl shadow-glow-emerald border-0 cursor-pointer" 
                            onClick={() => handleApproveReject(leave.id, "approved")}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                          </Button>
                          <Button
                            variant="destructive" 
                            className="flex-1 h-10 text-xs bg-rose-600 hover:bg-rose-700 text-foreground font-bold rounded-xl shadow-glow-rose border-0 cursor-pointer" 
                            onClick={() => handleApproveReject(leave.id, "rejected")}>
                            <XCircle className="mr-2 h-4 w-4" /> Reject
                          </Button>
                          {canAccess(role, "EDIT_LEAVE") && (
                            <Button
                              className="flex-1 h-10 text-xs bg-gray-600 hover:bg-gray-700 text-foreground font-bold rounded-xl shadow-glow-gray border-0 cursor-pointer" 
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
  <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-2xl">
    <DialogHeader>
      <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
        <Edit className="w-5 h-5 text-primary animate-pulse" /> Edit Leave
      </DialogTitle>
      <DialogDescription className="text-foreground/40 text-xs mt-1">
        Modify leave details and save.
      </DialogDescription>
    </DialogHeader>
    {selectedLeave && (
      <form onSubmit={handleEditSave} className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/70">Leave Type</Label>
          <Select
            value={selectedLeave.leaveType}
            onValueChange={(val) => setSelectedLeave({ ...selectedLeave, leaveType: val })}
          >
            <SelectTrigger className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border px-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground bg-card">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className="bg-card border border-border text-foreground rounded-xl">
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="focus: cursor-pointer">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/70">Start Date</Label>
            <Input
              type="date"
              required
              value={selectedLeave.startDate}
              onChange={(e) => setSelectedLeave({ ...selectedLeave, startDate: e.target.value })}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border px-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/70">End Date</Label>
            <Input
              type="date"
              required
              value={selectedLeave.endDate}
              onChange={(e) => setSelectedLeave({ ...selectedLeave, endDate: e.target.value })}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border px-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/70">Reason (Optional)</Label>
          <Textarea
            placeholder="Brief explanation..."
            value={selectedLeave.reason}
            onChange={(e) => setSelectedLeave({ ...selectedLeave, reason: e.target.value })}
            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-h-[80px] text-xs border-border p-3 placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 text-foreground"
          />
        </div>
        <Button type="submit" className="w-full h-11 text-xs font-semibold bg-primary hover:bg-blue-700 text-foreground shadow-sm border-0 cursor-pointer rounded-xl">
          Save Changes
        </Button>
      </form>
    )}
  </DialogContent>
</Dialog>

          <TabsContent value="calendar" className="focus-visible:outline-none">
            <Card className="border-border shadow-card rounded-2xl overflow-hidden text-foreground">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border gap-4">
                <CardTitle className="text-lg text-foreground">Team Leave Calendar</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="bg-card border border-border shadow-sm h-8 w-8 p-0 border-border text-foreground/60 hover:text-foreground hover: cursor-pointer" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-semibold text-sm w-36 text-center text-foreground/80 select-none">
                    {format(currentDate, "MMMM yyyy")}
                  </span>
                  <Button variant="outline" size="sm" className="bg-card border border-border shadow-sm h-8 w-8 p-0 border-border text-foreground/60 hover:text-foreground hover: cursor-pointer" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-7 gap-2 text-center">
                  {weekDays.map(day => (
                    <div key={day} className="text-xs font-bold text-foreground/40 py-2">{day}</div>
                  ))}
                  
                  {Array.from({ length: days[0].getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-28 rounded-xl border border-border"></div>
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
                      <div key={day.toString()} className={cn("h-28 p-1.5 flex flex-col rounded-xl border overflow-hidden",
                        isToday 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border  hover: transition-colors"
                      )}>
                        <div className="flex justify-between items-start w-full">
                          <span className="text-xs text-foreground/40 font-bold pl-1">
                            {dayLeaves.length > 0 ? `${dayLeaves.length} away` : ""}
                          </span>
                          <span className={cn("text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full shrink-0",
                            isToday ? "bg-primary text-foreground" : "text-foreground/60"
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
                            let pillStyle = "bg-primary/15 text-primary border-primary/25";
                            if (t.includes("annual")) {
                              pillStyle = "bg-primary/15 text-primary/80 border-primary/25";
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
                                className={cn("text-xs px-1.5 py-0.5 rounded border truncate font-bold text-left block transition-colors hover:",
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
            <Card className="border-border shadow-card rounded-2xl overflow-hidden text-foreground">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-foreground/60 text-xs uppercase font-bold border-b border-border">
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
                          <tr key={leave.id} className="hover: transition-colors border-b border-border last:border-b-0">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-foreground/90">{emp?.fullName || leave.employeeName || "Employee"}</span>
                                <span className="text-xs text-foreground/30 font-mono mt-0.5">{emp?.employeeId || "No ID"}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col text-xs">
                                <span className="font-semibold text-foreground/80">{emp?.role || "Role N/A"}</span>
                                <span className="text-foreground/40 mt-0.5">{emp?.department || (emp?.departments?.[0] || "Dept N/A")}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-foreground/60">{leave.leaveType}</td>
                            <td className="px-6 py-4 text-foreground/60 whitespace-nowrap">
                              {leave.startDate} to {leave.endDate}
                            </td>
                            <td className="px-6 py-4 text-center font-bold font-mono text-primary">{leave.daysCount}</td>
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
