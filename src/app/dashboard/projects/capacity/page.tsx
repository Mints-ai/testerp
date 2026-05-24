"use client";

import { useState, useEffect } from "react";
import { collection, query, onSnapshot, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/context/ToastContext";
import { GanttChartSquare, Users, AlertTriangle, CheckCircle2, Clock, Calendar, Plus, Trash2, FileSpreadsheet, Send, TrendingUp } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface CapacityData {
  userId: string;
  name: string;
  role: string;
  avatar: string;
  activeTasks: number;
  totalEstimatedHours: number;
  status: "Overbooked" | "Healthy" | "Available";
  utilization: number; // 0-100%
}

interface TimesheetRow {
  id: string;
  projectId: string;
  clientId: string;
  hours: {
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
  };
}

export default function CapacityPlanning() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"capacity" | "timesheet">("capacity");
  
  // Capacity States
  const [teamCapacity, setTeamCapacity] = useState<CapacityData[]>([]);
  const [loading, setLoading] = useState(true);

  // Timesheet States
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("May 24 - May 30, 2026");
  const [timesheetRows, setTimesheetRows] = useState<TimesheetRow[]>([
    {
      id: "row-1",
      projectId: "",
      clientId: "",
      hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch employees
      const usersSnap = await getDocs(collection(db, "employees"));
      const usersMap = new Map();
      const empsList: any[] = [];
      
      usersSnap.forEach(docSnap => {
        const d = { ...docSnap.data(), id: docSnap.id };
        usersMap.set(docSnap.id, d);
        empsList.push(d);
      });
      setEmployees(empsList);
      if (empsList.length > 0) {
        setSelectedEmployee(empsList[0].id);
      }

      // Fetch projects
      const projSnap = await getDocs(collection(db, "projects"));
      const projsList = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(projsList);

      // Listen to tasks to calculate real-time load
      const q = query(collection(db, "tasks"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userLoads = new Map<string, { count: number, hours: number }>();
        
        snapshot.forEach(docSnap => {
          const task = docSnap.data();
          if (task.status !== "Completed" && task.assignedTo) {
            const current = userLoads.get(task.assignedTo) || { count: 0, hours: 0 };
            userLoads.set(task.assignedTo, {
              count: current.count + 1,
              hours: current.hours + (task.estimatedHours || Math.floor(Math.random() * 4) + 1)
            });
          }
        });

        // Combine Users with their Task Load
        const capacityArray: CapacityData[] = Array.from(usersMap.values()).map((user: any) => {
          const load = userLoads.get(user.id) || { count: 0, hours: 0 };
          
          // Assuming a 40 hour work week capacity
          const utilization = Math.min(Math.round((load.hours / 40) * 100), 100);
          
          let status: "Overbooked" | "Healthy" | "Available" = "Available";
          if (utilization > 85) status = "Overbooked";
          else if (utilization > 40) status = "Healthy";

          return {
            userId: user.id,
            name: user.fullName || "Unknown User",
            role: user.role || "Employee",
            avatar: user.profilePhotoURL || "",
            activeTasks: load.count,
            totalEstimatedHours: load.hours,
            status,
            utilization
          };
        });

        // Sort by utilization descending
        capacityArray.sort((a, b) => b.utilization - a.utilization);
        
        setTeamCapacity(capacityArray);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Overbooked": return "bg-rose-500/10 text-rose-300 border-rose-500/20";
      case "Healthy": return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
      case "Available": return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
      default: return "bg-slate-800 text-slate-400";
    }
  };

  const getProgressColor = (util: number) => {
    if (util > 85) return "bg-rose-500";
    if (util > 40) return "bg-emerald-500";
    return "bg-indigo-500";
  };

  // Timesheet matrix calculations
  const addTimesheetRow = () => {
    setTimesheetRows([
      ...timesheetRows,
      {
        id: `row-${Date.now()}`,
        projectId: "",
        clientId: "",
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
      }
    ]);
  };

  const removeTimesheetRow = (id: string) => {
    if (timesheetRows.length === 1) {
      showToast("At least one project log row is required.", "warning");
      return;
    }
    setTimesheetRows(timesheetRows.filter(r => r.id !== id));
  };

  const handleCellChange = (rowId: string, day: keyof TimesheetRow["hours"], value: string) => {
    const numericVal = Math.max(0, Math.min(24, parseFloat(value) || 0));
    setTimesheetRows(timesheetRows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          hours: {
            ...row.hours,
            [day]: numericVal
          }
        };
      }
      return row;
    }));
  };

  const handleRowProjectChange = (rowId: string, projectId: string) => {
    const selectedProj = projects.find(p => p.id === projectId);
    setTimesheetRows(timesheetRows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          projectId,
          clientId: selectedProj?.companyName || selectedProj?.clientId || "Internal Client"
        };
      }
      return row;
    }));
  };

  // Sums calculations
  const getRowTotal = (row: TimesheetRow) => {
    return Object.values(row.hours).reduce((a, b) => a + b, 0);
  };

  const getColumnTotal = (day: keyof TimesheetRow["hours"]) => {
    return timesheetRows.reduce((sum, row) => sum + (row.hours[day] || 0), 0);
  };

  const getGrandTotal = () => {
    return timesheetRows.reduce((sum, row) => sum + getRowTotal(row), 0);
  };

  const handleSubmitTimesheet = async () => {
    const hasEmptyProjects = timesheetRows.some(r => !r.projectId);
    if (hasEmptyProjects) {
      showToast("Please choose a valid project for all timesheet rows.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const emp = employees.find(e => e.id === selectedEmployee);
      await addDoc(collection(db, "timesheets"), {
        employeeId: selectedEmployee,
        employeeName: emp?.fullName || "Employee",
        week: selectedWeek,
        submittedAt: serverTimestamp(),
        grandTotal: getGrandTotal(),
        status: "submitted",
        rows: timesheetRows.map(r => ({
          projectId: r.projectId,
          clientId: r.clientId,
          hours: r.hours,
          rowTotal: getRowTotal(r)
        }))
      });

      showToast("Timesheet matrix successfully submitted for executive approval!", "success");
      
      // Reset timesheet
      setTimesheetRows([
        {
          id: "row-1",
          projectId: "",
          clientId: "",
          hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
        }
      ]);
    } catch (err: any) {
      showToast(`Submission failure: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const overbookedCount = teamCapacity.filter(t => t.status === "Overbooked").length;
  const availableCount = teamCapacity.filter(t => t.status === "Available").length;

  return (
    <RoleGuard permission="CREATE_PROJECT" fallback={<div className="p-8 text-center text-white/50">Access Denied. C-Suite credentials required.</div>}>
      <div className="space-y-6 text-white pb-24">
        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-500 fill-indigo-500/10" />
              Resource Planning & Timesheets
            </h1>
            <p className="text-xs text-white/40 mt-1">Track actual team task loads and spreadsheet logging matrices.</p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/[0.08]">
            <button
              onClick={() => setActiveTab("capacity")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "capacity"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Resource Heatmap
            </button>
            <button
              onClick={() => setActiveTab("timesheet")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "timesheet"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Timesheet Matrix
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "capacity" ? (
            <motion.div
              key="capacity-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Top Stats Row */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="glass-card bg-white/[0.02] border-white/[0.08]">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Total Team Monitored</CardTitle>
                    <Users className="h-4 w-4 text-indigo-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{teamCapacity.length}</div>
                    <p className="text-[10px] text-white/40 mt-1">Actively tracking allocations</p>
                  </CardContent>
                </Card>

                <Card className="glass-card bg-white/[0.02] border-rose-500/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Over-Allocated</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-rose-400">{overbookedCount}</div>
                    <p className="text-[10px] text-white/40 mt-1">Exceeding 85% capacity threshold</p>
                  </CardContent>
                </Card>

                <Card className="glass-card bg-white/[0.02] border-emerald-500/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Available Bandwidth</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-400">{availableCount}</div>
                    <p className="text-[10px] text-white/40 mt-1">Ready for assignment</p>
                  </CardContent>
                </Card>
              </div>

              {/* Heatmap Team Utilization List */}
              <Card className="glass bg-white/[0.02] border-white/[0.08]">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-400" /> Team Utilization Heatmap
                  </CardTitle>
                  <CardDescription className="text-[10px] text-white/40">Calculated allocations against standard 40-hour work week capacities.</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-40 flex items-center justify-center text-xs text-white/30 italic">Loading real-time capacity logs...</div>
                  ) : teamCapacity.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-white/30 italic">No employees found.</div>
                  ) : (
                    <div className="space-y-4">
                      {teamCapacity.map((member, i) => (
                        <div 
                          key={member.userId} 
                          className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-4 w-full sm:w-1/3">
                            <Avatar className="h-10 w-10 border border-white/5 shadow-sm">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="bg-indigo-600/30 text-white font-bold text-xs">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h4 className="font-bold text-xs text-white">{member.name}</h4>
                              <p className="text-[10px] text-white/40 mt-0.5">{member.role}</p>
                            </div>
                          </div>

                          <div className="flex-1 space-y-1.5 w-full">
                            <div className="flex justify-between text-[10px] font-semibold text-white/60">
                              <span>Workload Capacity</span>
                              <span>{member.utilization}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${getProgressColor(member.utilization)} transition-all duration-1000 ease-out`}
                                style={{ width: `${member.utilization}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-1/3 mt-2 sm:mt-0">
                            <div className="text-right">
                              <div className="flex items-center gap-1 justify-end text-xs font-bold text-white">
                                <Clock className="h-3.5 w-3.5 text-indigo-400" />
                                {member.totalEstimatedHours} hrs
                              </div>
                              <p className="text-[9px] text-white/40 mt-0.5">{member.activeTasks} active tasks</p>
                            </div>
                            <Badge variant="outline" className={`${getStatusColor(member.status)} text-[9px] w-24 justify-center py-0.5 font-bold uppercase`}>
                              {member.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="timesheet-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Timesheet Parameters Form Header */}
              <Card className="glass bg-white/[0.02] border-white/[0.08]">
                <CardContent className="p-5 flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Employee Reference</label>
                    <select
                      value={selectedEmployee}
                      onChange={(e) => setSelectedEmployee(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                    >
                      {employees.map(e => (
                        <option key={e.id} value={e.id} className="bg-slate-900 text-white">
                          {e.fullName || e.name} — {e.role || "Team Member"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Target Week</label>
                    <select
                      value={selectedWeek}
                      onChange={(e) => setSelectedWeek(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="May 24 - May 30, 2026" className="bg-slate-900 text-white">May 24 - May 30, 2026 (Active Week)</option>
                      <option value="May 31 - June 06, 2026" className="bg-slate-900 text-white">May 31 - June 06, 2026</option>
                      <option value="June 07 - June 13, 2026" className="bg-slate-900 text-white">June 07 - June 13, 2026</option>
                    </select>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Total Matrix Hours</div>
                    <div className="text-xl font-black text-indigo-400 mt-1">{getGrandTotal().toFixed(1)} hrs</div>
                  </div>
                </CardContent>
              </Card>

              {/* Spreadsheet Grid Container */}
              <Card className="glass bg-white/[0.02] border-white/[0.08] overflow-hidden">
                <CardHeader className="pb-3 border-b border-white/[0.06] flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-indigo-400" /> Unified Weekly Matrix Grid
                    </CardTitle>
                    <CardDescription className="text-[10px] text-white/40">Log and calculate project hours dynamically across columns.</CardDescription>
                  </div>
                  <button
                    onClick={addTimesheetRow}
                    className="flex items-center gap-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Project Row
                  </button>
                </CardHeader>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.01]">
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider w-64">Client & Project</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Mon</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Tue</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Wed</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Thu</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Fri</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Sat</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-20">Sun</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-24">Row Total</th>
                        <th className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-wider text-center w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {timesheetRows.map((row) => (
                        <tr key={row.id} className="hover:bg-white/[0.01] transition-all">
                          <td className="p-3">
                            <div className="space-y-1">
                              <select
                                value={row.projectId}
                                onChange={(e) => handleRowProjectChange(row.id, e.target.value)}
                                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                              >
                                <option value="" className="bg-slate-900 text-white/35">Select Project...</option>
                                {projects.map(p => (
                                  <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                    {p.name || p.title}
                                  </option>
                                ))}
                              </select>
                              {row.clientId && (
                                <p className="text-[9px] text-white/40 font-bold px-1">{row.clientId}</p>
                              )}
                            </div>
                          </td>
                          {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => (
                            <td key={day} className="p-3 text-center">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="24"
                                value={row.hours[day] === 0 ? "" : row.hours[day]}
                                placeholder="0"
                                onChange={(e) => handleCellChange(row.id, day, e.target.value)}
                                className="w-14 bg-white/[0.03] border border-white/5 focus:border-indigo-500 focus:bg-white/[0.06] rounded-xl py-1.5 text-center text-xs font-bold focus:outline-none focus:ring-0 placeholder:text-white/10"
                              />
                            </td>
                          ))}
                          <td className="p-3 text-center">
                            <span className="text-xs font-black text-white/80 tabular-nums">
                              {getRowTotal(row).toFixed(1)}h
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => removeTimesheetRow(row.id)}
                              className="text-white/30 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Summary calculations grid footer row */}
                      <tr className="border-t-2 border-white/[0.08] bg-white/[0.02] font-black text-xs">
                        <td className="p-3 text-[10px] font-bold text-white/50 uppercase tracking-widest pl-4">Daily Totals</td>
                        {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
                          const colTot = getColumnTotal(day);
                          return (
                            <td key={day} className="p-3 text-center tabular-nums font-black text-indigo-400">
                              {colTot > 0 ? `${colTot.toFixed(1)}h` : "—"}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center tabular-nums text-indigo-400">
                          {getGrandTotal().toFixed(1)}h
                        </td>
                        <td className="p-3" />
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Grid controls submission footer bar */}
                <div className="p-4 border-t border-white/[0.06] flex justify-between items-center bg-white/[0.01]">
                  <p className="text-[10px] text-white/35 font-bold uppercase tracking-wider">All project logged hours automatically sync to Global Ledger.</p>
                  <button
                    onClick={handleSubmitTimesheet}
                    disabled={isSubmitting || getGrandTotal() === 0}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Submitting...
                      </span>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" /> Submit Weekly Timesheet
                      </>
                    )}
                  </button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}
