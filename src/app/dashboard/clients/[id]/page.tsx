"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Mail, Phone, Globe, Clock, User, FileText, ChevronLeft, Save, Briefcase, Banknote } from "lucide-react";

export default function ClientProfile({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = React.use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // CRM Notes state
  const [notes, setNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "typing" | "saving" | "saved">("idle");

  useEffect(() => {
    if (!user || !id) return;

    // 1. Fetch Client Profile
    const clientDocRef = doc(db, "clients", id);
    const unsubClient = onSnapshot(clientDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const clientData = docSnap.data();
        setClient({ id: docSnap.id, ...clientData });
        setNotes(clientData.notes || "");
      } else {
        console.error("Client profile not found");
      }
      setLoading(false);
    });

    // 2. Fetch Projects for this client
    const projectsQuery = query(collection(db, "projects"), where("clientId", "==", id));
    const unsubProjects = onSnapshot(projectsQuery, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubClient();
      unsubProjects();
    };
  }, [user, id]);

  // Query Invoices once client company name is loaded
  useEffect(() => {
    if (!client?.companyName) return;

    const invoicesQuery = query(collection(db, "invoices"), where("clientName", "==", client.companyName));
    const unsubInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubInvoices();
  }, [client]);

  // Debounced Auto-save for CRM Notes
  useEffect(() => {
    if (saveStatus !== "typing") return;

    const delayDebounceFn = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const clientDocRef = doc(db, "clients", id);
        await updateDoc(clientDocRef, { notes });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (err) {
        console.error("Failed to auto-save notes:", err);
        setSaveStatus("idle");
      }
    }, 1000); // Save after 1 second of inactivity

    return () => clearTimeout(delayDebounceFn);
  }, [notes, saveStatus, id]);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    setSaveStatus("typing");
  };

  const getHealthColor = (score: number) => {
    if (score >= 4) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    if (score === 3) return "text-amber-300 bg-amber-500/10 border-amber-500/20";
    return "text-rose-300 bg-rose-500/10 border-rose-500/20 animate-pulse";
  };

  if (!mounted || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-blue-400 font-bold gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span>Retrieving corporate profile...</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16 bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl rounded-2xl p-8">
        <Building2 className="h-12 w-12 text-white/20 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white/80">Profile Not Discovered</h3>
        <p className="text-sm text-white/40 mt-1">This corporate account might have been archived or removed.</p>
        <Button variant="outline" className="mt-4 rounded-xl border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-semibold" onClick={() => router.push("/dashboard/clients")}>
          <ChevronLeft className="w-4 h-4 mr-2" /> Back to CRM
        </Button>
      </div>
    );
  }

  const totalBilledVal = invoices.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const unpaidVal = invoices
    .filter(inv => inv.status !== "paid")
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  return (
    <RoleGuard permission="VIEW_ALL_EMPLOYEES" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied. Interns do not have permissions to view corporate CRM databases.</div>}>
      <div className="space-y-6 pb-24 text-white">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between shrink-0">
          <Button variant="outline" className="rounded-xl border-white/10 glass h-9 text-white/60 hover:text-white font-semibold" onClick={() => router.push("/dashboard/clients")}>
            <ChevronLeft className="w-4 h-4 mr-1.5" /> Back to CRM
          </Button>
          
          <Badge className={`px-3 py-1 text-xs font-bold rounded-xl border ${getHealthColor(client.healthScore || 5)} shadow-none`}>
            Account Status: {client.healthScore >= 4 ? "Excellent" : client.healthScore === 3 ? "Stable" : "At Risk"}
          </Badge>
        </div>

        {/* Header Hero Section */}
        <div className="border border-white/[0.08] bg-white/[0.02] p-6 rounded-2xl shadow-card backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            {client.logo ? (
              <img src={client.logo} alt="" className="h-16 w-16 object-contain rounded-2xl border border-white/10 bg-white p-1" />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-300 font-bold text-2xl border border-blue-500/20">
                {client.companyName?.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">{client.companyName}</h1>
              <p className="text-sm text-white/40 font-semibold flex items-center gap-1.5 mt-1">
                <Globe className="h-4 w-4 text-white/30" /> {client.country || "Global"} · Timezone: {client.timezone || "GST"}
              </p>
            </div>
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <div className="flex-1 md:flex-initial p-4 border border-emerald-500/20 bg-emerald-500/5 text-center rounded-2xl">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Total Contract Value</p>
              <h3 className="text-xl font-black text-emerald-300 mt-1 tabular-nums">AED {totalBilledVal.toLocaleString()}</h3>
            </div>
            <div className="flex-1 md:flex-initial p-4 border border-rose-500/20 bg-rose-500/5 text-center rounded-2xl">
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Outstanding AR</p>
              <h3 className="text-xl font-black text-rose-300 mt-1 tabular-nums">AED {unpaidVal.toLocaleString()}</h3>
            </div>
          </div>
        </div>

        {/* Main Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: CRM Company Profile & Active Services */}
          <div className="lg:col-span-1 space-y-6">
            <div className="border border-white/[0.08] bg-white/[0.02] rounded-2xl overflow-hidden shadow-card backdrop-blur-xl">
              <div className="p-6 pb-3 border-b border-white/[0.06] bg-white/[0.01]">
                <h2 className="text-base font-bold text-white">Corporate Details</h2>
                <p className="text-xs text-white/40 font-medium mt-0.5">Primary CRM metadata for corporate communications.</p>
              </div>
              <div className="p-6 space-y-4 text-sm text-white/60 font-semibold">
                {client.contactPerson && (
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-white/30 shrink-0" />
                    <div>
                      <p className="text-white">{client.contactPerson}</p>
                      <p className="text-[9px] uppercase font-bold text-white/30 tracking-wider">Primary Partner contact</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-white/30 shrink-0" />
                  <div>
                    <a href={`mailto:${client.email}`} className="text-blue-400 hover:text-blue-300 transition-colors hover:underline">{client.email || "No email listed"}</a>
                    <p className="text-[9px] uppercase font-bold text-white/30 tracking-wider">Communication Gateway</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-white/30 shrink-0" />
                  <div>
                    <p className="text-white">{client.phone || "No phone listed"}</p>
                    <p className="text-[9px] uppercase font-bold text-white/30 tracking-wider">Primary phone line</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-white/30 shrink-0" />
                  <div>
                    <p className="text-white">{client.timezone || "GST"}</p>
                    <p className="text-[9px] uppercase font-bold text-white/30 tracking-wider">Corporate Timezone</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscribed Retainers */}
            <div className="border border-white/[0.08] bg-white/[0.02] rounded-2xl shadow-card backdrop-blur-xl">
              <div className="p-6 pb-3 border-b border-white/[0.06] bg-white/[0.01]">
                <h2 className="text-base font-bold text-white">Services Retained</h2>
                <p className="text-xs text-white/40 font-medium mt-0.5">Subscribed services under this account.</p>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-2">
                  {client.servicesSubscribed?.map((svc: string) => (
                    <Badge key={svc} variant="secondary" className="font-bold text-xs bg-white/[0.02] text-white/80 border border-white/10 rounded-lg py-1 px-2.5">
                      {svc}
                    </Badge>
                  ))}
                  {!client.servicesSubscribed?.length && (
                    <p className="text-sm text-white/40 italic">No services registered under this profile.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Auto-Saving Notes Pad */}
            <div className="border border-white/[0.08] bg-white/[0.02] rounded-2xl shadow-card backdrop-blur-xl">
              <div className="p-6 pb-3 border-b border-white/[0.06] bg-white/[0.01] flex flex-row items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">CRM Account Notes</h2>
                  <p className="text-xs text-white/40 font-medium mt-0.5">Private account updates and notes.</p>
                </div>
                <div className="text-xs font-semibold shrink-0">
                  {saveStatus === "typing" && <span className="text-amber-400">Typing...</span>}
                  {saveStatus === "saving" && <span className="text-blue-400 animate-pulse">Saving changes...</span>}
                  {saveStatus === "saved" && <span className="text-emerald-400 font-bold">Saved to CRM</span>}
                </div>
              </div>
              <div className="p-6 pt-4">
                <Textarea 
                  placeholder="Record strategic details, onboarding checklists, client background, or strategic goals here..." 
                  value={notes}
                  onChange={handleNotesChange}
                  className="min-h-[180px] rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-sm leading-relaxed text-white bg-white/[0.03] placeholder:text-white/20"
                />
                <p className="text-[10px] text-white/30 mt-2 text-right">Changes are automatically saved to the database.</p>
              </div>
            </div>
          </div>

          {/* Right Column: Active Deliverables & Receivables Balance */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Deliverables / Projects */}
            <div className="border border-white/[0.08] bg-white/[0.02] rounded-2xl shadow-card backdrop-blur-xl">
              <div className="p-6 pb-4 border-b border-white/[0.06] bg-white/[0.01] flex flex-row items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">Active Projects</h2>
                  <p className="text-xs text-white/40 font-medium mt-0.5">Operational deliverables belonging to {client.companyName}.</p>
                </div>
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-300 border border-blue-500/20 font-bold">{projects.length} deliverables</Badge>
              </div>
              <div className="p-0">
                {projects.length === 0 ? (
                  <div className="text-center py-12 p-6 flex flex-col items-center">
                    <Briefcase className="h-10 w-10 text-white/20 mb-3" />
                    <p className="text-sm font-semibold text-white/80">No Projects Found</p>
                    <p className="text-xs text-white/40 mt-1">There are no operational projects associated with this client profile yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {projects.map((proj) => (
                      <div 
                        key={proj.id} 
                        onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
                        className="flex justify-between items-center p-4 hover:bg-white/[0.03] transition-all cursor-pointer"
                      >
                        <div className="space-y-1">
                          <p className="font-bold text-white text-sm hover:text-blue-400 transition-colors">{proj.name}</p>
                          <div className="flex items-center gap-2 text-xs text-white/40 font-semibold">
                            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-white/[0.02] text-white/60 border-white/10">
                              {proj.serviceType || "Retainer"}
                            </Badge>
                            <span>·</span>
                            <span>Timeline: {proj.startDate || "Not started"}</span>
                          </div>
                        </div>
                        <Badge className={`capitalize font-bold text-xs shadow-none border ${
                          proj.status === "active" ? "bg-blue-500/10 text-blue-300 border-blue-500/20" :
                          proj.status === "completed" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                          "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        }`}>
                          {proj.status?.replace("_", " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Invoices Ledger */}
            <div className="border border-white/[0.08] bg-white/[0.02] rounded-2xl shadow-card backdrop-blur-xl">
              <div className="p-6 pb-4 border-b border-white/[0.06] bg-white/[0.01] flex flex-row items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">Invoices & Receivables</h2>
                  <p className="text-xs text-white/40 font-medium mt-0.5">Financial balance statements generated for this account.</p>
                </div>
                <Badge variant="secondary" className="bg-white/[0.02] text-white/80 border border-white/10 font-bold">{invoices.length} invoices</Badge>
              </div>
              <div className="p-0">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 p-6 flex flex-col items-center">
                    <Banknote className="h-10 w-10 text-white/20 mb-3" />
                    <p className="text-sm font-semibold text-white/80">No Financial Records</p>
                    <p className="text-xs text-white/40 mt-1">No secure financial ledger statements or invoice cards have been raised yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white/[0.01] text-white/40 text-[10px] uppercase font-bold border-b border-white/[0.06]">
                        <tr>
                          <th className="px-5 py-3">Invoice #</th>
                          <th className="px-5 py-3">Generated Date</th>
                          <th className="px-5 py-3">Amount</th>
                          <th className="px-5 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06] text-white/80 font-semibold">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="px-5 py-3.5 font-mono text-xs text-blue-400">{inv.invoiceNumber || inv.id?.substring(0, 8)}</td>
                            <td className="px-5 py-3.5 text-xs text-white/40">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "Pending"}</td>
                            <td className="px-5 py-3.5 tabular-nums text-white">AED {(Number(inv.amount) || 0).toLocaleString()}</td>
                            <td className="px-5 py-3.5 text-right">
                              <Badge className={`capitalize font-bold text-xs shadow-none border ${
                                inv.status === "paid" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                                inv.status === "overdue" ? "bg-rose-500/10 text-rose-300 border-rose-500/20" :
                                "bg-white/[0.02] text-white/60 border-white/10"
                              }`}>
                                {inv.status || "Draft"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
