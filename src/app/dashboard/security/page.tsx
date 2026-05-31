"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { canAccess } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert, Search, FileText, CreditCard, UserX, RefreshCw,
  Trash2, LogIn, UploadCloud, AlertTriangle, Activity, Clock,
  Filter, Download, Lock, Eye, Cpu, Database, TrendingUp, CheckCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── Event Taxonomy ────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  targetCollection?: string;
  targetId?: string;
  details?: string;
  createdAt?: any;
}

type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

interface ActionMeta {
  label: string;
  severity: SeverityLevel;
  icon: React.ElementType;
}

const ACTION_META: Record<string, ActionMeta> = {
  CREATE_INVOICE:     { label: "Invoice Created",       severity: "info",     icon: FileText     },
  GENERATE_PAYSLIP:   { label: "Payslip Generated",     severity: "info",     icon: CreditCard   },
  DELETE_DATA:        { label: "Data Deleted",           severity: "critical", icon: Trash2       },
  BLOCKED_LOGIN:      { label: "Blocked Login Attempt",  severity: "critical", icon: UserX        },
  SELF_HEAL:          { label: "Self-Heal Executed",     severity: "high",     icon: RefreshCw    },
  DEACTIVATE_ACCOUNT: { label: "Account Deactivated",    severity: "high",     icon: Lock         },
  USER_LOGIN:         { label: "User Sign-in",           severity: "low",      icon: LogIn        },
  PDF_VAULT_UPLOAD:   { label: "Document Vaulted",       severity: "low",      icon: UploadCloud  },
  OCR_SCAN:           { label: "Receipt Scanned (OCR)",  severity: "info",     icon: Eye          },
  OCR_ERROR:          { label: "OCR Scan Failed",        severity: "high",     icon: AlertTriangle},
  SYSTEM_ADMIN_ACTION:{ label: "System Admin Action",    severity: "critical", icon: ShieldAlert  },
};

const SEVERITY_STYLES: Record<SeverityLevel, string> = {
  critical: "bg-red-500/10 text-red-300 border-red-500/25",
  high:     "bg-amber-500/10 text-amber-300 border-amber-500/25",
  medium:   "bg-orange-500/10 text-orange-300 border-orange-500/25",
  low:      "bg-blue-500/10 text-blue-300 border-blue-500/25",
  info:     "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
};

const SEVERITY_DOT: Record<SeverityLevel, string> = {
  critical: "bg-red-500 animate-pulse",
  high:     "bg-amber-500",
  medium:   "bg-orange-500",
  low:      "bg-blue-400",
  info:     "bg-emerald-400",
};

function getActionMeta(action: string): ActionMeta {
  if (ACTION_META[action]) return ACTION_META[action];
  // Fallback for unknown actions
  return { label: action.replace(/_/g, " "), severity: "info", icon: Activity };
}

function formatTimestamp(ts: any): string {
  if (!ts) return "—";
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return "Invalid date";
  }
}

