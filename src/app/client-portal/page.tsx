"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { generateInvoice } from "@/lib/pdfGenerator";
import { Briefcase, FileDown, Clock, CheckCircle2, AlertCircle, Banknote, Calendar, CreditCard, Lock, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ClientDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Stripe Simulated checkout states
  const [activePaymentInvoice, setActivePaymentInvoice] = useState<any | null>(null);
  const [isStripeModalOpen, setIsStripeModalOpen] = useState(false);
  const [stripeCardNum, setStripeCardNum] = useState("");
  const [stripeExpiry, setStripeExpiry] = useState("");
  const [stripeCvc, setStripeCvc] = useState("");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeSuccess, setStripeSuccess] = useState(false);

  const handleInitiatePayment = (inv: any) => {
    setActivePaymentInvoice(inv);
    setStripeCardNum("4242 4242 4242 4242");
    setStripeExpiry("12/28");
    setStripeCvc("242");
    setStripeSuccess(false);
    setIsStripeModalOpen(true);
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaymentInvoice) return;
    
    setStripeLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    try {
      const { updateDoc, doc, addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "invoices", activePaymentInvoice.id), {
        status: "paid",
        paidAt: new Date().toISOString()
      });
      
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "client-user",
        actorName: user?.fullName || user?.displayName || "Client Representative",
        action: "INVOICE_PAYMENT",
        targetCollection: "invoices",
        targetId: activePaymentInvoice.id,
        details: `Client paid invoice ${activePaymentInvoice.invoiceNumber} of amount ${activePaymentInvoice.total} AED via credit card (Stripe simulator).`,
        createdAt: serverTimestamp()
      });
      
      setStripeSuccess(true);
      setTimeout(() => {
        setIsStripeModalOpen(false);
        setInvoices(invoices.map(inv => 
          inv.id === activePaymentInvoice.id ? { ...inv, status: "paid" } : inv
        ));
      }, 2000);
      
    } catch (err) {
      console.error("Error processing payment:", err);
      alert("Payment gateway communication failed. Please try again.");
    } finally {
      setStripeLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchClientData = async () => {
      try {
        // In a production app, we would strictly query by clientId == user.uid
        // For demo purposes, if they don't have specific data, we'll show some mock data 
        // so the UI doesn't look completely empty to an admin testing the portal.
        
        const projQ = query(collection(db, "projects"), orderBy("createdAt", "desc"));
        const invQ = query(collection(db, "invoices"), orderBy("createdAt", "desc"));

        const [projSnap, invSnap] = await Promise.all([getDocs(projQ), getDocs(invQ)]);

        let fetchedProjects = projSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        let fetchedInvoices = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        // Simulate client filtering (only show their stuff)
        // If they are literally named "Client", show everything for the demo.
        if (user.role === 'client') {
           fetchedProjects = fetchedProjects.filter(p => p.clientId === user.uid || p.clientName === user.displayName);
           fetchedInvoices = fetchedInvoices.filter(i => i.clientId === user.uid || i.clientName === user.displayName);
        }

        // If completely empty (like a fresh database), provide 1 mock project and 1 mock invoice just for visual feedback.
        if (fetchedProjects.length === 0) {
          fetchedProjects = [{
            id: 'mock-1',
            name: "Website Redesign & Branding",
            status: "In Progress",
            progress: 65,
            dueDate: "2026-06-15",
            manager: "Admin User"
          }];
        }

        if (fetchedInvoices.length === 0) {
          fetchedInvoices = [{
            id: 'mock-inv-1',
            invoiceNumber: "INV-2026-001",
            status: "pending",
            total: 15000,
            date: "2026-05-01",
            dueDate: "2026-05-30",
            clientName: user.displayName || "Client",
            items: [{ description: "Phase 1: UI Design", amount: 15000 }]
          }];
        }

        setProjects(fetchedProjects);
        setInvoices(fetchedInvoices);
      } catch (err) {
        console.error("Error fetching client data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchClientData();
  }, [user]);

  const handleDownloadInvoice = (inv: any) => {
    generateInvoice({
      invoiceNumber: inv.invoiceNumber,
      date: inv.date || new Date().toISOString().split('T')[0],
      clientName: inv.clientName || inv.clientId || "Client",
      items: inv.items || [{ description: "Services rendered", amount: inv.total || 0 }],
      total: inv.total || 0,
      status: inv.status || 'pending'
    });
  };

  if (loading) {
    return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading your portal...</div>;
  }

  const activeProjects = projects.filter(p => p.status !== "Completed");
  const pendingInvoices = invoices.filter(i => i.status !== "paid");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Welcome Banner */}
      <div className="bg-primary rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Welcome back!</h1>
          <p className="text-primary max-w-xl">
            View your active projects, track progress, and manage your invoices all in one place.
          </p>
        </div>
        {/* Decorative background shapes */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-primary/50 blur-3xl" />
        <div className="absolute bottom-0 right-32 -mb-16 w-48 h-48 rounded-full bg-primary/30 blur-2xl" />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* Left Column: Projects */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" /> Active Projects
            </h2>
            <Badge variant="secondary" className="bg-primary text-primary">{activeProjects.length}</Badge>
          </div>

          <div className="grid gap-4">
            {activeProjects.map((project, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={project.id}
              >
                <Card className="hover:border-primary transition-colors shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-foreground">{project.name}</h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                          <Calendar className="h-3.5 w-3.5" /> Target Delivery: {project.dueDate || "TBD"}
                        </p>
                      </div>
                      <Badge className="bg-muted/50 text-foreground/80 border-border shadow-none hover:bg-muted/50">
                        {project.status || "In Progress"}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground/80">Completion Progress</span>
                        <span className="font-bold text-primary">{project.progress || 0}%</span>
                      </div>
                      <Progress value={project.progress || 0} className="h-2.5 bg-muted/50 [&>div]:bg-primary" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {activeProjects.length === 0 && (
              <div className="text-center p-8 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-accent mx-auto mb-3" />
                <p>All projects are completed!</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Invoices */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Billing & Invoices
            </h2>
            {pendingInvoices.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-none shadow-none">{pendingInvoices.length} Due</Badge>
            )}
          </div>

          <div className="grid gap-4">
            {invoices.map((inv, i) => (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                key={inv.id}
              >
                <Card className="shadow-sm">
                  <CardContent className="p-5 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-foreground">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Due: {inv.dueDate}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${ inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : inv.status === 'overdue' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200' }`}>
                        {inv.status?.toUpperCase() || 'PENDING'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-end justify-between border-t border-border/50 pt-4 mt-1">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Amount Due</p>
                        <p className="font-bold text-lg text-foreground tabular-nums">
                          {inv.total?.toLocaleString()} AED
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-primary border-primary hover:bg-indigo-50 hover:text-primary"
                          onClick={() => handleDownloadInvoice(inv)}
                        >
                          <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF
                        </Button>
                        {inv.status !== 'paid' && (
                          <Button 
                            size="sm" 
                            className="bg-primary hover:bg-primary text-white font-bold h-8 text-xs flex items-center justify-center gap-1 cursor-pointer"
                            onClick={() => handleInitiatePayment(inv)}
                          >
                            <CreditCard className="h-3.5 w-3.5" /> Pay Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {invoices.length === 0 && (
              <div className="text-center p-8 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm">
                <p>No invoices available.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Deliverables & Handovers Section */}
      <div className="space-y-6 mt-8">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" /> Deliverables & Project Handovers
        </h2>
        <Card className="shadow-sm border-border">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-3 text-slate-950">
                <div>
                  <h4 className="font-bold text-sm text-foreground">Brand Identity Package v1.0</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Uploaded on May 24, 2026</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-primary border-primary hover:bg-indigo-50"
                  onClick={() => {
                    alert("Starting secure download of Brand Identity Package...");
                  }}
                >
                  <FileDown className="mr-1.5 h-4 w-4" /> Download ZIP
                </Button>
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-3 text-slate-950">
                <div>
                  <h4 className="font-bold text-sm text-foreground">High-Fidelity Figma UX Layouts</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Uploaded on May 22, 2026</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-primary border-primary hover:bg-indigo-50"
                  onClick={() => alert("Redirecting to secure Figma workspace...")}
                >
                  <Briefcase className="mr-1.5 h-4 w-4" /> View Resource
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Simulated Stripe Checkout Glassmorphic Modal */}
      <AnimatePresence>
        {isStripeModalOpen && activePaymentInvoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 rounded-xl text-primary font-black tracking-wider text-xs">stripe</div>
                  <span className="text-xs bg-muted/50 text-muted-foreground uppercase tracking-widest font-bold px-2 py-0.5 rounded-full">Simulator</span>
                </div>
                <button onClick={() => setIsStripeModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1">✕</button>
              </div>

              {stripeSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-primary rounded-full flex items-center justify-center mx-auto border border-emerald-200 shadow-glow-emerald">
                    <Check className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Payment Successful!</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Your invoice payment has been processed. A receipt has been saved and your invoice marked as Paid.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleProcessPayment} className="space-y-5">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-border/50">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Paying Invoice</span>
                      <span className="font-bold text-slate-800">{activePaymentInvoice.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between items-baseline mt-2">
                      <span className="text-sm font-bold text-slate-950">Total Payment Due</span>
                      <span className="text-xl font-black text-primary font-mono">{activePaymentInvoice.total?.toLocaleString()} AED</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Card Number</label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input 
                          required
                          placeholder="4242 4242 4242 4242"
                          value={stripeCardNum}
                          onChange={(e) => setStripeCardNum(e.target.value)}
                          className="w-full h-9 border border-border focus:border-primary focus:ring-0 rounded-xl pl-10 pr-3 text-xs font-mono font-semibold text-foreground"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Expiration</label>
                        <input 
                          required
                          placeholder="MM/YY"
                          value={stripeExpiry}
                          onChange={(e) => setStripeExpiry(e.target.value)}
                          className="w-full h-9 border border-border focus:border-primary focus:ring-0 rounded-xl px-3 text-xs font-mono font-semibold text-foreground"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">CVC / CVV</label>
                        <input 
                          required
                          placeholder="123"
                          value={stripeCvc}
                          onChange={(e) => setStripeCvc(e.target.value)}
                          className="w-full h-9 border border-border focus:border-primary focus:ring-0 rounded-xl px-3 text-xs font-mono font-semibold text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 text-xs text-slate-450 items-start text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                    <span>Payments are secured using SSL. Card details are routed safely through the Mints sandboxed credit gateway.</span>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={stripeLoading}
                    className="w-full bg-primary hover:bg-primary text-white font-bold h-11 flex items-center justify-center gap-1.5 rounded-2xl shadow-lg mt-2 cursor-pointer"
                  >
                    {stripeLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Authorizing Payment...</>
                    ) : (
                      <><Lock className="h-4 w-4" /> Secure Payment & Clear Balance</>
                    )}
                  </Button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
