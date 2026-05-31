"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, PhoneCall, Mail, Building, DollarSign, FileText, MoreHorizontal, User, Download } from "lucide-react";
import { generateQuote } from "@/lib/pdfGenerator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { downloadCSV } from "@/lib/exportUtils";

const STAGES = ["Lead", "Meeting", "Negotiation", "Won", "Lost"];

export default function CRMDashboard() {
  const { user, role, simulatedRole } = useAuth();
  const currentRole = simulatedRole || role;
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [emailText, setEmailText] = useState("");
  const [leadEmails, setLeadEmails] = useState<any[]>([]);

  // New Lead Form
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching leads:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedLead) return;
    const q = query(collection(db, `leads/${selectedLead.id}/emails`), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeadEmails(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error fetching lead emails:", error);
    });
    return () => unsubscribe();
  }, [selectedLead]);

  const handleExportCSV = () => {
    downloadCSV(
      filteredLeads,
      ["Company Name", "Contact Person", "Email", "Assigned To", "Stage", "Deal Value (AED)"],
      ["company", "contactName", "email", "assignedTo", "stage", "value"],
      "Mints_Global_CRM_Leads.csv"
    );
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !contactName) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "leads"), {
        company,
        contactName,
        email,
        value: parseFloat(value) || 0,
        stage: "Lead",
        createdAt: serverTimestamp(),
        assignedTo: user?.displayName || "Unassigned"
      });
      setIsAddOpen(false);
      setCompany("");
      setContactName("");
      setEmail("");
      setValue("");
    } catch (err) {
      console.error(err);
    }
    setIsSubmitting(false);
  };

  const updateLeadStage = async (lead: any, newStage: string) => {
    try {
      await updateDoc(doc(db, "leads", lead.id), { stage: newStage });
      
      if (newStage === "Won" && lead.stage !== "Won") {
        // 1. Create Client
        const clientRef = await addDoc(collection(db, "clients"), {
          companyName: lead.company,
          contactPerson: lead.contactName,
          email: lead.email,
          status: "Active",
          createdAt: serverTimestamp()
        });
        
        // 2. Create Project
        await addDoc(collection(db, "projects"), {
          name: `${lead.company} Implementation`,
          clientId: clientRef.id,
          status: "pitch",
          budget: lead.value || 0,
          serviceType: "General",
          createdAt: serverTimestamp()
        });
        
        // 3. Create Deposit Invoice (50%)
        const depositAmount = (lead.value || 0) * 0.5;
        if (depositAmount > 0) {
          await addDoc(collection(db, "invoices"), {
            invoiceNumber: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
            clientId: clientRef.id,
            clientName: lead.company,
            amount: depositAmount,
            status: "pending",
            issueDate: new Date().toISOString(),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: serverTimestamp()
          });
        }
        
        // 4. Create System Notification
        await addDoc(collection(db, "notifications"), {
          userId: "global",
          title: "New Client Won! 🎉",
          message: `${lead.company} has been moved to Won. Project and deposit invoice generated.`,
          read: false,
          createdAt: serverTimestamp()
        });
        
        // 5. Discord Webhook Notification
        fetch('/api/discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `🎉 **Deal Won!**\n**Client:** ${lead.company}\n**Value:** ${lead.value || 0} AED\n**Closed By:** ${user?.displayName || 'Team'}`
          })
        }).catch(err => console.error("Discord error:", err));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateQuote = (lead: any) => {
    generateQuote({
      quoteNumber: `Q-${Math.floor(Math.random() * 10000)}`,
      date: new Date().toLocaleDateString(),
      clientName: lead.company,
      contactName: lead.contactName,
      items: [
        { description: "Standard Agency Retainer (Monthly)", amount: lead.value || 5000 }
      ],
      total: lead.value || 5000
    });
  };

  const handleDeleteLead = async (id: string) => {
    if (confirm("Are you sure you want to delete this lead? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "leads", id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleLogEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailText || !selectedLead) return;
    try {
      await addDoc(collection(db, `leads/${selectedLead.id}/emails`), {
        text: emailText,
        sender: user?.displayName || "User",
        createdAt: serverTimestamp()
      });
      setEmailText("");
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLeads = leads.filter(l => 
    l.company.toLowerCase().includes(search.toLowerCase()) || 
    l.contactName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <RoleGuard permission="CREATE_PROJECT" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied. Only staff with project management authorization can access the CRM.</div>}>
      <div className="space-y-6 h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">CRM & Pipeline</h1>
            <p className="text-white/40 mt-1">Track leads, generate quotes, and close deals.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search leads..."
                className="pl-9 glass-card border-white/10 text-white placeholder:text-white/30 w-full animate-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="glass-card border-white/10 hover:bg-white/5 hover:text-white text-white/80 rounded-xl font-semibold h-10 px-4 flex-1 sm:flex-none cursor-pointer"
              >
                <Download className="mr-2 h-4 w-4 text-emerald-400 shrink-0" /> Export CSV
              </Button>

              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger 
                  render={
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-xl font-semibold h-10 px-5 flex-1 sm:flex-none cursor-pointer">
                      <Plus className="mr-2 h-4 w-4 shrink-0" /> New Lead
                    </Button>
                  }
                />
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddLead} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company Name</label>
                    <Input required placeholder="Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact Person</label>
                    <Input required placeholder="John Doe" value={contactName} onChange={e => setContactName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input type="email" placeholder="john@acme.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estimated Deal Value (AED)</label>
                    <Input type="number" placeholder="50000" value={value} onChange={e => setValue(e.target.value)} />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white">Save Lead</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto pb-4 hide-scrollbar">
          <div className="flex gap-4 h-full min-w-max">
            {STAGES.map(stage => {
              const stageLeads = filteredLeads.filter(l => l.stage === stage);
              
              return (
                <div key={stage} className="w-80 flex flex-col h-full bg-white/[0.02] border border-white/[0.06] rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="font-bold text-white tracking-tight uppercase text-sm flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        stage === 'Won' ? 'bg-green-500' : 
                        stage === 'Lost' ? 'bg-red-500' : 'bg-blue-400'
                      }`} />
                      {stage}
                    </h3>
                    <Badge variant="secondary" className="bg-white/5 text-white/80 border-white/10">{stageLeads.length}</Badge>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    <AnimatePresence>
                      {stageLeads.map(lead => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={lead.id}
                          className="glass-card p-4 rounded-xl group hover:border-blue-500/30 transition-colors relative cursor-pointer"
                          onClick={() => setSelectedLead(lead)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-white truncate pr-6">{lead.company}</h4>
                            
                            {/* Action Menu */}
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger className="p-1 hover:bg-white/5 rounded-md">
                                  <MoreHorizontal className="h-4 w-4 text-white/60" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleGenerateQuote(lead)}>
                                    <FileText className="mr-2 h-4 w-4 text-blue-400" /> Generate Quote
                                  </DropdownMenuItem>
                                  {STAGES.map(s => s !== stage && (
                                    <DropdownMenuItem key={s} onClick={(e) => { e.stopPropagation(); updateLeadStage(lead, s); }}>
                                      Move to {s}
                                    </DropdownMenuItem>
                                  ))}
                                  {currentRole === "founder" && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }} className="text-red-400 focus:text-red-300">
                                      Delete Lead
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          
                          <div className="space-y-1.5 text-xs text-white/60">
                            <p className="flex items-center gap-1.5">
                              <Building className="h-3 w-3 text-white/40" /> {lead.contactName}
                            </p>
                            {lead.email && (
                              <p className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3 text-white/40" /> <span className="truncate">{lead.email}</span>
                              </p>
                            )}
                            <p className="flex items-center gap-1.5 font-semibold text-blue-300 mt-2">
                              <DollarSign className="h-3 w-3 text-emerald-400" /> 
                              {lead.value ? `${lead.value.toLocaleString()} AED` : 'TBD'}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Lead Detail Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent side="right" className="w-[400px] p-6 border-l border-white/[0.08] bg-[#121813] text-white flex flex-col h-full overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader className="border-b border-white/[0.06] pb-4 mb-4 shrink-0">
                <SheetTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Building className="h-5 w-5 text-blue-400" />
                  {selectedLead.company}
                </SheetTitle>
                <div className="flex items-center gap-4 text-xs text-white/60 mt-2">
                  <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> {selectedLead.contactName}</span>
                  <span className="flex items-center gap-1.5"><DollarSign className="h-3 w-3 text-emerald-400" /> {selectedLead.value} AED</span>
                </div>
              </SheetHeader>
              
              <div className="flex-1 flex flex-col min-h-0">
                <h4 className="font-bold text-sm text-white mb-3">Email Tracking & Activity</h4>
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                  <AnimatePresence>
                    {leadEmails.length === 0 ? (
                      <p className="text-xs text-white/40 italic text-center py-4">No activity logged yet.</p>
                    ) : (
                      leadEmails.map(msg => (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} key={msg.id} className="bg-white/[0.03] border border-white/[0.06] p-3 rounded-xl text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-blue-300">{msg.sender}</span>
                            <span className="text-[9px] text-white/40 uppercase font-mono tracking-wider">
                              {msg.createdAt?.toDate().toLocaleDateString() || 'Just now'}
                            </span>
                          </div>
                          <p className="text-white/80 whitespace-pre-wrap">{msg.text}</p>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
                
                <form onSubmit={handleLogEmail} className="shrink-0 space-y-3 bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                  <Textarea 
                    placeholder="Log an email or meeting note..." 
                    className="text-xs bg-black/20 border-white/10 resize-none h-20 text-white placeholder:text-white/30"
                    value={emailText}
                    onChange={(e) => setEmailText(e.target.value)}
                  />
                  <Button type="submit" disabled={!emailText} className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-8">
                    <Plus className="h-3 w-3 mr-1.5" /> Log Activity
                  </Button>
                </form>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </RoleGuard>
  );
}
