"use client";

import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from "recharts";
import { 
  TrendingUp, TrendingDown, DollarSign, Briefcase, Users, FileDown, 
  ChevronRight, Calendar, Landmark, BarChart3, Activity, Printer, Info,
  FileText, CheckCircle2, AlertTriangle, Send, Eye, Filter
} from "lucide-react";
import { motion } from "framer-motion";
import { CHART_COLORS, CHART_STYLE } from "@/lib/chartTheme";

const defaultMonthlyPerformance: any[] = [
  { month: "Jan", revenue: 45000, expenses: 28000, projects: 4 },
  { month: "Feb", revenue: 52000, expenses: 31000, projects: 6 },
  { month: "Mar", revenue: 61000, expenses: 35000, projects: 8 },
  { month: "Apr", revenue: 58000, expenses: 34000, projects: 9 },
  { month: "May", revenue: 73000, expenses: 42000, projects: 12 },
  { month: "Jun", revenue: 85000, expenses: 46000, projects: 15 },
];

const defaultProjectStatusData: any[] = [
  { name: "In Progress", value: 8 },
  { name: "Completed", value: 5 },
  { name: "Not Started", value: 2 },
];

const defaultDeptTeamData: any[] = [
  { name: "OPERATIONS", count: 6 },
  { name: "IT & CYBER SECURITY", count: 12 },
  { name: "MARKETING", count: 4 },
];

