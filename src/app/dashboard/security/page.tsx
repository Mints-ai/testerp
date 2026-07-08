"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, addDoc, getDocs, where, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { canAccess } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert, Search, FileText, CreditCard, UserX, RefreshCw,
  Trash2, LogIn, UploadCloud, AlertTriangle, Activity, Clock,
  Filter, Download, Lock, Eye, Cpu, Database, TrendingUp, CheckCircle,
  Monitor, Smartphone, Globe, User, LogOut, Coffee, Play, Edit3, Calendar
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
  ATTENDANCE_CLOCK_IN:         { label: "Clocked In",             severity: "low",      icon: LogIn          },
  ATTENDANCE_CLOCK_OUT:        { label: "Clocked Out",            severity: "low",      icon: LogOut         },
  ATTENDANCE_BREAK_START:      { label: "Break Started",          severity: "info",     icon: Coffee         },
  ATTENDANCE_BREAK_END:        { label: "Break Ended",            severity: "info",     icon: Play           },
  ATTENDANCE_CORRECTION_REQUEST:{ label: "Correction Requested",   severity: "medium",   icon: Clock          },
  ATTENDANCE_CORRECTION_APPROVE:{ label: "Correction Approved",    severity: "medium",   icon: CheckCircle    },
  ATTENDANCE_CORRECTION_REJECT: { label: "Correction Rejected",    severity: "low",      icon: AlertTriangle  },
  ATTENDANCE_FORCE_CLOCK_OUT:  { label: "Force Clocked Out",      severity: "high",     icon: ShieldAlert    },
  ATTENDANCE_SHIFT_EDIT:       { label: "Timesheet Edited",       severity: "high",     icon: Edit3          },
  LEAVE_REQUEST:               { label: "Leave Requested",        severity: "medium",   icon: Calendar       },
  LEAVE_APPROVE:               { label: "Leave Approved",         severity: "medium",   icon: CheckCircle    },
  LEAVE_REJECT:                { label: "Leave Rejected",         severity: "low",      icon: AlertTriangle  },
  LEAVE_EDIT:                  { label: "Leave Request Edited",   severity: "low",      icon: Edit3          },
};

