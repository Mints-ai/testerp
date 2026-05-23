"use client";

import { useState, useEffect } from "react";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from "recharts";
import { 
  TrendingUp, TrendingDown, DollarSign, Briefcase, Users, FileDown, 
  ChevronRight, Calendar, Landmark, BarChart3, Activity, Printer, Info
} from "lucide-react";
import { motion } from "framer-motion";
import { CHART_COLORS, CHART_STYLE } from "@/lib/chartTheme";

const defaultMonthlyPerformance: any[] = [];
const defaultProjectStatusData: any[] = [];
const defaultDeptTeamData: any[] = [];

export default function ReportsAndIntelligence() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

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

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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
  }, [invoices, expenses]);

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
    <div className="space-y-6 pb-12 text-white">
      {/* Header controls bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> Intelligence & Reports
          </h1>
          <p className="text-xs text-white/40 mt-1">Real-time business performance analytics, agency metrics, and financial statements.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-ghost py-0 px-4 h-9 text-xs font-bold border-white/10 text-white/70 hover:text-white flex items-center justify-center cursor-pointer" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2 text-white/50" /> Print PDF
          </button>
          <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer" onClick={handleJSONExport}>
            <FileDown className="w-4 h-4 mr-2" /> Export Data Sheet
          </button>
        </div>
      </div>

      {/* Financial KPIs Empty State UI */}
      {invoices.length === 0 && expenses.length === 0 && (
        <div className="bg-blue-950/40 border border-blue-500/20 text-blue-300 p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-xs uppercase tracking-wider">No Live Financial Data Found</p>
            <p className="text-[11px] text-white/40 leading-relaxed mt-1 font-semibold">
              There are no invoices or logged expenses in your database yet. 
              Once you generate invoices or log expenses, this intelligence dashboard will automatically switch to displaying your live data.
            </p>
          </div>
        </div>
      )}

      {/* KPI Overviews Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Gross Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold text-white font-mono">
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
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Total Expenses</span>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Landmark className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold text-white font-mono">
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
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Net profit</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold text-white font-mono">
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
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Active Portfolio</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold text-white tracking-tight">
                {projectMetrics.totalCount || 0} Active Projects
              </h3>
              <p className="text-[10px] text-white/30 mt-2 font-semibold">
                Avg. Budget: AED {((projectMetrics.activeBudget / (projectMetrics.totalCount || 1)) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabbed Analysis Panels */}
      <Tabs defaultValue="financial" className="w-full">
        <TabsList className="bg-white/[0.02] border border-white/[0.08] shadow-inner p-1 rounded-xl mb-6">
          <TabsTrigger value="financial" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">
            Financial Analytics
          </TabsTrigger>
          <TabsTrigger value="operational" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">
            Operational Delivery
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">
            Team Intelligence
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Financial Analytics */}
        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-sm font-bold text-white">Revenue vs. Expenses Trend</CardTitle>
                <CardDescription className="text-[11px] text-white/40 mt-1">Monthly track of incoming receivables and operational overhead expenses.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] p-0 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
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
              </CardContent>
            </Card>

            <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-sm font-bold text-white">Financial Health Statement</CardTitle>
                <CardDescription className="text-[11px] text-white/40 mt-1">Key stability performance indicators.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-2 p-0">
                <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.01] space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white/40">Monthly Burn Rate</span>
                    <span className="text-white font-mono">AED 0</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white/40">Estimated Runaway</span>
                    <span className="badge bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold uppercase tracking-wider text-[9px] py-0.5">N/A</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white/40">Invoiced Unpaid Balance</span>
                    <span className="text-amber-400 font-mono">AED {((financialKPIs.totalBilled * 0.15) || 0).toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.12em]">Quick Advice & Insights</h4>
                  <div className="flex gap-2.5 p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/10 text-white/70 text-xs">
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
                <CardTitle className="text-sm font-bold text-white">Delivery Portfolio Mix</CardTitle>
                <CardDescription className="text-[11px] text-white/40 mt-1">Visual summary of client projects status.</CardDescription>
              </CardHeader>
              <CardContent className="h-64 p-0 flex flex-col items-center justify-center w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
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
                
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-4">
                  {getProjectStatusDistribution().map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-[10px] text-white/60 font-semibold uppercase tracking-wider">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span>{entry.name}: {entry.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-sm font-bold text-white">Project Velocity vs. Delivery Speed</CardTitle>
                <CardDescription className="text-[11px] text-white/40 mt-1">Monthly distribution of total actively loaded projects.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] p-0 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={defaultMonthlyPerformance} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray={CHART_STYLE.grid.strokeDasharray} vertical={false} stroke={CHART_STYLE.grid.stroke} />
                    <XAxis dataKey="month" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} dy={10} />
                    <YAxis axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} />
                    <RechartsTooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                    <Legend wrapperStyle={CHART_STYLE.legend.wrapperStyle} />
                    <Bar dataKey="projects" name="Delivered Deliverables" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Team Intelligence */}
        <TabsContent value="team" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-sm font-bold text-white">Headcount Breakdown by Department</CardTitle>
                <CardDescription className="text-[11px] text-white/40 mt-1">Shows team density and capacity allocations.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] p-0 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getDeptDistribution()} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray={CHART_STYLE.grid.strokeDasharray} horizontal={false} stroke={CHART_STYLE.grid.stroke} />
                    <XAxis type="number" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} />
                    <YAxis dataKey="name" type="category" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} width={130} fontSize={10} />
                    <RechartsTooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                    <Bar dataKey="count" name="Team Members" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-sm font-bold text-white">Total Headcount Density</CardTitle>
                <CardDescription className="text-[11px] text-white/40 mt-1">Full Team dynamics overview.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-0 pt-2">
                <div className="flex items-center justify-between p-4 border border-white/[0.06] rounded-xl bg-white/[0.01]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">{employees.length || 0} Employees</h4>
                      <p className="text-[10px] text-white/40 mt-0.5 font-semibold">Active personnel directory</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>

                <div className="space-y-3.5 text-xs text-white/70 leading-relaxed bg-blue-950/30 p-4 border border-blue-500/10 rounded-xl">
                  <h4 className="font-bold text-white text-[11px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    Workforce Health Assessment
                  </h4>
                  <ul className="space-y-2 list-disc pl-4 text-white/60 font-semibold text-[11px]">
                    <li>Not enough data to calculate attendance metrics.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