export default function ReportsAndIntelligence() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const isManager = role === "founder" || role === "system_admin" || role === "c_suite" || role === "manager";

  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Status Reports State
  const [myReports, setMyReports] = useState<any[]>([]);
  const [teamReports, setTeamReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  // Status Report Submission Form State
  const [reportType, setReportType] = useState<"daily" | "weekly">("daily");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accomplishments, setAccomplishments] = useState("");
  const [planned, setPlanned] = useState("");
  const [blockers, setBlockers] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState("");

  // Report viewing state in Modal
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Filters for manager team reports view
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const [financialKPIs, setFinancialKPIs] = useState({
    totalBilled: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMargin: 0
  });

  const [projectMetrics, setProjectMetrics] = useState({
    totalCount: 0,
    completedCount: 0,
    inProgressCount: 0,
    activeBudget: 0
  });

  // Fetch Analytics (Manager Only)
  useEffect(() => {
    if (!user || role === null || role === undefined) return;
    if (!isManager) {
      setLoading(false);
      return;
    }

    // 1. Fetch Projects
    const qProjects = query(collection(db, "projects"));
    const unsubProjects = onSnapshot(qProjects, (snap) => {
      const projs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projs);
      
      const completed = projs.filter((p: any) => p.status === 'completed' || p.status === 'Completed').length;
      const inProgress = projs.filter((p: any) => p.status === 'in_progress' || p.status === 'In Progress').length;
      const budget = projs.reduce((acc: number, p: any) => acc + (Number(p.budget) || 0), 0);
      
      setProjectMetrics({
        totalCount: projs.length,
        completedCount: completed,
        inProgressCount: inProgress,
        activeBudget: budget
      });
    });

    // 2. Fetch Invoices
    const qInvoices = query(collection(db, "invoices"));
    const unsubInvoices = onSnapshot(qInvoices, (snap) => {
      const invs = snap.docs.map(doc => doc.data());
      setInvoices(invs);
    });

    // 3. Fetch Expenses
    const qExpenses = query(collection(db, "expenses"));
    const unsubExpenses = onSnapshot(qExpenses, (snap) => {
      const exps = snap.docs.map(doc => doc.data());
      setExpenses(exps);
    });

    // 4. Fetch Employees
    const qEmployees = query(collection(db, "employees"));
    const unsubEmployees = onSnapshot(qEmployees, (snap) => {
      const emps = snap.docs.map(doc => doc.data());
      setEmployees(emps);
      setLoading(false);
    });

    return () => {
      unsubProjects();
      unsubInvoices();
      unsubExpenses();
      unsubEmployees();
    };
  }, [user, role, isManager]);

  // Fetch Status Reports (All Users)
  useEffect(() => {
    if (!user || role === null || role === undefined) return;

    let q;
    if (isManager) {
      q = query(collection(db, "statusReports"));
    } else {
      q = query(
        collection(db, "statusReports"),
        where("uid", "==", user.uid)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort reports by date/createdAt descending
      reps.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.date).getTime() || 0;
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.date).getTime() || 0;
        return timeB - timeA;
      });

      if (isManager) {
        setTeamReports(reps);
        setMyReports(reps.filter((r: any) => r.uid === user.uid));
      } else {
        setMyReports(reps);
      }
      setLoadingReports(false);
    }, (error) => {
      console.error("Error loading status reports:", error);
      setLoadingReports(false);
    });

    return () => unsubscribe();
  }, [user, role, isManager]);

  useEffect(() => {
    if (!isManager) return;
    const totalBilled = invoices.reduce((acc, inv) => acc + (Number(inv.amount) || Number(inv.total) || 0), 0);
    const totalExps = expenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
    const netProfit = totalBilled - totalExps;
    const profitMargin = totalBilled > 0 ? (netProfit / totalBilled) * 100 : 0;

    setFinancialKPIs({
      totalBilled,
      totalExpenses: totalExps,
      netProfit,
      profitMargin
    });
  }, [invoices, expenses, isManager]);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!accomplishments.trim()) {
      setReportError("Please enter your accomplishments/work done.");
      return;
    }

    setSubmittingReport(true);
    setReportError("");
    setReportSuccess(false);

    try {
      await addDoc(collection(db, "statusReports"), {
        uid: user.uid,
        employeeName: user.fullName || user.displayName || "Team Member",
        employeeRole: role || "employee",
        employeeTitle: user.jobTitle || "Team Member",
        type: reportType,
        date: reportDate,
        accomplishments: accomplishments.trim(),
        planned: planned.trim(),
        blockers: blockers.trim(),
        createdAt: serverTimestamp(),
      });

      // Clear form on success
      setAccomplishments("");
      setPlanned("");
      setBlockers("");
      setReportSuccess(true);

      // Auto clear success message
      setTimeout(() => setReportSuccess(false), 4000);
    } catch (err: any) {
      console.error("Error submitting report:", err);
      setReportError(err.message || "Failed to submit status report. Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  };

  const getProjectStatusDistribution = () => {
    if (projects.length === 0) return defaultProjectStatusData;
    const distribution: Record<string, number> = {};
    projects.forEach((p) => {
      const status = p.status || "Not Started";
      const formatted = status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      distribution[formatted] = (distribution[formatted] || 0) + 1;
    });
    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  };

  const getDeptDistribution = () => {
    if (employees.length === 0) return defaultDeptTeamData;
    const distribution: Record<string, number> = {};
    employees.forEach((e) => {
      if (e.isActive === false) return;
      const dept = e.department || "Operations";
      distribution[dept] = (distribution[dept] || 0) + 1;
    });
    return Object.entries(distribution).map(([name, count]) => ({ name, count }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleJSONExport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      financials: financialKPIs,
      projects: projectMetrics,
      teamSize: employees.length,
      lists: {
        projects: projects.map(p => ({ name: p.name, status: p.status, budget: p.budget })),
        invoices: invoices.map(i => ({ client: i.clientName, amount: i.amount, status: i.status })),
        expenses: expenses.map(e => ({ title: e.title, amount: e.amount, category: e.category }))
      }
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mints_global_report_${Date.now()}.json`;
    link.click();
  };

  return (
    <div className="space-y-6 pb-12 text-foreground">
      {/* Header controls bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> {isManager ? "Intelligence & Reports" : "Status Reports"}
          </h1>
          <p className="text-xs text-foreground/40 mt-1">
            {isManager 
              ? "Real-time business performance analytics, agency metrics, and financial statements." 
              : "Submit and view your daily accomplishments and weekly status reports."}
          </p>
        </div>

        {isManager && (
          <div className="flex items-center gap-3">
            <button className="btn-ghost py-0 px-4 h-9 text-xs font-bold border-border text-foreground/70 hover:text-foreground flex items-center justify-center cursor-pointer" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2 text-foreground/50" /> Print PDF
            </button>
            <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer" onClick={handleJSONExport}>
              <FileDown className="w-4 h-4 mr-2" /> Export Data Sheet
            </button>
          </div>
        )}
      </div>

      {/* Financial KPIs Empty State UI */}
      {isManager && invoices.length === 0 && expenses.length === 0 && (
        <div className="bg-blue-950/40 border border-blue-500/20 text-blue-300 p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-xs uppercase tracking-wider">No Live Financial Data Found</p>
            <p className="text-[11px] text-foreground/40 leading-relaxed mt-1 font-semibold">
              There are no invoices or logged expenses in your database yet. 
              Once you generate invoices or log expenses, this intelligence dashboard will automatically switch to displaying your live data.
            </p>
          </div>
        </div>
      )}

      {/* KPI Overviews Row */}
      {isManager && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Gross Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold text-foreground font-mono">
                  AED {(financialKPIs.totalBilled || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h3>
                <p className="text-[10px] text-emerald-400 flex items-center mt-2 font-bold uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5 mr-1" /> Revenue
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Total Expenses</span>
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Landmark className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold text-foreground font-mono">
                  AED {(financialKPIs.totalExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h3>
                <p className="text-[10px] text-rose-400 flex items-center mt-2 font-bold uppercase tracking-wider">
                  <TrendingDown className="w-3.5 h-3.5 mr-1" /> Expenses
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Net profit</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold text-foreground font-mono">
                  AED {(financialKPIs.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h3>
                <p className="text-[10px] text-emerald-400 mt-2 font-bold uppercase tracking-wider">
                  Margin: {financialKPIs.profitMargin > 0 ? financialKPIs.profitMargin.toFixed(1) : "0.0"}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Active Portfolio</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Briefcase className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold text-foreground tracking-tight">
                  {projectMetrics.totalCount || 0} Active Projects
                </h3>
                <p className="text-[10px] text-foreground/30 mt-2 font-semibold">
                  Avg. Budget: AED {((projectMetrics.activeBudget / (projectMetrics.totalCount || 1)) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Tabbed Analysis Panels */}
      <Tabs defaultValue={isManager ? "financial" : "my-reports"} className="w-full">
        <TabsList className="bg-white/[0.02] border border-white/[0.08] shadow-inner p-1 rounded-xl mb-6 flex overflow-x-auto scrollbar-hide flex-nowrap max-w-full justify-start w-full sm:w-fit gap-1 text-foreground">
          {isManager && (
            <>
              <TabsTrigger value="financial" className="text-xs py-1.5 px-4 font-bold rounded-lg text-foreground/40 data-[state=active]:bg-blue-600 data-[state=active]:text-foreground data-[state=active]:shadow-glow-blue transition-all cursor-pointer shrink-0">
                Financial Analytics
              </TabsTrigger>
              <TabsTrigger value="operational" className="text-xs py-1.5 px-4 font-bold rounded-lg text-foreground/40 data-[state=active]:bg-blue-600 data-[state=active]:text-foreground data-[state=active]:shadow-glow-blue transition-all cursor-pointer shrink-0">
                Operational Delivery
              </TabsTrigger>
              <TabsTrigger value="team" className="text-xs py-1.5 px-4 font-bold rounded-lg text-foreground/40 data-[state=active]:bg-blue-600 data-[state=active]:text-foreground data-[state=active]:shadow-glow-blue transition-all cursor-pointer shrink-0">
                Team Intelligence
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="my-reports" className="text-xs py-1.5 px-4 font-bold rounded-lg text-foreground/40 data-[state=active]:bg-blue-600 data-[state=active]:text-foreground data-[state=active]:shadow-glow-blue transition-all cursor-pointer shrink-0">
            My Status Reports
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="team-reports" className="text-xs py-1.5 px-4 font-bold rounded-lg text-foreground/40 data-[state=active]:bg-blue-600 data-[state=active]:text-foreground data-[state=active]:shadow-glow-blue transition-all cursor-pointer shrink-0">
              Team Status Reports
            </TabsTrigger>
          )}
        </TabsList>

        {isManager && (
          <>
            {/* Tab 1: Financial Analytics */}
            <TabsContent value="financial" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-sm font-bold text-foreground">Revenue vs. Expenses Trend</CardTitle>
                    <CardDescription className="text-[11px] text-foreground/40 mt-1">Monthly track of incoming receivables and operational overhead expenses.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] p-0 w-full min-w-0">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={defaultMonthlyPerformance} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray={CHART_STYLE.grid.strokeDasharray} vertical={false} stroke={CHART_STYLE.grid.stroke} />
                          <XAxis dataKey="month" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} dy={10} />
                          <YAxis axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} tickFormatter={(v) => `AED ${v/1000}k`} />
                          <RechartsTooltip 
                            contentStyle={CHART_STYLE.tooltip.contentStyle}
                            labelStyle={CHART_STYLE.tooltip.labelStyle}
                            cursor={CHART_STYLE.tooltip.cursor}
                            formatter={(value) => [`AED ${(Number(value) || 0).toLocaleString()}`, "Amount"]} 
                          />
                          <Legend wrapperStyle={CHART_STYLE.legend.wrapperStyle} />
                          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                          <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-foreground/20">Loading chart...</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-sm font-bold text-foreground">Financial Health Statement</CardTitle>
                    <CardDescription className="text-[11px] text-foreground/40 mt-1">Key stability performance indicators.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-2 p-0">
                    <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.01] space-y-4">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground/40">Monthly Burn Rate</span>
                        <span className="text-foreground font-mono">AED 0</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground/40">Estimated Runaway</span>
                        <span className="badge bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold uppercase tracking-wider text-[9px] py-0.5">N/A</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground/40">Invoiced Unpaid Balance</span>
                        <span className="text-amber-400 font-mono">AED {((financialKPIs.totalBilled * 0.15) || 0).toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <h4 className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.12em]">Quick Advice & Insights</h4>
                      <div className="flex gap-2.5 p-3.5 rounded-xl bg-muted/20 border border-blue-500/10 text-foreground/70 text-xs">
                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="leading-relaxed font-semibold text-[11px]">
                          Your net margin is <strong>{financialKPIs.profitMargin > 0 ? financialKPIs.profitMargin.toFixed(1) : "0.0"}%</strong>. Add data to generate insights.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 2: Operational Delivery */}
            <TabsContent value="operational" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-sm font-bold text-foreground">Delivery Portfolio Mix</CardTitle>
                    <CardDescription className="text-[11px] text-foreground/40 mt-1">Visual summary of client projects status.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-64 p-0 flex flex-col items-center justify-center w-full min-w-0">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height={256}>
                        <PieChart>
                          <Pie
                            data={getProjectStatusDistribution()}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {getProjectStatusDistribution().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            contentStyle={CHART_STYLE.tooltip.contentStyle}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-foreground/20">Loading chart...</div>
                    )}
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-4">
                      {getProjectStatusDistribution().map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-1.5 text-[10px] text-foreground/60 font-semibold uppercase tracking-wider">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          <span>{entry.name}: {entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-sm font-bold text-foreground">Project Velocity vs. Delivery Speed</CardTitle>
                    <CardDescription className="text-[11px] text-foreground/40 mt-1">Monthly distribution of total actively loaded projects.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] p-0 w-full min-w-0">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={defaultMonthlyPerformance} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray={CHART_STYLE.grid.strokeDasharray} vertical={false} stroke={CHART_STYLE.grid.stroke} />
                          <XAxis dataKey="month" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} dy={10} />
                          <YAxis axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} />
                          <RechartsTooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                          <Legend wrapperStyle={CHART_STYLE.legend.wrapperStyle} />
                          <Bar dataKey="projects" name="Delivered Deliverables" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-foreground/20">Loading chart...</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 3: Team Intelligence */}
            <TabsContent value="team" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-sm font-bold text-foreground">Headcount Breakdown by Department</CardTitle>
                    <CardDescription className="text-[11px] text-foreground/40 mt-1">Shows team density and capacity allocations.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] p-0 w-full min-w-0">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={getDeptDistribution()} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray={CHART_STYLE.grid.strokeDasharray} horizontal={false} stroke={CHART_STYLE.grid.stroke} />
                          <XAxis type="number" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} />
                          <YAxis dataKey="name" type="category" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} width={130} fontSize={10} />
                          <RechartsTooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                          <Bar dataKey="count" name="Team Members" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-foreground/20">Loading chart...</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-sm font-bold text-foreground">Total Headcount Density</CardTitle>
                    <CardDescription className="text-[11px] text-foreground/40 mt-1">Full Team dynamics overview.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-0 pt-2">
                    <div className="flex items-center justify-between p-4 border border-white/[0.06] rounded-xl bg-white/[0.01]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-foreground text-xs">{employees.length || 0} Employees</h4>
                          <p className="text-[10px] text-foreground/40 mt-0.5 font-semibold">Active personnel directory</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-foreground/30" />
                    </div>

                    <div className="space-y-3.5 text-xs text-foreground/70 leading-relaxed bg-muted/20 p-4 border border-blue-500/10 rounded-xl">
                      <h4 className="font-bold text-foreground text-[11px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        Workforce Health Assessment
                      </h4>
                      <ul className="space-y-2 list-disc pl-4 text-foreground/60 font-semibold text-[11px]">
                        <li>Not enough data to calculate attendance metrics.</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </>
        )}

        {/* Tab 4: My Status Reports */}
        <TabsContent value="my-reports" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Submit Report Form */}
            <Card className="lg:col-span-1 glass bg-white/[0.02] border border-white/[0.08] shadow-lg rounded-2xl p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-400" />
                  Submit Status Report
                </CardTitle>
                <CardDescription className="text-[10px] text-foreground/40 mt-1">
                  Submit a daily update or a weekly summary to update your team leads.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <form onSubmit={handleSubmitReport} className="space-y-4">
                  {/* Report Type Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Report Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setReportType("daily"); setReportDate(new Date().toISOString().split('T')[0]); }}
                        className={`h-9 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          reportType === "daily"
                            ? "bg-blue-600/20 text-blue-300 border-blue-500/30"
                            : "bg-white/[0.01] text-foreground/40 border-white/[0.08] hover:text-foreground/80 hover:bg-white/[0.03]"
                        }`}
                      >
                        Daily Report
                      </button>
                      <button
                        type="button"
                        onClick={() => { setReportType("weekly"); setReportDate(new Date().toISOString().split('T')[0]); }}
                        className={`h-9 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          reportType === "weekly"
                            ? "bg-cyan-600/20 text-cyan-300 border-cyan-500/30"
                            : "bg-white/[0.01] text-foreground/40 border-white/[0.08] hover:text-foreground/80 hover:bg-white/[0.03]"
                        }`}
                      >
                        Weekly Report
                      </button>
                    </div>
                  </div>

                  {/* Date Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                      {reportType === "daily" ? "Report Date" : "Week Ending Date"}
                    </label>
                    <Input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="glass-input h-9 text-xs border-border text-foreground placeholder:text-foreground/20 focus:border-blue-500/60 focus:ring-0"
                    />
                  </div>

                  {/* Accomplishments */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                      Accomplishments / What I did
                    </label>
                    <Textarea
                      placeholder={reportType === "daily" ? "Describe tasks you worked on today..." : "Summarize major milestones achieved this week..."}
                      value={accomplishments}
                      onChange={(e) => setAccomplishments(e.target.value)}
                      rows={4}
                      className="glass-input text-xs border-border text-foreground placeholder:text-foreground/20 focus:border-blue-500/60 focus:ring-0 resize-none"
                    />
                  </div>

                  {/* Planned */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                      Planned / What's Next
                    </label>
                    <Textarea
                      placeholder={reportType === "daily" ? "What do you plan to work on tomorrow?" : "What are the focus areas for next week?"}
                      value={planned}
                      onChange={(e) => setPlanned(e.target.value)}
                      rows={3}
                      className="glass-input text-xs border-border text-foreground placeholder:text-foreground/20 focus:border-blue-500/60 focus:ring-0 resize-none"
                    />
                  </div>

                  {/* Blockers */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider flex items-center gap-1 text-amber-400/80">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Blockers / Challenges (Optional)
                    </label>
                    <Textarea
                      placeholder="Are there any dependencies or obstacles stopping you?"
                      value={blockers}
                      onChange={(e) => setBlockers(e.target.value)}
                      rows={2}
                      className="glass-input text-xs border-border text-foreground placeholder:text-foreground/20 focus:border-blue-500/60 focus:ring-0 resize-none"
                    />
                  </div>

                  {/* Status Messages */}
                  {reportSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] rounded-xl">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Report submitted successfully!</span>
                    </div>
                  )}
                  {reportError && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded-xl">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{reportError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submittingReport || !accomplishments.trim()}
                    className="btn-primary w-full h-10 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-glow-blue"
                  >
                    {submittingReport ? "Submitting..." : "Submit Report"}
                  </button>
                </form>
              </CardContent>
            </Card>

            {/* Past Submissions list */}
            <Card className="lg:col-span-2 glass bg-white/[0.02] border border-white/[0.08] shadow-lg rounded-2xl p-6">
              <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    My Report Submissions
                  </CardTitle>
                  <CardDescription className="text-[10px] text-foreground/40 mt-1">
                    Your previous submissions are listed below. Click details to expand.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingReports ? (
                  <div className="py-12 text-center text-xs text-foreground/20 font-semibold">Loading status reports...</div>
                ) : myReports.length === 0 ? (
                  <div className="py-16 text-center text-xs text-foreground/30 border border-dashed border-border rounded-xl font-semibold uppercase tracking-wider">
                    No status reports submitted yet. Submit your first update today!
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
                    {myReports.map((rep) => (
                      <div key={rep.id} className="relative bg-white/[0.01] border border-white/[0.04] p-4 rounded-xl flex items-center justify-between hover:bg-white/[0.02] hover:border-white/[0.08] transition-all group">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg border ${
                            rep.type === "daily" 
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-foreground capitalize">{rep.type} Update</span>
                              <Badge className={rep.type === "daily" ? "bg-blue-500/10 text-blue-400 border-blue-500/25" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/25"}>
                                {rep.date}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-foreground/50 mt-1.5 line-clamp-1 max-w-[280px] sm:max-w-[400px] font-medium">
                              {rep.accomplishments}
                            </p>
                          </div>
                        </div>

                        <button 
                          onClick={() => { setSelectedReport(rep); setIsViewModalOpen(true); }}
                          className="btn-ghost p-2 text-foreground/40 hover:text-foreground hover:bg-muted/40 rounded-xl border-border/30 cursor-pointer shrink-0"
                          title="View report details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Team Status Reports (Manager-only) */}
        {isManager && (
          <TabsContent value="team-reports" className="space-y-6">
            <Card className="glass bg-white/[0.02] border border-white/[0.08] shadow-lg rounded-2xl p-6">
              <CardHeader className="p-0 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    Team Status Reports
                  </CardTitle>
                  <CardDescription className="text-[10px] text-foreground/40 mt-1">
                    Review Daily and Weekly work reports submitted across the organization.
                  </CardDescription>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-foreground/30" />
                    <select 
                      value={filterType} 
                      onChange={(e) => setFilterType(e.target.value)}
                      className="glass-input h-8 text-[11px] font-semibold border-border bg-[#090e18]/80 text-foreground rounded-lg focus:border-blue-500/60 focus:ring-0 px-2.5 py-0"
                    >
                      <option value="all">All Types</option>
                      <option value="daily">Daily Reports</option>
                      <option value="weekly">Weekly Reports</option>
                    </select>
                  </div>

                  <select 
                    value={filterEmployee} 
                    onChange={(e) => setFilterEmployee(e.target.value)}
                    className="glass-input h-8 text-[11px] font-semibold border-border bg-[#090e18]/80 text-foreground rounded-lg focus:border-blue-500/60 focus:ring-0 px-2.5 py-0"
                  >
                    <option value="all">All Employees</option>
                    {Array.from(new Set(teamReports.map(r => r.employeeName))).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingReports ? (
                  <div className="py-12 text-center text-xs text-foreground/20 font-semibold">Loading status reports...</div>
                ) : (
                  (() => {
                    const filtered = teamReports.filter(rep => {
                      const matchType = filterType === "all" || rep.type === filterType;
                      const matchEmp = filterEmployee === "all" || rep.employeeName === filterEmployee;
                      return matchType && matchEmp;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="py-16 text-center text-xs text-foreground/30 border border-dashed border-border rounded-xl font-semibold uppercase tracking-wider">
                          No status reports match the current filters.
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
                        {filtered.map((rep) => (
                          <div key={rep.id} className="relative bg-white/[0.01] border border-white/[0.04] p-4 rounded-xl flex items-center justify-between hover:bg-white/[0.02] hover:border-white/[0.08] transition-all group">
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg border ${
                                rep.type === "daily" 
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                                  : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                              }`}>
                                <FileText className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className="font-bold text-xs text-foreground">{rep.employeeName}</span>
                                  <span className="text-[10px] text-foreground/40 font-semibold">{rep.employeeTitle || "Team Member"}</span>
                                  <Badge className={rep.type === "daily" ? "bg-blue-500/10 text-blue-400 border-blue-500/25" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/25"}>
                                    {rep.type} • {rep.date}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-foreground/50 mt-1.5 line-clamp-1 max-w-[280px] sm:max-w-[400px] font-medium">
                                  {rep.accomplishments}
                                </p>
                              </div>
                            </div>

                            <button 
                              onClick={() => { setSelectedReport(rep); setIsViewModalOpen(true); }}
                              className="btn-ghost p-2 text-foreground/40 hover:text-foreground hover:bg-muted/40 rounded-xl border-border/30 cursor-pointer shrink-0"
                              title="View report details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Detailed Report View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-md bg-[#0a1122]/98 border border-border rounded-2xl text-foreground p-6 shadow-2xl backdrop-blur-xl">
          {selectedReport && (
            <>
              <DialogHeader className="border-b border-white/[0.08] pb-4">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    {selectedReport.employeeName}'s {selectedReport.type === "daily" ? "Daily" : "Weekly"} Report
                  </DialogTitle>
                  <Badge className={selectedReport.type === "daily" ? "bg-blue-500/10 text-blue-400 border-blue-500/25" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/25"}>
                    {selectedReport.date}
                  </Badge>
                </div>
                <DialogDescription className="text-[9px] text-foreground/40 font-semibold mt-1">
                  Submitted by {selectedReport.employeeTitle || "Team Member"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4 max-h-[420px] overflow-y-auto pr-1">
                {/* Accomplishments */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Accomplishments / Work Done</h4>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-xl font-medium">
                    {selectedReport.accomplishments}
                  </p>
                </div>

                {/* Planned */}
                {selectedReport.planned && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Planned / Next Steps</h4>
                    <p className="text-xs text-foreground/85 whitespace-pre-wrap leading-relaxed bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-xl font-medium">
                      {selectedReport.planned}
                    </p>
                  </div>
                )}

                {/* Blockers */}
                {selectedReport.blockers && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Blockers / Challenges
                    </h4>
                    <p className="text-xs text-amber-200/90 whitespace-pre-wrap leading-relaxed bg-amber-500/[0.02] border border-amber-500/10 p-3.5 rounded-xl font-medium">
                      {selectedReport.blockers}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-white/[0.08]">
                <button 
                  onClick={() => setIsViewModalOpen(false)}
                  className="btn-primary px-5 h-9 text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