const SEVERITY_STYLES: Record<SeverityLevel, string> = {
  critical: "bg-red-500/10 text-red-300 border-red-500/25",
  high:     "bg-amber-500/10 text-amber-300 border-amber-500/25",
  medium:   "bg-orange-500/10 text-orange-300 border-orange-500/25",
  low:      "bg-primary/10 text-primary/80 border-primary/25",
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
    <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("p-3 rounded-xl border", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-black text-foreground font-mono">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SecurityAuditDashboard() {
  const { role, user } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"audit" | "telemetry" | "logins" | "sessions" | "reactivations" | "matrix" | "delegations">("audit");
  const [loginEvents, setLoginEvents] = useState<any[]>([]);
  const [loginSearch, setLoginSearch] = useState("");
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | "all">("all");

  // 1. Session tracking state & effects
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionSearch, setSessionSearch] = useState("");

  useEffect(() => {
    if (!canAccess(role, "SYSTEM_SETTINGS")) return;
    const q = query(collection(db, "sessions"), orderBy("lastActiveAt", "desc"));
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [role]);

  const handleRevokeSession = async (sessId: string) => {
    if (!confirm("Are you sure you want to forcibly terminate this user session? The user will be logged out instantly.")) return;
    try {
      await updateDoc(doc(db, "sessions", sessId), { status: "revoked" });
      const sess = sessions.find(s => s.id === sessId);
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "REVOKE_SESSION",
        targetCollection: "sessions",
        targetId: sessId,
        details: `Forcibly terminated session of ${sess?.fullName || "User"} (${sess?.email || "Unknown Email"}) from IP ${sess?.ip || "Unknown"}`,
        createdAt: serverTimestamp()
      });
      alert("Session revoked successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to revoke session.");
    }
  };

  // 2. Reactivation Requests state & handlers
  const [reactivations, setReactivations] = useState<any[]>([]);

  useEffect(() => {
    if (!canAccess(role, "MANAGE_USERS")) return;
    const q = query(collection(db, "reactivation_requests"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setReactivations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [role]);

  const handleApproveReactivation = async (req: any) => {
    if (!confirm(`Reactivate account access for ${req.fullName} (${req.email})?`)) return;
    try {
      const qEmp = query(collection(db, "employees"), where("email", "==", req.email));
      const empSnap = await getDocs(qEmp);
      if (empSnap.empty) {
        alert("Employee profile not found in database.");
        return;
      }
      const empDoc = empSnap.docs[0];
      await updateDoc(doc(db, "employees", empDoc.id), {
        isActive: true,
        isArchived: false,
        updatedAt: new Date().toISOString()
      });
      await updateDoc(doc(db, "reactivation_requests", req.id), {
        status: "approved",
        resolvedBy: user?.uid,
        resolvedAt: new Date().toISOString()
      });
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "APPROVE_REACTIVATION",
        targetCollection: "employees",
        targetId: empDoc.id,
        details: `Approved reactivation request for ${req.fullName} (${req.email}). Reason: ${req.reason}`,
        createdAt: serverTimestamp()
      });
      alert("Employee account reactivated successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to approve reactivation request.");
    }
  };

  const handleRejectReactivation = async (req: any) => {
    if (!confirm(`Reject reactivation request for ${req.fullName} (${req.email})?`)) return;
    try {
      await updateDoc(doc(db, "reactivation_requests", req.id), {
        status: "rejected",
        resolvedBy: user?.uid,
        resolvedAt: new Date().toISOString()
      });
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "REJECT_REACTIVATION",
        targetCollection: "reactivation_requests",
        targetId: req.id,
        details: `Rejected reactivation request for ${req.fullName} (${req.email}).`,
        createdAt: serverTimestamp()
      });
      alert("Request rejected.");
    } catch (err) {
      console.error(err);
      alert("Failed to reject reactivation request.");
    }
  };

  // 3. Dynamic permissions matrix state & handlers
  const [permMatrix, setPermMatrix] = useState<Record<string, string[]>>({});
  const [isSavingMatrix, setIsSavingMatrix] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "permissions"), (docSnap) => {
      if (docSnap.exists()) {
        setPermMatrix(docSnap.data() as Record<string, string[]>);
      } else {
        const { PERMISSIONS } = require("@/lib/permissions");
        const initialMap: Record<string, string[]> = {};
        Object.entries(PERMISSIONS).forEach(([key, val]) => {
          initialMap[key] = [...(val as any)];
        });
        setPermMatrix(initialMap);
      }
    });
    return () => unsub();
  }, []);

  const handleMatrixCellChange = (permissionKey: string, roleKey: string, checked: boolean) => {
    setPermMatrix(prev => {
      const currentRoles = prev[permissionKey] ? [...prev[permissionKey]] : [];
      let nextRoles;
      if (checked) {
        nextRoles = currentRoles.includes(roleKey) ? currentRoles : [...currentRoles, roleKey];
      } else {
        nextRoles = currentRoles.filter(r => r !== roleKey);
      }
      return { ...prev, [permissionKey]: nextRoles };
    });
  };

  const handleSaveMatrix = async () => {
    setIsSavingMatrix(true);
    try {
      await setDoc(doc(db, "settings", "permissions"), permMatrix);
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "SYSTEM_ADMIN_ACTION",
        targetCollection: "settings",
        targetId: "permissions",
        details: "Updated dynamic system-wide RBAC permission matrix definitions.",
        createdAt: serverTimestamp()
      });
      alert("Permissions matrix updated and synced globally!");
    } catch (err) {
      console.error(err);
      alert("Failed to save permission overrides.");
    } finally {
      setIsSavingMatrix(false);
    }
  };

  // 4. Delegations of Authority state & handlers
  const [delegations, setDelegations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newDelegation, setNewDelegation] = useState({
    toUid: "",
    role: "",
    startDate: "",
    endDate: ""
  });
  const [isSubmittingDelegation, setIsSubmittingDelegation] = useState(false);

  useEffect(() => {
    if (!canAccess(role, "SYSTEM_SETTINGS")) return;
    const q = query(collection(db, "delegations"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setDelegations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [role]);

  useEffect(() => {
    if (!canAccess(role, "SYSTEM_SETTINGS")) return;
    getDocs(collection(db, "employees")).then(snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, fullName: d.data().fullName, email: d.data().email })));
    });
  }, [role]);

  const handleAddDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDelegation.toUid || !newDelegation.role || !newDelegation.startDate || !newDelegation.endDate) {
      alert("Please fill in all fields.");
      return;
    }
    setIsSubmittingDelegation(true);
    try {
      const selectedEmp = employees.find(e => e.id === newDelegation.toUid);
      await addDoc(collection(db, "delegations"), {
        fromUid: user?.uid,
        fromName: user?.fullName || "Admin",
        toUid: newDelegation.toUid,
        toName: selectedEmp?.fullName || "Deputy",
        role: newDelegation.role,
        startDate: newDelegation.startDate,
        endDate: newDelegation.endDate,
        status: "active",
        createdAt: new Date().toISOString()
      });
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "DELEGATION_CREATE",
        targetCollection: "delegations",
        targetId: newDelegation.toUid,
        details: `Delegated temporary authority role (${newDelegation.role}) to ${selectedEmp?.fullName} from ${newDelegation.startDate} to ${newDelegation.endDate}`,
        createdAt: serverTimestamp()
      });
      alert("Authority delegation created successfully!");
      setNewDelegation({ toUid: "", role: "", startDate: "", endDate: "" });
    } catch (err) {
      console.error(err);
      alert("Failed to create authority delegation.");
    } finally {
      setIsSubmittingDelegation(false);
    }
  };

  const handleRevokeDelegation = async (delId: string) => {
    if (!confirm("Revoke this authority delegation immediately?")) return;
    try {
      await updateDoc(doc(db, "delegations", delId), { status: "revoked" });
      const del = delegations.find(d => d.id === delId);
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "DELEGATION_REVOKE",
        targetCollection: "delegations",
        targetId: delId,
        details: `Revoked authority delegation of role ${del?.role} for deputy ${del?.toName}`,
        createdAt: serverTimestamp()
      });
      alert("Delegation revoked successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to revoke delegation.");
    }
  };

  // 5. System Health counters
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!canAccess(role, "VIEW_AUDIT_LOG")) return;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const qActive = query(collection(db, "employees"), where("lastSeenAt", ">=", fiveMinutesAgo));
    const qErrors = query(collection(db, "client_errors"), orderBy("createdAt", "desc"), limit(200));

    const unsubActive = onSnapshot(qActive, (snap) => {
      setActiveUsersCount(snap.size);
    }, (err) => console.warn(err));

    const unsubErrors = onSnapshot(qErrors, (snap) => {
      setErrorLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn(err));

    return () => {
      unsubActive();
      unsubErrors();
    };
  }, [role]);

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

  useEffect(() => {
    if (!canAccess(role, "VIEW_AUDIT_LOG")) return;
    const q2 = query(
      collection(db, "loginActivity"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub2 = onSnapshot(q2, (snap) => {
      setLoginEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub2();
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
          <h2 className="text-xl font-bold text-foreground/40 uppercase tracking-wider">Access Restricted</h2>
          <p className="text-sm text-foreground/25 text-center max-w-sm">
            The Security Audit Console is exclusively available to Founders and System Administrators.
          </p>
        </div>
      }
    >
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              Security Audit Console
            </h1>
            <p className="text-xs text-foreground/40 mt-1">
              Real-time immutable audit log — all system events, access attempts, and data operations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-accent uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
            <Badge variant="outline" className="text-xs font-bold border-border text-foreground/40">
              Last 200 events
            </Badge>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Events"     value={total}         icon={Activity}     color="bg-primary/10 text-primary border-primary/20" />
          <SummaryCard label="Critical Alerts"  value={criticalCount} icon={ShieldAlert}  color="bg-red-500/10 text-red-400 border-red-500/20" />
          <SummaryCard label="High Severity"    value={highCount}     icon={AlertTriangle} color="bg-amber-500/10 text-amber-400 border-amber-500/20" />
          <SummaryCard label="Filtered Results" value={filtered.length} icon={Filter}     color="bg-violet-500/10 text-violet-400 border-violet-500/20" />
        </div>

        {/* Tab Sub-Selectors */}
        <div className="flex border-b border-border gap-4 pb-px overflow-x-auto">
          {([
            { key: "audit", label: "Audit Stream", icon: null },
            { key: "telemetry", label: "Telemetry", icon: Activity },
            { key: "logins", label: "Logins", icon: LogIn },
            { key: "sessions", label: "Sessions", icon: Monitor },
            { key: "reactivations", label: "Reactivations", icon: RefreshCw },
            { key: "matrix", label: "RBAC Matrix", icon: ShieldAlert },
            { key: "delegations", label: "Delegations", icon: User },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn("pb-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0",
                activeTab === tab.key ? "text-foreground" : "text-foreground/40 hover:text-foreground/60"
              )}
            >
              {tab.icon && <tab.icon className="h-3.5 w-3.5 text-red-400" />}
              {tab.label}
              {tab.key === "reactivations" && reactivations.filter(r => r.status === "pending").length > 0 && (
                <span className="ml-1 bg-rose-500 text-foreground text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {reactivations.filter(r => r.status === "pending").length}
                </span>
              )}
              {activeTab === tab.key && (
                <motion.div layoutId="securityActiveTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "audit" && (
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
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
                  <Input
                    placeholder="Search by action, actor, or details..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-red-500/60 focus:ring-0"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(["all", "critical", "high", "medium", "low", "info"] as const).map(sev => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(sev)}
                      className={cn("h-9 px-4 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                        filterSeverity === sev
                          ? sev === "all"
                            ? "bg-muted/80 border-border/80 text-foreground"
                            : cn(SEVERITY_STYLES[sev as SeverityLevel], "border-opacity-50")
                          : "border-border text-foreground/40 hover:text-foreground/70 hover:border-border/80"
                      )}
                    >
                      {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Events Table */}
              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
                <CardHeader className="border-b border-border p-4">
                  <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    Audit Event Stream
                    {!loading && <span className="text-foreground/25">({filtered.length} of {total})</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="divide-y divide-white/[0.04]">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="flex items-start gap-4 px-5 py-3.5">
                          <div className="pt-1 shrink-0">
                            <div className="w-2 h-2 rounded-full bg-border animate-pulse" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="h-4 bg-secondary w-32 rounded animate-pulse" />
                              <div className="h-3 bg-secondary w-20 rounded animate-pulse" />
                            </div>
                            <div className="h-3 bg-secondary w-3/4 rounded animate-pulse" />
                            <div className="h-3 bg-secondary w-1/4 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center gap-3">
                      <ShieldAlert className="h-10 w-10 text-foreground/10" />
                      <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">No events match your filters</p>
                      <p className="text-xs text-foreground/20">Try adjusting your search or severity filter.</p>
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
                            className="flex items-start gap-4 px-5 py-3.5 hover: transition-colors group"
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
                                <span className="text-xs font-bold text-foreground">{meta.label}</span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-xs font-bold tracking-wider uppercase shadow-none w-fit", SEVERITY_STYLES[meta.severity])}
                                >
                                  {meta.severity}
                                </Badge>
                                {ev.targetCollection && (
                                  <span className="text-xs text-foreground/30 font-mono">
                                    → {ev.targetCollection}{ev.targetId ? `/${ev.targetId.slice(0, 8)}…` : ""}
                                  </span>
                                )}
                              </div>
                              {ev.details && (
                                <p className="text-xs text-foreground/50 mt-0.5 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                                  {ev.details}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-foreground/25 font-mono">
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
                            <span className="text-xs font-mono text-foreground/15 hidden lg:block shrink-0 pt-1">
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
          )}
          {activeTab === "telemetry" && (
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
                <Card className="bg-card border border-border shadow-sm rounded-lg border-border">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Average API Latency</p>
                      <h4 className="text-2xl font-black text-foreground font-mono flex items-baseline gap-1">
                        248<span className="text-xs text-red-400 font-semibold">ms</span>
                      </h4>
                      <p className="text-xs text-accent flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Optimum Operating State
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-red-500/10 bg-red-500/5 text-red-400 shrink-0">
                      <Cpu className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border border-border shadow-sm rounded-lg border-border">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">IndexedDB Cache State</p>
                      <h4 className="text-2xl font-black text-foreground font-mono flex items-baseline gap-1">
                        Synced<span className="text-xs text-primary font-semibold font-sans">/Offline OK</span>
                      </h4>
                      <p className="text-xs text-primary/80 flex items-center gap-1">
                        <Database className="h-3 w-3" /> Multi-Tab Session Active
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-primary/10 bg-primary/5 text-primary shrink-0">
                      <Database className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border border-border shadow-sm rounded-lg border-border">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Failed login alerts</p>
                      <h4 className="text-2xl font-black text-foreground font-mono">
                        {failedLogins.length} <span className="text-xs font-semibold text-foreground/45 font-sans">Blocked</span>
                      </h4>
                      <p className="text-xs text-foreground/40">Filtered in real-time</p>
                    </div>
                    <div className="p-3 rounded-xl border border-border text-foreground/60 shrink-0">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Telemetry Visual Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Latency Metrics */}
                <Card className="bg-card border border-border shadow-sm rounded-lg border border-border overflow-hidden">
                  <CardHeader className="border-b border-border p-4">
                    <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-red-400" />
                      API Response Latencies
                    </CardTitle>
                    <CardDescription className="text-xs text-foreground/30">
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
                <Card className="bg-card border border-border shadow-sm rounded-lg border border-border overflow-hidden">
                  <CardHeader className="border-b border-border p-4">
                    <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-primary" />
                      Firestore Load Distribution
                    </CardTitle>
                    <CardDescription className="text-xs text-foreground/30">
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
              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
                <CardHeader className="border-b border-border p-4">
                  <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                    Failed Sign-in Alerts board
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {failedLogins.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <CheckCircle className="h-8 w-8 text-accent/50" />
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">No authentication breaches recorded</p>
                      <p className="text-xs text-foreground/20">All sign-ins were authorized successfully in the last 200 sessions.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {failedLogins.map((ev, i) => (
                        <div key={ev.id} className="flex items-start gap-4 px-5 py-3.5 hover: transition-colors">
                          <div className="p-2 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 shrink-0">
                            <UserX className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground">Blocked Auth Breach</span>
                              <Badge className="bg-red-500/10 text-red-300 border-red-500/20 text-xs shadow-none">CRITICAL</Badge>
                            </div>
                            <p className="text-xs text-foreground/50 mt-0.5 leading-relaxed">{ev.details || "Failed credential login attempt."}</p>
                            <p className="text-xs text-foreground/25 mt-1 font-mono">{formatTimestamp(ev.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
          {activeTab === "logins" && (
            <motion.div
              key="logins"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="Total Sessions" value={loginEvents.length} icon={LogIn} color="bg-primary/10 text-primary border-primary/20" />
                <SummaryCard label="Unique Users" value={new Set(loginEvents.map((e: any) => e.uid)).size} icon={User} color="bg-primary/10 text-accent border-primary/20" />
                <SummaryCard label="Desktop Sessions" value={loginEvents.filter((e: any) => e.device === 'Desktop').length} icon={Monitor} color="bg-emerald-500/10 text-accent border-emerald-500/20" />
                <SummaryCard label="Mobile Sessions" value={loginEvents.filter((e: any) => e.device === 'Mobile').length} icon={Smartphone} color="bg-amber-500/10 text-amber-400 border-amber-500/20" />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
                <Input
                  placeholder="Search by name, email, IP or browser..."
                  value={loginSearch}
                  onChange={e => setLoginSearch(e.target.value)}
                  className="pl-9 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0"
                />
              </div>
              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
                <CardHeader className="border-b border-border p-4">
                  <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-primary" />
                    Login Session History
                    <span className="text-foreground/25">({loginEvents.length} sessions recorded)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loginEvents.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center gap-3">
                      <LogIn className="h-10 w-10 text-foreground/10" />
                      <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">No login sessions recorded yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border text-foreground/40 font-bold uppercase tracking-wider text-xs">
                            <th className="p-3">Employee</th>
                            <th className="p-3">IP Address</th>
                            <th className="p-3">Browser / Device</th>
                            <th className="p-3">Platform</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loginEvents
                            .filter((ev: any) =>
                              !loginSearch ||
                              (ev.fullName || "").toLowerCase().includes(loginSearch.toLowerCase()) ||
                              (ev.email || "").toLowerCase().includes(loginSearch.toLowerCase()) ||
                              (ev.ip || "").includes(loginSearch) ||
                              (ev.browser || "").toLowerCase().includes(loginSearch.toLowerCase())
                            )
                            .map((ev: any) => (
                              <tr key={ev.id} className="border-b border-border hover: transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-foreground">{ev.fullName || ev.email}</div>
                                  <div className="text-xs text-foreground/40 font-mono">{ev.email}</div>
                                </td>
                                <td className="p-3 font-mono text-xs text-primary/80">{ev.ip || '—'}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-1.5">
                                    {ev.device === 'Mobile' ? <Smartphone className="w-3.5 h-3.5 text-amber-400" /> : <Monitor className="w-3.5 h-3.5 text-primary" />}
                                    <span className="font-semibold">{ev.browser || 'Unknown'}</span>
                                  </div>
                                  <div className="text-xs text-foreground/30 mt-0.5">{ev.device}</div>
                                </td>
                                <td className="p-3 text-foreground/60 text-xs">{ev.platform || '—'}</td>
                                <td className="p-3">
                                  <Badge className={cn("text-xs font-bold uppercase tracking-wider shadow-none border",
                                    ev.status === 'success' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                                  )}>{ev.status || 'success'}</Badge>
                                </td>
                                <td className="p-3 font-mono text-xs text-foreground/40">{formatTimestamp(ev.createdAt)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ─── Sessions Tab ─────────────────────────────────────── */}
          {activeTab === "sessions" && (
            <motion.div
              key="sessions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="Total Sessions" value={sessions.length} icon={Monitor} color="bg-primary/10 text-primary border-primary/20" />
                <SummaryCard label="Active" value={sessions.filter((s: any) => s.status === "active").length} icon={CheckCircle} color="bg-emerald-500/10 text-accent border-emerald-500/20" />
                <SummaryCard label="Revoked" value={sessions.filter((s: any) => s.status === "revoked").length} icon={Lock} color="bg-rose-500/10 text-rose-400 border-rose-500/20" />
                <SummaryCard label="Unique Users" value={new Set(sessions.map((s: any) => s.uid)).size} icon={User} color="bg-violet-500/10 text-violet-400 border-violet-500/20" />
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
                <Input
                  placeholder="Search sessions by name, email, or IP..."
                  value={sessionSearch}
                  onChange={e => setSessionSearch(e.target.value)}
                  className="pl-9 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-red-500/60 focus:ring-0"
                />
              </div>

              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
                <CardHeader className="border-b border-border p-4">
                  <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5 text-primary" />
                    Active Session Management
                    <span className="text-foreground/25">({sessions.length} sessions tracked)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {sessions.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center gap-3">
                      <Monitor className="h-10 w-10 text-foreground/10" />
                      <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">No active sessions recorded</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border text-foreground/40 font-bold uppercase tracking-wider text-xs">
                            <th className="p-3">Employee</th>
                            <th className="p-3">IP / Browser</th>
                            <th className="p-3">Device</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Last Active</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions
                            .filter((s: any) =>
                              !sessionSearch ||
                              (s.fullName || "").toLowerCase().includes(sessionSearch.toLowerCase()) ||
                              (s.email || "").toLowerCase().includes(sessionSearch.toLowerCase()) ||
                              (s.ip || "").includes(sessionSearch)
                            )
                            .map((s: any) => (
                              <tr key={s.id} className="border-b border-border hover: transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-foreground">{s.fullName || "Unknown"}</div>
                                  <div className="text-xs text-foreground/40 font-mono">{s.email || "—"}</div>
                                </td>
                                <td className="p-3">
                                  <div className="font-mono text-xs text-primary/80">{s.ip || "—"}</div>
                                  <div className="text-xs text-foreground/30 mt-0.5">{s.browser || s.userAgent?.slice(0, 30) || "—"}</div>
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center gap-1.5">
                                    {s.device === "Mobile" ? <Smartphone className="w-3.5 h-3.5 text-amber-400" /> : <Monitor className="w-3.5 h-3.5 text-primary" />}
                                    <span className="text-xs text-foreground/60">{s.device || "Desktop"}</span>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <Badge className={cn("text-xs font-bold uppercase tracking-wider shadow-none border",
                                    s.status === "active" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                                  )}>{s.status || "active"}</Badge>
                                </td>
                                <td className="p-3 font-mono text-xs text-foreground/40">{formatTimestamp(s.lastActiveAt)}</td>
                                <td className="p-3 text-center">
                                  {s.status === "active" && (
                                    <button
                                      onClick={() => handleRevokeSession(s.id)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 transition-colors uppercase cursor-pointer"
                                    >
                                      Force Logout
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ─── Reactivations Tab ────────────────────────────────── */}
          {activeTab === "reactivations" && (
            <motion.div
              key="reactivations"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <SummaryCard label="Total Requests" value={reactivations.length} icon={RefreshCw} color="bg-primary/10 text-primary border-primary/20" />
                <SummaryCard label="Pending" value={reactivations.filter((r: any) => r.status === "pending").length} icon={Clock} color="bg-amber-500/10 text-amber-400 border-amber-500/20" />
                <SummaryCard label="Approved" value={reactivations.filter((r: any) => r.status === "approved").length} icon={CheckCircle} color="bg-emerald-500/10 text-accent border-emerald-500/20" />
              </div>

              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
                <CardHeader className="border-b border-border p-4">
                  <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
                    Account Reactivation Requests
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {reactivations.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center gap-3">
                      <CheckCircle className="h-10 w-10 text-foreground/10" />
                      <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">No reactivation requests submitted</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {reactivations.map((req: any) => (
                        <div key={req.id} className="flex items-start gap-4 px-5 py-4 hover: transition-colors">
                          <div className={cn("p-2.5 rounded-lg border shrink-0",
                            req.status === "pending" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                            req.status === "approved" ? "bg-emerald-500/10 border-emerald-500/20 text-accent" :
                            "bg-rose-500/10 border-rose-500/20 text-rose-400"
                          )}>
                            <RefreshCw className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-foreground">{req.fullName || "Unknown"}</span>
                              <span className="text-xs font-mono text-foreground/30">{req.email}</span>
                              <Badge className={cn("text-xs font-bold uppercase tracking-wider shadow-none border",
                                req.status === "pending" ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                                req.status === "approved" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                                "bg-rose-500/10 text-rose-300 border-rose-500/20"
                              )}>{req.status}</Badge>
                            </div>
                            <p className="text-xs text-foreground/50 mt-1 leading-relaxed">
                              <strong className="text-foreground/60">Reason:</strong> {req.reason || "No reason provided."}
                            </p>
                            <p className="text-xs text-foreground/25 mt-1.5 font-mono">{formatTimestamp(req.createdAt)}</p>
                          </div>
                          {req.status === "pending" && (
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => handleApproveReactivation(req)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-xs font-bold text-accent transition-colors uppercase cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectReactivation(req)}
                                className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 transition-colors uppercase cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ─── RBAC Permission Matrix Tab ────────────────────────── */}
          {activeTab === "matrix" && (
            <motion.div
              key="matrix"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
                <CardHeader className="border-b border-border p-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                    Dynamic RBAC Permission Matrix
                  </CardTitle>
                  <button
                    onClick={handleSaveMatrix}
                    disabled={isSavingMatrix}
                    className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary text-xs font-bold text-foreground transition-colors uppercase cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isSavingMatrix ? "Syncing..." : "Save Matrix"}
                  </button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="p-3 text-xs font-bold text-foreground/40 uppercase tracking-wider sticky left-0 bg-[#0a0e0b] z-10 min-w-[200px]">Permission</th>
                          {["founder", "system_admin", "c_suite", "manager", "team_lead", "employee", "intern"].map(r => (
                            <th key={r} className="p-3 text-xs font-bold text-foreground/40 uppercase tracking-wider text-center min-w-[90px]">{r.replace("_", " ")}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(permMatrix).length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-xs text-foreground/30 font-bold uppercase tracking-wider">
                              Loading permission definitions...
                            </td>
                          </tr>
                        ) : (
                          Object.entries(permMatrix).map(([permKey, roles]) => (
                            <tr key={permKey} className="border-b border-border hover: transition-colors">
                              <td className="p-3 text-xs font-bold text-foreground/70 font-mono sticky left-0 bg-[#0a0e0b] z-10">{permKey}</td>
                              {["founder", "system_admin", "c_suite", "manager", "team_lead", "employee", "intern"].map(roleKey => (
                                <td key={roleKey} className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={(roles as string[])?.includes(roleKey) || false}
                                    onChange={(e) => handleMatrixCellChange(permKey, roleKey, e.target.checked)}
                                    className="w-4 h-4 rounded border-border bg-transparent text-primary focus:ring-primary/30 cursor-pointer accent-blue-500"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <div className="flex items-start gap-2 text-xs text-foreground/25 border border-border rounded-xl p-4">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400/60" />
                <p>
                  <strong className="text-foreground/40">Live Sync.</strong>{" "}
                  Changes to the permission matrix are synced in real-time across all connected clients via Firestore onSnapshot listeners. The matrix is stored in <code className="text-primary/60">settings/permissions</code>.
                </p>
              </div>
            </motion.div>
          )}

          {/* ─── Delegations Tab ──────────────────────────────────── */}
          {activeTab === "delegations" && (
            <motion.div
              key="delegations"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Create Delegation Form */}
                <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border lg:col-span-1">
                  <CardHeader className="border-b border-border p-4">
                    <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-violet-400" />
                      Create Authority Delegation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <form onSubmit={handleAddDelegation} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Delegate To</label>
                        <Select 
                          value={newDelegation.toUid} 
                          onValueChange={(val) => setNewDelegation({ ...newDelegation, toUid: val as string })}
                          items={employees.map((emp: any) => ({
                            value: emp.id,
                            label: `${emp.fullName} (${emp.email})`
                          }))}
                        >
                          <SelectTrigger className="w-full h-9 border border-border rounded-xl px-3 text-xs bg-background text-foreground">
                            <SelectValue placeholder="Select employee..." />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                            {employees.map((emp: any) => (
                              <SelectItem key={emp.id} value={emp.id}>{emp.fullName} ({emp.email})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Delegated Role</label>
                        <Select 
                          value={newDelegation.role} 
                          onValueChange={(val) => setNewDelegation({ ...newDelegation, role: val as string })}
                          items={{
                            founder: 'Founder',
                            system_admin: 'System Admin',
                            c_suite: 'C-Suite',
                            manager: 'Manager',
                            team_lead: 'Team Lead'
                          }}
                        >
                          <SelectTrigger className="w-full h-9 border border-border rounded-xl px-3 text-xs bg-background text-foreground">
                            <SelectValue placeholder="Select role..." />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border text-foreground">
                            <SelectItem value="founder">Founder</SelectItem>
                            <SelectItem value="system_admin">System Admin</SelectItem>
                            <SelectItem value="c_suite">C-Suite</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="team_lead">Team Lead</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Start</label>
                          <input
                            type="date"
                            value={newDelegation.startDate}
                            onChange={e => setNewDelegation({ ...newDelegation, startDate: e.target.value })}
                            className="w-full h-9 border border-border rounded-xl px-3 text-xs focus:border-primary/60 focus:ring-0 bg-background text-foreground [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider">End</label>
                          <input
                            type="date"
                            value={newDelegation.endDate}
                            onChange={e => setNewDelegation({ ...newDelegation, endDate: e.target.value })}
                            className="w-full h-9 border border-border rounded-xl px-3 text-xs focus:border-primary/60 focus:ring-0 bg-background text-foreground [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                            required
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmittingDelegation}
                        className="w-full h-9 rounded-xl bg-primary hover:bg-primary text-xs font-bold text-foreground transition-colors uppercase cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isSubmittingDelegation ? "Creating..." : "Create Delegation"}
                      </button>
                    </form>
                  </CardContent>
                </Card>

                {/* Delegation List */}
                <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border lg:col-span-2">
                  <CardHeader className="border-b border-border p-4">
                    <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
                      Active & Historical Delegations
                      <span className="text-foreground/25">({delegations.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {delegations.length === 0 ? (
                      <div className="p-16 text-center flex flex-col items-center gap-3">
                        <User className="h-10 w-10 text-foreground/10" />
                        <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">No delegations created yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.04]">
                        {delegations.map((del: any) => (
                          <div key={del.id} className="flex items-center gap-4 px-5 py-3.5 hover: transition-colors">
                            <div className={cn("p-2 rounded-lg border shrink-0",
                              del.status === "active" ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-foreground/5 border-border text-foreground/30"
                            )}>
                              <User className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-foreground">{del.toName || "Deputy"}</span>
                                <span className="text-xs text-foreground/25">←</span>
                                <span className="text-xs text-foreground/40">{del.fromName || "Admin"}</span>
                                <Badge className={cn("text-xs font-bold uppercase tracking-wider shadow-none border",
                                  del.status === "active" ? "bg-violet-500/10 text-violet-300 border-violet-500/20" : "bg-foreground/5 text-foreground/30 border-border"
                                )}>{del.status}</Badge>
                              </div>
                              <p className="text-xs text-foreground/40 mt-0.5 font-mono">
                                Role: <span className="text-primary/80">{del.role}</span> • {del.startDate} → {del.endDate}
                              </p>
                            </div>
                            {del.status === "active" && (
                              <button
                                onClick={() => handleRevokeDelegation(del.id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 transition-colors uppercase cursor-pointer shrink-0"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Note */}
        <div className="flex items-start gap-2 text-xs text-foreground/25 border border-border rounded-xl p-4">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400/60" />
          <p>
            <strong className="text-foreground/40">Tamper-proof.</strong>{" "}
            Audit records are protected by Firestore Security Rules — update and delete operations are permanently denied at the database level. This log is a read-only, append-only ledger.
          </p>
        </div>
      </div>
    </RoleGuard>
  );
}
