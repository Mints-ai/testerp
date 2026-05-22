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
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  
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
    if (score >= 4) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (score === 3) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-rose-600 bg-rose-50 border-rose-200 animate-pulse";
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-olive-600 font-medium gap-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-olive-600"></div>
        <span>Retrieving corporate profile...</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800">Profile Not Discovered</h3>
        <p className="text-sm text-slate-500 mt-1">This corporate account might have been archived or removed.</p>
        <Button variant="outline" className="mt-4 rounded-xl border-slate-200" onClick={() => router.push("/dashboard/clients")}>
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
      <div className="space-y-6 pb-24">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between shrink-0">
          <Button variant="outline" className="rounded-xl border-white/10 glass h-9 text-white/60 hover:text-white font-semibold" onClick={() => router.push("/dashboard/clients")}>
            <ChevronLeft className="w-4 h-4 mr-1.5" /> Back to CRM
          </Button>
          
          <Badge className={`px-3 py-1 text-xs font-bold rounded-xl border ${getHealthColor(client.healthScore || 5)}`}>
            Account Status: {client.healthScore >= 4 ? "Excellent" : client.healthScore === 3 ? "Stable" : "At Risk"}
          </Badge>
        </div>

        {/* Header Hero Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            {client.logo ? (
              <img src={client.logo} alt="" className="h-16 w-16 object-contain rounded-2xl border bg-white p-1" />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-olive-50 flex items-center justify-center text-olive-600 font-bold text-2xl border border-olive-100">
                {client.companyName?.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{client.companyName}</h1>
              <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5 mt-1">
                <Globe className="h-4 w-4 text-slate-400" /> {client.country || "Global"} · Timezone: {client.timezone || "GST"}
              </p>
            </div>
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <Card className="flex-1 md:flex-initial p-4 border-slate-200 bg-olive-50/20 text-center">
              <p className="text-[10px] font-bold text-olive-500 uppercase tracking-wider">Total Contract Value</p>
              <h3 className="text-xl font-black text-olive-900 mt-1 tabular-nums">AED {totalBilledVal.toLocaleString()}</h3>
            </Card>
            <Card className="flex-1 md:flex-initial p-4 border-slate-200 bg-rose-50/20 text-center">
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Outstanding AR</p>
              <h3 className="text-xl font-black text-rose-900 mt-1 tabular-nums">AED {unpaidVal.toLocaleString()}</h3>
            </Card>
          </div>
        </div>

        {/* Main Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: CRM Company Profile & Active Services */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-slate-200 bg-white rounded-2xl overflow-hidden shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">Corporate Details</CardTitle>
                <CardDescription className="text-slate-500">Primary CRM metadata for corporate communications.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-sm text-slate-600 font-medium">
                {client.contactPerson && (
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-slate-950">{client.contactPerson}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Primary Partner contact</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-slate-400 shrink-0" />
                  <div>
                    <a href={`mailto:${client.email}`} className="text-olive-600 hover:underline">{client.email || "No email listed"}</a>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Communication Gateway</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-slate-950">{client.phone || "No phone listed"}</p>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Primary phone line</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-slate-950">{client.timezone || "GST"}</p>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Corporate Timezone</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscribed Retainers */}
            <Card className="border-slate-200 bg-white rounded-2xl shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">Services Retained</CardTitle>
                <CardDescription className="text-slate-500">Subscribed services under this account.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-wrap gap-2">
                  {client.servicesSubscribed?.map((svc: string) => (
                    <Badge key={svc} variant="secondary" className="font-semibold text-xs bg-slate-50 text-slate-700 border border-slate-200 rounded-lg py-1 px-2.5">
                      {svc}
                    </Badge>
                  ))}
                  {!client.servicesSubscribed?.length && (
                    <p className="text-sm text-slate-400 italic">No services registered under this profile.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Auto-Saving Notes Pad */}
            <Card className="border-slate-200 bg-white rounded-2xl shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">CRM Account Notes</CardTitle>
                  <CardDescription className="text-slate-500">Private account updates and notes.</CardDescription>
                </div>
                <div className="text-xs font-semibold shrink-0">
                  {saveStatus === "typing" && <span className="text-amber-500">Typing...</span>}
                  {saveStatus === "saving" && <span className="text-olive-600 animate-pulse">Saving changes...</span>}
                  {saveStatus === "saved" && <span className="text-emerald-600 font-bold">Saved to CRM</span>}
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-4">
                <Textarea 
                  placeholder="Record strategic details, onboarding checklists, client background, or strategic goals here..." 
                  value={notes}
                  onChange={handleNotesChange}
                  className="min-h-[180px] rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-sm leading-relaxed text-slate-900 bg-white placeholder:text-slate-400"
                />
                <p className="text-[10px] text-slate-400 mt-2 text-right">Changes are automatically saved to the database.</p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Active Deliverables & Receivables Balance */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Deliverables / Projects */}
            <Card className="border-slate-200 bg-white rounded-2xl shadow-sm">
              <CardHeader className="pb-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Active Projects</CardTitle>
                  <CardDescription className="text-slate-500">Operational deliverables belonging to {client.companyName}.</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-olive-50 text-olive-800 border-olive-100">{projects.length} deliverables</Badge>
              </CardHeader>
              <CardContent className="p-0">
                {projects.length === 0 ? (
                  <div className="text-center py-12 p-6 flex flex-col items-center">
                    <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm font-semibold text-slate-800">No Projects Found</p>
                    <p className="text-xs text-slate-500 mt-1">There are no operational projects associated with this client profile yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {projects.map((proj) => (
                      <div 
                        key={proj.id} 
                        onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
                        className="flex justify-between items-center p-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
                      >
                        <div className="space-y-1">
                          <p className="font-bold text-slate-900 text-sm hover:text-olive-700 transition-colors">{proj.name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                            <Badge variant="outline" className="text-[10px] font-normal uppercase bg-slate-50 text-slate-500 border-slate-200">
                              {proj.serviceType || "Retainer"}
                            </Badge>
                            <span>·</span>
                            <span>Timeline: {proj.startDate || "Not started"}</span>
                          </div>
                        </div>
                        <Badge className={`capitalize font-semibold text-xs ${
                          proj.status === "active" ? "bg-olive-100 text-olive-800 border-olive-200" :
                          proj.status === "completed" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                          "bg-amber-100 text-amber-800 border-amber-200"
                        }`}>
                          {proj.status?.replace("_", " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoices Ledger */}
            <Card className="border-slate-200 bg-white rounded-2xl shadow-sm">
              <CardHeader className="pb-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Invoices & Receivables</CardTitle>
                  <CardDescription className="text-slate-500">Financial balance statements generated for this account.</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-slate-50 text-slate-800 border border-slate-200">{invoices.length} invoices</Badge>
              </CardHeader>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 p-6 flex flex-col items-center">
                    <Banknote className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm font-semibold text-slate-800">No Financial Records</p>
                    <p className="text-xs text-slate-500 mt-1">No secure financial ledger statements or invoice cards have been raised yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold border-b border-slate-100">
                        <tr>
                          <th className="px-5 py-3">Invoice #</th>
                          <th className="px-5 py-3">Generated Date</th>
                          <th className="px-5 py-3">Amount</th>
                          <th className="px-5 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5 font-mono text-xs text-olive-700">{inv.invoiceNumber || inv.id?.substring(0, 8)}</td>
                            <td className="px-5 py-3.5 text-xs text-slate-500">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "Pending"}</td>
                            <td className="px-5 py-3.5 tabular-nums text-slate-900">AED {(Number(inv.amount) || 0).toLocaleString()}</td>
                            <td className="px-5 py-3.5 text-right">
                              <Badge className={`capitalize font-bold text-xs shadow-none border ${
                                inv.status === "paid" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                inv.status === "overdue" ? "bg-rose-100 text-rose-800 border-rose-200" :
                                "bg-slate-100 text-slate-600 border-slate-200"
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
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