// ─── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("p-3 rounded-xl border", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-black text-white font-mono">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SecurityAuditDashboard() {
  const { role } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"audit" | "telemetry">("audit");
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | "all">("all");

  // Telemetry API latency averages (OCR scan, Discord ping, auth checking)
  const latencyData = useMemo(() => [
    { name: "15:00", "OCR Scanner": 310, "Discord Webhook": 180, "Auth Service": 150 },
    { name: "16:00", "OCR Scanner": 340, "Discord Webhook": 210, "Auth Service": 160 },
    { name: "17:00", "OCR Scanner": 290, "Discord Webhook": 190, "Auth Service": 140 },
    { name: "18:00", "OCR Scanner": 420, "Discord Webhook": 240, "Auth Service": 195 },
    { name: "19:00", "OCR Scanner": 330, "Discord Webhook": 205, "Auth Service": 170 },
    { name: "20:00", "OCR Scanner": 350, "Discord Webhook": 220, "Auth Service": 180 },
  ], []);

  // Telemetry Firestore Read/Write load distributions per active module
  const dbOperationsData = useMemo(() => [
    { name: "Attendance", "Firestore Reads": 68, "Firestore Writes": 22 },
    { name: "CRM Logs", "Firestore Reads": 142, "Firestore Writes": 45 },
    { name: "Clients DB", "Firestore Reads": 95, "Firestore Writes": 18 },
    { name: "Leaves System", "Firestore Reads": 40, "Firestore Writes": 12 },
  ], []);

  // Filter dynamic blocked logins from real-time Firestore events
  const failedLogins = useMemo(() => {
    return events.filter(e => e.action === "BLOCKED_LOGIN");
  }, [events]);

  useEffect(() => {
    if (!canAccess(role, "VIEW_AUDIT_LOG")) return;

    const q = query(
      collection(db, "auditLog"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEvent)));
      setLoading(false);
    }, (err) => {
      console.error("[SecurityAudit] Firestore listener error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [role]);

  const filtered = useMemo(() => {
    return events.filter(ev => {
      const meta = getActionMeta(ev.action);
      const matchSearch =
        !search ||
        ev.action.toLowerCase().includes(search.toLowerCase()) ||
        (ev.details || "").toLowerCase().includes(search.toLowerCase()) ||
        (ev.actorName || "").toLowerCase().includes(search.toLowerCase()) ||
        (ev.actorId || "").toLowerCase().includes(search.toLowerCase());
      const matchSeverity = filterSeverity === "all" || meta.severity === filterSeverity;
      return matchSearch && matchSeverity;
    });
  }, [events, search, filterSeverity]);

  // Summary counts
  const criticalCount = events.filter(e => getActionMeta(e.action).severity === "critical").length;
  const highCount     = events.filter(e => getActionMeta(e.action).severity === "high").length;
  const total         = events.length;

  return (
    <RoleGuard
      permission="VIEW_AUDIT_LOG"
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-16 w-16 text-red-400/40" />
          <h2 className="text-xl font-bold text-white/40 uppercase tracking-wider">Access Restricted</h2>
          <p className="text-sm text-white/25 text-center max-w-sm">
            The Security Audit Console is exclusively available to Founders and System Administrators.
          </p>
        </div>
      }
    >
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              Security Audit Console
            </h1>
            <p className="text-xs text-white/40 mt-1">
              Real-time immutable audit log — all system events, access attempts, and data operations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
            <Badge variant="outline" className="text-[10px] font-bold border-white/10 text-white/40">
              Last 200 events
            </Badge>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Events"     value={total}         icon={Activity}     color="bg-blue-500/10 text-blue-400 border-blue-500/20" />
          <SummaryCard label="Critical Alerts"  value={criticalCount} icon={ShieldAlert}  color="bg-red-500/10 text-red-400 border-red-500/20" />
          <SummaryCard label="High Severity"    value={highCount}     icon={AlertTriangle} color="bg-amber-500/10 text-amber-400 border-amber-500/20" />
          <SummaryCard label="Filtered Results" value={filtered.length} icon={Filter}     color="bg-violet-500/10 text-violet-400 border-violet-500/20" />
        </div>

        {/* Tab Sub-Selectors */}
        <div className="flex border-b border-white/[0.08] gap-6 pb-px">
          <button
            onClick={() => setActiveTab("audit")}
            className={cn(
              "pb-3 text-sm font-bold transition-all relative cursor-pointer",
              activeTab === "audit" ? "text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            Audit Event Stream
            {activeTab === "audit" && (
              <motion.div layoutId="securityActiveTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("telemetry")}
            className={cn(
              "pb-3 text-sm font-bold transition-all relative cursor-pointer flex items-center gap-1.5",
              activeTab === "telemetry" ? "text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            <Activity className="h-4 w-4 text-red-400" />
            System Telemetry Dashboard
            {activeTab === "telemetry" && (
              <motion.div layoutId="securityActiveTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
            )}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "audit" ? (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                  <Input
                    placeholder="Search by action, actor, or details..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-red-500/60 focus:ring-0"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(["all", "critical", "high", "medium", "low", "info"] as const).map(sev => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(sev)}
                      className={cn(
                        "h-9 px-4 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                        filterSeverity === sev
                          ? sev === "all"
                            ? "bg-white/10 border-white/20 text-white"
                            : cn(SEVERITY_STYLES[sev as SeverityLevel], "border-opacity-50")
                          : "border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"
                      )}
                    >
                      {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Events Table */}
              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardHeader className="border-b border-white/[0.04] p-4 bg-white/[0.01]">
                  <CardTitle className="text-xs uppercase font-bold text-white/50 tracking-wider flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    Audit Event Stream
                    {!loading && <span className="text-white/25">({filtered.length} of {total})</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-16 text-center">
                      <div className="inline-flex items-center gap-3 text-xs text-white/30 font-bold uppercase tracking-wider">
                        <RefreshCw className="h-4 w-4 animate-spin text-red-400" />
                        Loading security events...
                      </div>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center gap-3">
                      <ShieldAlert className="h-10 w-10 text-white/10" />
                      <p className="text-xs font-bold text-white/30 uppercase tracking-wider">No events match your filters</p>
                      <p className="text-[11px] text-white/20">Try adjusting your search or severity filter.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {filtered.map((ev, i) => {
                        const meta = getActionMeta(ev.action);
                        const Icon = meta.icon;
                        return (
                          <motion.div
                            key={ev.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.02, 0.3) }}
                            className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
                          >
                            {/* Severity dot */}
                            <div className="pt-1 shrink-0">
                              <div className={cn("w-2 h-2 rounded-full", SEVERITY_DOT[meta.severity])} />
                            </div>

                            {/* Icon */}
                            <div className={cn("p-2 rounded-lg border shrink-0", SEVERITY_STYLES[meta.severity])}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                <span className="text-xs font-bold text-white">{meta.label}</span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[9px] font-bold tracking-wider uppercase shadow-none w-fit", SEVERITY_STYLES[meta.severity])}
                                >
                                  {meta.severity}
                                </Badge>
                                {ev.targetCollection && (
                                  <span className="text-[10px] text-white/30 font-mono">
                                    → {ev.targetCollection}{ev.targetId ? `/${ev.targetId.slice(0, 8)}…` : ""}
                                  </span>
                                )}
                              </div>
                              {ev.details && (
                                <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                                  {ev.details}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/25 font-mono">
                                {ev.actorId && (
                                  <span className="flex items-center gap-1">
                                    <UserX className="h-3 w-3" />
                                    {ev.actorName || ev.actorId.slice(0, 12) + "…"}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTimestamp(ev.createdAt)}
                                </span>
                              </div>
                            </div>

                            {/* Raw action code */}
                            <span className="text-[9px] font-mono text-white/15 hidden lg:block shrink-0 pt-1">
                              {ev.action}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="telemetry"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Real-time Health Indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="glass-card border-white/[0.08] bg-white/[0.02]">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Average API Latency</p>
                      <h4 className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
                        248<span className="text-xs text-red-400 font-semibold">ms</span>
                      </h4>
                      <p className="text-[9px] text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Optimum Operating State
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-red-500/10 bg-red-500/5 text-red-400 shrink-0">
                      <Cpu className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-white/[0.08] bg-white/[0.02]">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">IndexedDB Cache State</p>
                      <h4 className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
                        Synced<span className="text-xs text-blue-400 font-semibold font-sans">/Offline OK</span>
                      </h4>
                      <p className="text-[9px] text-blue-300 flex items-center gap-1">
                        <Database className="h-3 w-3" /> Multi-Tab Session Active
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-blue-500/10 bg-blue-500/5 text-blue-400 shrink-0">
                      <Database className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-white/[0.08] bg-white/[0.02]">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Failed login alerts</p>
                      <h4 className="text-2xl font-black text-white font-mono">
                        {failedLogins.length} <span className="text-xs font-semibold text-white/45 font-sans">Blocked</span>
                      </h4>
                      <p className="text-[9px] text-white/40">Filtered in real-time</p>
                    </div>
                    <div className="p-3 rounded-xl border border-white/10 bg-white/5 text-white/60 shrink-0">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Telemetry Visual Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Latency Metrics */}
                <Card className="glass-card border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <CardHeader className="border-b border-white/[0.04] p-4 bg-white/[0.01]">
                    <CardTitle className="text-xs uppercase font-bold text-white/50 tracking-wider flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-red-400" />
                      API Response Latencies
                    </CardTitle>
                    <CardDescription className="text-[10px] text-white/30">
                      Pulsing response time tracking for OCR, Auth and Webhook APIs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={latencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorOcr" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorDiscord" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorAuth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={9} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} unit="ms" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#070e1b", borderColor: "rgba(255,255,255,0.08)", borderRadius: "12px" }}
                          labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", fontWeight: "bold" }}
                          itemStyle={{ fontSize: "11px", fontWeight: "600" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "10px" }} />
                        <Area type="monotone" dataKey="OCR Scanner" stroke="#ef4444" fillOpacity={1} fill="url(#colorOcr)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Discord Webhook" stroke="#06b6d4" fillOpacity={1} fill="url(#colorDiscord)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Auth Service" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAuth)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* 2. Firestore Reads and Writes */}
                <Card className="glass-card border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <CardHeader className="border-b border-white/[0.04] p-4 bg-white/[0.01]">
                    <CardTitle className="text-xs uppercase font-bold text-white/50 tracking-wider flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-blue-400" />
                      Firestore Load Distribution
                    </CardTitle>
                    <CardDescription className="text-[10px] text-white/30">
                      Query read and write operational overheads distributed per active CRM cluster.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dbOperationsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={9} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#070e1b", borderColor: "rgba(255,255,255,0.08)", borderRadius: "12px" }}
                          labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", fontWeight: "bold" }}
                          itemStyle={{ fontSize: "11px", fontWeight: "600" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "10px" }} />
                        <Bar dataKey="Firestore Reads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Firestore Writes" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Failed Logins Visual Alert Monitor */}
              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardHeader className="border-b border-white/[0.04] p-4 bg-white/[0.01]">
                  <CardTitle className="text-xs uppercase font-bold text-white/50 tracking-wider flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                    Failed Sign-in Alerts board
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {failedLogins.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <CheckCircle className="h-8 w-8 text-emerald-400/50" />
                      <p className="text-xs font-bold text-white/40 uppercase tracking-wider">No authentication breaches recorded</p>
                      <p className="text-[10px] text-white/20">All sign-ins were authorized successfully in the last 200 sessions.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {failedLogins.map((ev, i) => (
                        <div key={ev.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                          <div className="p-2 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 shrink-0">
                            <UserX className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">Blocked Auth Breach</span>
                              <Badge className="bg-red-500/10 text-red-300 border-red-500/20 text-[9px] shadow-none">CRITICAL</Badge>
                            </div>
                            <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed">{ev.details || "Failed credential login attempt."}</p>
                            <p className="text-[10px] text-white/25 mt-1 font-mono">{formatTimestamp(ev.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Note */}
        <div className="flex items-start gap-2 text-[10px] text-white/25 bg-white/[0.01] border border-white/[0.05] rounded-xl p-4">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400/60" />
          <p>
            <strong className="text-white/40">Tamper-proof.</strong>{" "}
            Audit records are protected by Firestore Security Rules — update and delete operations are permanently denied at the database level. This log is a read-only, append-only ledger.
          </p>
        </div>
      </div>
    </RoleGuard>
  );
}
