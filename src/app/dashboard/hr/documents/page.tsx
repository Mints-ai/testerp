"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, AlertTriangle, CheckCircle, Clock, Search, Plus,
  ChevronDown, User, Calendar, Shield, X, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DOC_TYPES = ["Passport", "Visa", "Emirates ID", "Work Permit", "Health Card", "Other"];

function daysUntil(dateStr: string): number {
  if (!dateStr) return Infinity;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryStatus(days: number): { label: string; color: string; dot: string; priority: number } {
  if (days < 0)   return { label: "Expired",    color: "bg-rose-500/10 text-rose-300 border-rose-500/20",     dot: "bg-rose-500 animate-pulse",   priority: 0 };
  if (days <= 30)  return { label: "Critical",   color: "bg-red-500/10 text-red-300 border-red-500/20",        dot: "bg-red-500 animate-pulse",    priority: 1 };
  if (days <= 60)  return { label: "Warning",    color: "bg-amber-500/10 text-amber-300 border-amber-500/20",  dot: "bg-amber-500",                priority: 2 };
  if (days <= 90)  return { label: "Notice",     color: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20", dot: "bg-yellow-400",            priority: 3 };
  return             { label: "Valid",       color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", dot: "bg-emerald-400",           priority: 4 };
}

interface DocRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  docType: string;
  expiryDate: string;
  notes?: string;
  createdAt?: any;
}

export default function DocumentExpiryTracker() {
  const { user, role } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "expired" | "critical" | "warning" | "notice" | "valid">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", docType: "Passport", expiryDate: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "employeeDocuments")),
      snap => {
        setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as DocRecord)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const enriched = useMemo(() => {
    return docs.map(d => {
      const days = daysUntil(d.expiryDate);
      const status = expiryStatus(days);
      const emp = employees.find(e => e.id === d.employeeId);
      return { ...d, days, status, employeeName: emp?.fullName || d.employeeName || "Unknown" };
    }).sort((a, b) => a.days - b.days);
  }, [docs, employees]);

  const filtered = useMemo(() => enriched.filter(d => {
    const matchSearch = !search ||
      d.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      d.docType.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || d.status.label.toLowerCase() === filterStatus;
    return matchSearch && matchStatus;
  }), [enriched, search, filterStatus]);

  const expiredCount  = enriched.filter(d => d.days < 0).length;
  const criticalCount = enriched.filter(d => d.days >= 0 && d.days <= 30).length;
  const warningCount  = enriched.filter(d => d.days > 30 && d.days <= 60).length;
  const validCount    = enriched.filter(d => d.days > 90).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.expiryDate) return;
    setSubmitting(true);
    try {
      const emp = employees.find(em => em.id === form.employeeId);
      await addDoc(collection(db, "employeeDocuments"), {
        ...form,
        employeeName: emp?.fullName || "",
        createdAt: serverTimestamp(),
        addedBy: user?.fullName || "Admin",
      });
      setIsAddOpen(false);
      setForm({ employeeId: "", docType: "Passport", expiryDate: "", notes: "" });
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  return (
    <RoleGuard
      permission="MANAGE_USERS"
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Shield className="h-16 w-16 text-red-400/40" />
          <h2 className="text-xl font-bold text-foreground/40 uppercase tracking-wider">Access Restricted</h2>
          <p className="text-sm text-foreground/25 text-center max-w-sm">Document Expiry Tracker is only available to HR Admins and above.</p>
        </div>
      }
    >
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <FileText className="h-5 w-5 text-amber-400" />
              Document Expiry Tracker
            </h1>
            <p className="text-xs text-foreground/40 mt-1">
              Track visa, passport, Emirates ID and permit expiry dates for all employees. Auto-sorted by urgency.
            </p>
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="btn-primary h-9 px-4 text-xs font-bold flex items-center gap-1.5 shadow-glow-blue cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Document
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Expired",  value: expiredCount,  icon: X,             color: "bg-rose-500/10 text-rose-400 border-rose-500/20",     click: "expired"  },
            { label: "Critical (≤30d)",  value: criticalCount, icon: AlertTriangle, color: "bg-red-500/10 text-red-400 border-red-500/20", click: "critical" },
            { label: "Warning (≤60d)",   value: warningCount,  icon: Clock,         color: "bg-amber-500/10 text-amber-400 border-amber-500/20", click: "warning" },
            { label: "Valid",    value: validCount,    icon: CheckCircle,   color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", click: "valid" },
          ].map(card => (
            <button
              key={card.label}
              onClick={() => setFilterStatus(filterStatus === card.click as any ? "all" : card.click as any)}
              className={cn("glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden p-5 flex items-center gap-4 text-left transition-all hover:bg-white/[0.04] cursor-pointer rounded-2xl",
                filterStatus === card.click && "ring-1 ring-blue-500/40"
              )}
            >
              <div className={cn("p-3 rounded-xl border", card.color)}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">{card.label}</p>
                <h3 className="text-2xl font-black text-foreground font-mono">{card.value}</h3>
              </div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
          <Input
            placeholder="Search by employee name or document type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 glass-input h-9 text-xs border-border placeholder:text-foreground/20 focus:border-amber-500/60 focus:ring-0"
          />
        </div>

        {/* Documents Table */}
        <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
          <CardHeader className="border-b border-white/[0.04] p-4 bg-white/[0.01]">
            <CardTitle className="text-xs uppercase font-bold text-foreground/50 tracking-wider flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-amber-400" />
              Document Registry
              <span className="text-foreground/25">({filtered.length} of {enriched.length} records)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-16 text-center flex items-center justify-center gap-3 text-foreground/30">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-wider">Loading document registry...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center gap-3">
                <FileText className="h-10 w-10 text-foreground/10" />
                <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">
                  {docs.length === 0 ? "No documents tracked yet. Click \"Add Document\" to start." : "No records match your filters."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02] text-foreground/40 font-bold uppercase tracking-wider text-[9px]">
                      <th className="p-3">Employee</th>
                      <th className="p-3">Document Type</th>
                      <th className="p-3">Expiry Date</th>
                      <th className="p-3">Days Remaining</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtered.map((d, i) => (
                        <motion.tr
                          key={d.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.02, 0.3) }}
                          className={cn(
                            "border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors",
                            d.days < 0 && "bg-rose-500/[0.03]",
                            d.days >= 0 && d.days <= 30 && "bg-red-500/[0.02]"
                          )}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full shrink-0", d.status.dot)} />
                              <div className="font-bold text-foreground">{d.employeeName}</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-foreground/30" />
                              <span className="font-semibold text-foreground/80">{d.docType}</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-foreground/70">
                            {d.expiryDate ? new Date(d.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td className="p-3 font-mono font-bold">
                            <span className={d.days < 0 ? "text-rose-400" : d.days <= 30 ? "text-red-400" : d.days <= 60 ? "text-amber-400" : "text-foreground/60"}>
                              {d.days === Infinity ? "No date" : d.days < 0 ? `${Math.abs(d.days)}d overdue` : `${d.days}d`}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge className={cn("text-[9px] font-bold uppercase tracking-wider shadow-none border", d.status.color)}>
                              {d.status.label}
                            </Badge>
                          </td>
                          <td className="p-3 text-foreground/40 text-[11px] max-w-[200px] truncate">{d.notes || "—"}</td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Document Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setIsAddOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-card border-border bg-[#0d1117] w-full max-w-md p-6 rounded-2xl shadow-2xl"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Add Document Expiry Record</h2>
                  <p className="text-[10px] text-foreground/40 mt-0.5">Track a new HR document and its expiry date</p>
                </div>
                <button onClick={() => setIsAddOpen(false)} className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-muted/40 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">Employee</label>
                  <Select value={form.employeeId} onValueChange={v => setForm(p => ({ ...p, employeeId: v || "" }))}>
                    <SelectTrigger className="glass-input border-border text-foreground text-xs h-9">
                      <SelectValue placeholder="Select employee..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-border text-foreground">
                      {employees.filter(e => e.isActive !== false).map(emp => (
                        <SelectItem key={emp.id} value={emp.id} className="text-xs">{emp.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">Document Type</label>
                  <Select value={form.docType} onValueChange={v => setForm(p => ({ ...p, docType: v || "" }))}>
                    <SelectTrigger className="glass-input border-border text-foreground text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-border text-foreground">
                      {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">Expiry Date</label>
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))}
                    className="glass-input border-border text-foreground text-xs h-9"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">Notes (optional)</label>
                  <Input
                    placeholder="e.g. Renewal submitted, awaiting processing"
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="glass-input border-border text-foreground text-xs h-9"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsAddOpen(false)} className="flex-1 btn-ghost h-9 text-xs font-bold cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting || !form.employeeId || !form.expiryDate} className="flex-1 btn-primary h-9 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5">
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {submitting ? "Saving..." : "Add Record"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </RoleGuard>
  );
}
