"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateInvoice } from "@/lib/pdfGenerator";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { canAccess } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Banknote, FileText, Receipt, TrendingUp, AlertCircle, Plus, FileDown, ArrowUpRight, DollarSign, Upload, Loader2, Sparkles, Wallet, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { CHART_COLORS, CHART_STYLE } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

const mockFinancialData: any[] = [
  { name: "Jan", revenue: 45000, profit: 12000 },
  { name: "Feb", revenue: 52000, profit: 15000 },
  { name: "Mar", revenue: 61000, profit: 19000 },
  { name: "Apr", revenue: 58000, profit: 17500 },
  { name: "May", revenue: 73000, profit: 24000 },
  { name: "Jun", revenue: 85000, profit: 29000 },
];

const mockExpenseData: any[] = [
  { name: "Software", value: 12400 },
  { name: "Marketing", value: 8500 },
  { name: "Salaries", value: 32000 },
  { name: "Operations", value: 4300 },
  { name: "Travel", value: 1800 },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-white/5 text-white/50 border-white/10",
  sent: "bg-blue-600/15 text-blue-300 border-blue-500/20",
  paid: "bg-emerald-600/15 text-emerald-300 border-emerald-500/20",
  overdue: "bg-rose-600/15 text-rose-300 border-rose-500/20",
};

export default function FinanceDashboard() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [compCurrency, setCompCurrency] = useState("USD");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        setCompCurrency(docSnap.data().currency || "USD");
      }
    });
    return () => unsubSettings();
  }, []);

  // OCR State
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ amount?: number; date?: string; vendor?: string } | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  // OCR Form States
  const [ocrVendor, setOcrVendor] = useState("");
  const [ocrAmount, setOcrAmount] = useState("");
  const [ocrDate, setOcrDate] = useState("");

  // Manual Log Expense State
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualVendor, setManualVendor] = useState("");
  const [manualCategory, setManualCategory] = useState("Software");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingManual, setSavingManual] = useState(false);

  // Create Invoice Form States
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceClientName, setInvoiceClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<{ description: string; amount: number }[]>([
    { description: "Services rendered", amount: 0 }
  ]);
  const [invoiceTax, setInvoiceTax] = useState("5");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [clientsList, setClientsList] = useState<any[]>([]);

  // Payroll States
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [selectedEmpPayroll, setSelectedEmpPayroll] = useState<any | null>(null);
  const [payrollBonus, setPayrollBonus] = useState("");
  const [payrollDeduction, setPayrollDeduction] = useState("");
  const [payrollPeriod, setPayrollPeriod] = useState("May 2026");

  // Real-time clients & employees mapping subscription
  useEffect(() => {
    if (!user) return;
    const unsubClients = onSnapshot(collection(db, "clients"), (snap) => {
      setClientsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubEmployees = onSnapshot(collection(db, "employees"), (snap) => {
      setEmployeesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubClients();
      unsubEmployees();
    };
  }, [user]);

  const initInvoiceForm = () => {
    setInvoiceNumber(`INV-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setInvoiceDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setInvoiceItems([{ description: "Services rendered", amount: 0 }]);
    setInvoiceTax("5");
    setInvoiceDiscount("0");
    setIsInvoiceModalOpen(true);
  };

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { description: "", amount: 0 }]);
  };

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length === 1) return;
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const updateInvoiceItem = (index: number, key: 'description' | 'amount', val: any) => {
    const updated = [...invoiceItems];
    updated[index] = { ...updated[index], [key]: val };
    setInvoiceItems(updated);
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceClientName || !invoiceNumber || !invoiceDueDate) return;
    
    setSavingInvoice(true);
    try {
      const subtotal = invoiceItems.reduce((acc, item) => acc + Number(item.amount), 0);
      const taxAmount = subtotal * (Number(invoiceTax) / 100);
      const discountAmount = subtotal * (Number(invoiceDiscount) / 100);
      const finalTotal = subtotal + taxAmount - discountAmount;
      
      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collection(db, "invoices"), {
        invoiceNumber: invoiceNumber.trim(),
        clientId: invoiceClientName,
        clientName: invoiceClientName,
        items: invoiceItems.map(item => ({ description: item.description, amount: Number(item.amount) })),
        subtotal,
        taxRate: Number(invoiceTax),
        discountRate: Number(invoiceDiscount),
        total: finalTotal,
        currency: compCurrency,
        dueDate: invoiceDueDate,
        status: "pending",
        createdAt: serverTimestamp()
      });

      // Write system audit log
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid,
        action: "CREATE_INVOICE",
        targetCollection: "invoices",
        details: `Created invoice ${invoiceNumber.trim()} for ${invoiceClientName} of amount ${finalTotal} ${compCurrency}.`,
        createdAt: serverTimestamp()
      });

      setIsInvoiceModalOpen(false);
      setInvoiceItems([{ description: "Services rendered", amount: 0 }]);
      setInvoiceClientName("");
    } catch (err) {
      console.error("Error saving invoice:", err);
    } finally {
      setSavingInvoice(false);
    }
  };

  // Sync OCR results to editable fields
  useEffect(() => {
    if (ocrResult) {
      setOcrVendor(ocrResult.vendor || "");
      setOcrAmount(ocrResult.amount?.toString() || "");
      setOcrDate(ocrResult.date || new Date().toISOString().split('T')[0]);
    }
  }, [ocrResult]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result?.toString().split(",")[1];
      if (!base64) return;
      
      setReceiptImage(event.target?.result as string);
      setIsScanning(true);
      
      try {
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 })
        });
        
        const data = await res.json();
        if (data.success) {
          setOcrResult(data.data);
        } else {
          alert("OCR Failed: " + data.error);
        }
      } catch (err) {
        console.error(err);
        alert("An error occurred during scan.");
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!user) return;

    const qInvoices = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      const invs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInvoices(invs);
    });

    const qExpenses = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const exps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(exps);
      setLoading(false);
    });

    return () => {
      unsubInvoices();
      unsubExpenses();
    };
  }, [user]);

  const handleSaveManualExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualVendor.trim() || !manualAmount) return;
    
    setSavingManual(true);
    try {
      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collection(db, "expenses"), {
        submittedBy: user?.displayName || "Mints Team Member",
        submittedById: user?.uid || "",
        vendor: manualVendor.trim(),
        category: manualCategory,
        amount: Number(manualAmount),
        currency: compCurrency,
        status: "pending",
        date: manualDate,
        createdAt: serverTimestamp()
      });
      
      setManualVendor("");
      setManualCategory("Software");
      setManualAmount("");
      setManualDate(new Date().toISOString().split('T')[0]);
      setIsManualOpen(false);
    } catch (err) {
      console.error("Error saving manual expense:", err);
    } finally {
      setSavingManual(false);
    }
  };

  const handleSaveOcrExpense = async () => {
    if (!ocrVendor.trim() || !ocrAmount) return;
    
    try {
      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collection(db, "expenses"), {
        submittedBy: user?.displayName || "Mints Team Member",
        submittedById: user?.uid || "",
        vendor: ocrVendor.trim(),
        category: "Software", 
        amount: Number(ocrAmount),
        currency: compCurrency,
        status: "pending",
        date: ocrDate,
        createdAt: serverTimestamp()
      });
      
      setOcrResult(null);
      setReceiptImage(null);
      setIsOcrModalOpen(false);
    } catch (err) {
      console.error("Error saving OCR expense:", err);
    }
  };

  const handleUpdateExpenseStatus = async (id: string, newStatus: "approved" | "rejected") => {
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "expenses", id), {
        status: newStatus,
        reviewedBy: user?.displayName || "Finance Manager",
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating expense status:", err);
    }
  };
  const getDynamicFinancialData = () => {
    if (invoices.length === 0 && expenses.length === 0) {
      return [];
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const today = new Date();
    const buckets: { name: string; revenue: number; profit: number; monthIdx: number; year: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push({
        name: months[d.getMonth()],
        revenue: 0,
        profit: 0,
        monthIdx: d.getMonth(),
        year: d.getFullYear()
      });
    }

    invoices.forEach(inv => {
      let d: Date | null = null;
      if (inv.createdAt) {
        d = inv.createdAt.seconds ? new Date(inv.createdAt.seconds * 1000) : new Date(inv.createdAt);
      } else if (inv.dueDate) {
        d = new Date(inv.dueDate);
      }
      if (!d || isNaN(d.getTime())) return;

      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const match = buckets.find(b => b.monthIdx === mIdx && b.year === yr);
      if (match) {
        const val = Number(inv.total) || 0;
        match.revenue += val;
        match.profit += val;
      }
    });

    expenses.forEach(exp => {
      let d: Date | null = null;
      if (exp.createdAt) {
        d = exp.createdAt.seconds ? new Date(exp.createdAt.seconds * 1000) : new Date(exp.createdAt);
      } else if (exp.date) {
        d = new Date(exp.date);
      }
      if (!d || isNaN(d.getTime())) return;

      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const match = buckets.find(b => b.monthIdx === mIdx && b.year === yr);
      if (match) {
        const val = Number(exp.amount) || 0;
        match.profit -= val;
      }
    });

    return buckets.map(b => ({
      name: b.name,
      revenue: b.revenue,
      profit: Math.max(0, b.profit)
    }));
  };

  const getDynamicExpenseData = () => {
    if (expenses.length === 0) {
      return [];
    }

    const categoryMap: Record<string, number> = {};
    expenses.forEach(exp => {
      const cat = exp.category || "Other";
      const val = Number(exp.amount) || 0;
      categoryMap[cat] = (categoryMap[cat] || 0) + val;
    });

    return Object.entries(categoryMap).map(([name, value]) => ({
      name,
      value
    }));
  };

  const totalExpSum = expenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
  const dynamicFinancialData = getDynamicFinancialData();
  const dynamicExpenseData = getDynamicExpenseData();

  const dynamicGrossRevenue = invoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
  const dynamicNetProfit = Math.max(0, dynamicGrossRevenue - totalExpSum);
  const dynamicAR = invoices
    .filter(inv => inv.status === "pending" || inv.status === "sent")
    .reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
  const outstandingCount = invoices.filter(inv => inv.status === "pending" || inv.status === "sent").length;
  const dynamicRunRate = dynamicGrossRevenue * 2;

  const formatCompact = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  return (
    <RoleGuard permission="VIEW_DEPT_FINANCE" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied.</div>}>
      <div className="space-y-6 pb-12 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-500" /> Finance Hub
            </h1>
            <p className="text-xs text-white/40 mt-1">Manage agency revenue, cash flow, invoices, and expenses.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-ghost py-0 px-4 h-9 text-xs font-bold border-white/10 text-white/70 hover:text-white flex items-center justify-center cursor-pointer">
              <FileDown className="w-4 h-4 mr-2" /> Export CSV
            </button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 bg-white/[0.02] border border-white/[0.08] shadow-inner p-1 rounded-xl">
            <TabsTrigger value="overview" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">Executive Summary</TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">Invoices</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">Expenses</TabsTrigger>
            <TabsTrigger value="payroll" className="text-xs py-1.5 px-4 font-bold rounded-lg text-white/40 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-glow-blue transition-all cursor-pointer">Payroll & Payslips</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Gross Revenue</p>
                    <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20"><DollarSign className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight font-mono">{formatCompact(dynamicGrossRevenue)} <span className="text-[10px] text-white/30 uppercase tracking-wider font-sans font-bold ml-1">{compCurrency}</span></h3>
                  <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-400">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Billed Receivables
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Net Profit</p>
                    <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20"><TrendingUp className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight font-mono">{formatCompact(dynamicNetProfit)} <span className="text-[10px] text-white/30 uppercase tracking-wider font-sans font-bold ml-1">{compCurrency}</span></h3>
                  <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-400">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Net surplus
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">AR (Outstanding)</p>
                    <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20"><Banknote className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight font-mono">{formatCompact(dynamicAR)} <span className="text-[10px] text-white/30 uppercase tracking-wider font-sans font-bold ml-1">{compCurrency}</span></h3>
                  <div className={cn("flex items-center gap-1 mt-2 text-[10px] font-bold", outstandingCount > 0 ? "text-amber-400" : "text-emerald-400")}>
                    <AlertCircle className="w-3.5 h-3.5" /> {outstandingCount} Unpaid
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Run Rate</p>
                    <div className="p-1.5 bg-violet-500/10 text-violet-400 rounded-lg border border-violet-500/20"><ArrowUpRight className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight font-mono">{formatCompact(dynamicRunRate)} <span className="text-[10px] text-white/30 uppercase tracking-wider font-sans font-bold ml-1">{compCurrency}</span></h3>
                  <div className="text-[10px] font-semibold text-white/30 mt-2">
                    Projected annual revenue
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Stacked Area Chart */}
              <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5">
                <CardHeader className="p-0 mb-6">
                  <CardTitle className="text-sm font-bold text-white">Cash Flow (H1 2026)</CardTitle>
                  <CardDescription className="text-[11px] text-white/40 mt-1">Revenue vs Expenses vs Net Profit over the last 6 months.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[300px] w-full min-w-0">
                    {mounted ? (
                      dynamicFinancialData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={dynamicFinancialData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray={CHART_STYLE.grid.strokeDasharray} vertical={false} stroke={CHART_STYLE.grid.stroke} />
                            <XAxis dataKey="name" axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} dy={10} />
                            <YAxis axisLine={CHART_STYLE.axis.axisLine} tickLine={CHART_STYLE.axis.tickLine} tick={CHART_STYLE.axis.tick} tickFormatter={(value) => `${value / 1000}k`} />
                            <RechartsTooltip 
                              contentStyle={CHART_STYLE.tooltip.contentStyle}
                              labelStyle={CHART_STYLE.tooltip.labelStyle}
                              cursor={CHART_STYLE.tooltip.cursor}
                              formatter={(value) => [`${Number(value).toLocaleString()} ${compCurrency}`, '']}
                            />
                            <Area type="monotone" dataKey="revenue" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRevenue)" name="Revenue" />
                            <Area type="monotone" dataKey="profit" stackId="2" stroke="#06b6d4" strokeWidth={2.5} fill="url(#colorProfit)" name="Profit" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center text-xs text-white/30 gap-2 border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6">
                          <TrendingUp className="h-8 w-8 text-white/20 animate-pulse" />
                          <span className="font-bold uppercase tracking-wider text-[10px]">No Transaction Data Found</span>
                          <span className="text-[9px] text-white/20 text-center px-6">Generate client invoices or log business expenses to compile live cash flow graphs.</span>
                        </div>
                      )
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-white/20">Loading chart...</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Expenses Donut */}
              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5 flex flex-col">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-sm font-bold text-white">Expense Distribution</CardTitle>
                  <CardDescription className="text-[11px] text-white/40 mt-1">Breakdown by category (Current Month)</CardDescription>
                </CardHeader>
                <CardContent className="p-0 flex-1 flex flex-col justify-between min-w-0">
                  <div className="h-[180px] w-full flex flex-col justify-center relative my-2 min-w-0">
                    {mounted ? (
                      dynamicExpenseData.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie
                                data={dynamicExpenseData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={75}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="none"
                              >
                                {dynamicExpenseData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                ))}
                              </Pie>
                              <RechartsTooltip 
                                contentStyle={CHART_STYLE.tooltip.contentStyle}
                                formatter={(value) => [`${value} ${compCurrency}`, '']}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          {/* Inner Text for Donut */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                            <span className="text-lg font-black text-white font-mono leading-none">{totalExpSum.toLocaleString()}</span>
                            <span className="text-[8px] uppercase font-bold text-white/30 tracking-widest mt-1">Total Exp</span>
                          </div>
                        </>
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center text-xs text-white/30 gap-1.5 border border-white/[0.04] bg-white/[0.01] rounded-2xl py-6 p-4">
                          <Sparkles className="h-6 w-6 text-white/20 animate-pulse" />
                          <span className="font-bold uppercase tracking-wider text-[10px]">No Expenses Logged</span>
                          <span className="text-[8px] text-white/20 text-center px-4">AI Scan or Manual entries generate category breakdown.</span>
                        </div>
                      )
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-white/20">Loading chart...</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    {dynamicExpenseData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center text-white/60">
                          <div className="w-2.5 h-2.5 rounded-sm mr-2" style={{backgroundColor: CHART_COLORS[index % CHART_COLORS.length]}}></div>
                          {entry.name}
                        </div>
                        <span className="text-white font-mono text-[11px]">{entry.value.toLocaleString()} {compCurrency}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Invoices List */}
          <TabsContent value="invoices" className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Accounts Receivable</h2>
              <RoleGuard permission="CREATE_INVOICE">
                <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
                  <DialogTrigger 
                    render={
                      <button onClick={initInvoiceForm} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                        <Plus className="mr-1.5 h-4 w-4" /> Create Invoice
                      </button>
                    }
                  />
                  <DialogContent className="sm:max-w-[500px] bg-[#121813] border border-white/[0.08] text-white p-6 rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base font-bold text-white">Create Client Invoice</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveInvoice} className="space-y-4 py-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Invoice #</Label>
                          <Input 
                            required 
                            value={invoiceNumber} 
                            onChange={(e) => setInvoiceNumber(e.target.value)} 
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full bg-[#121813]"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Due Date</Label>
                          <Input 
                            required 
                            type="date" 
                            value={invoiceDueDate} 
                            onChange={(e) => setInvoiceDueDate(e.target.value)} 
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full bg-[#121813]"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Client Company</Label>
                        <select 
                          required
                          value={invoiceClientName} 
                          onChange={(e) => setInvoiceClientName(e.target.value)} 
                          className="w-full h-9 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#121813] text-white font-semibold"
                        >
                          <option value="">-- Select Client --</option>
                          {clientsList.map(c => (
                            <option key={c.id} value={c.companyName || c.name}>{c.companyName || c.name || "Mints Client"}</option>
                          ))}
                          <option value="Mints Global Sandbox Client">Sandbox Demonstration Client</option>
                        </select>
                      </div>

                      <div className="space-y-2 border-t border-white/[0.06] pt-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Invoice Items</Label>
                          <button type="button" onClick={addInvoiceItem} className="text-[10px] text-blue-400 font-bold hover:underline">+ Add Item</button>
                        </div>
                        
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {invoiceItems.map((item, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <Input 
                                required 
                                placeholder="Item description" 
                                value={item.description}
                                onChange={(e) => updateInvoiceItem(idx, 'description', e.target.value)}
                                className="glass-input h-8 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 flex-1 bg-[#121813]"
                              />
                              <Input 
                                required 
                                type="number" 
                                placeholder="Amount" 
                                value={item.amount || ""}
                                onChange={(e) => updateInvoiceItem(idx, 'amount', Number(e.target.value))}
                                className="glass-input h-8 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-24 font-mono text-right bg-[#121813]"
                              />
                              {invoiceItems.length > 1 && (
                                <button type="button" onClick={() => removeInvoiceItem(idx)} className="text-rose-400 hover:text-rose-300 font-bold text-xs p-1">✕</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-3">
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Tax Rate (%)</Label>
                          <Input 
                            type="number" 
                            value={invoiceTax} 
                            onChange={(e) => setInvoiceTax(e.target.value)} 
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono bg-[#121813]"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Discount (%)</Label>
                          <Input 
                            type="number" 
                            value={invoiceDiscount} 
                            onChange={(e) => setInvoiceDiscount(e.target.value)} 
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono bg-[#121813]"
                          />
                        </div>
                      </div>

                      {/* Total Calculations Preview */}
                      <div className="bg-white/[0.02] border border-white/[0.08] p-3 rounded-xl space-y-1.5 text-xs text-white/60">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span className="font-mono text-white">{invoiceItems.reduce((acc, item) => acc + Number(item.amount), 0).toLocaleString()} {compCurrency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax ({invoiceTax}%):</span>
                          <span className="font-mono text-white">{(invoiceItems.reduce((acc, item) => acc + Number(item.amount), 0) * (Number(invoiceTax) / 100)).toLocaleString()} {compCurrency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Discount ({invoiceDiscount}%):</span>
                          <span className="font-mono text-white">{(invoiceItems.reduce((acc, item) => acc + Number(item.amount), 0) * (Number(invoiceDiscount) / 100)).toLocaleString()} {compCurrency}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/[0.06] pt-1.5 font-bold text-white">
                          <span>Grand Total:</span>
                          <span className="font-mono text-blue-400">
                            {(
                              invoiceItems.reduce((acc, item) => acc + Number(item.amount), 0) * (1 + Number(invoiceTax) / 100 - Number(invoiceDiscount) / 100)
                            ).toLocaleString()} {compCurrency}
                          </span>
                        </div>
                      </div>

                      <DialogFooter className="pt-4 border-t border-white/[0.06] gap-2 sm:gap-0 mt-4">
                        <button type="button" onClick={() => setIsInvoiceModalOpen(false)} className="btn-ghost h-9 py-0 px-4 text-xs font-semibold border-white/10 text-white/70 hover:text-white cursor-pointer">Cancel</button>
                        <button type="submit" disabled={savingInvoice} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                          {savingInvoice ? "Saving..." : "Create & Issue"}
                        </button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </RoleGuard>
            </div>
            <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <div className="text-center py-16 text-white/30 bg-white/[0.01]">
                    <Banknote className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-wider text-white/40">No invoices generated yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="glass-table">
                      <thead>
                        <tr>
                          <th>Invoice #</th>
                          <th>Client</th>
                          <th>Amount</th>
                          <th>Due Date</th>
                          <th>Status</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="font-bold text-white">{inv.invoiceNumber}</td>
                            <td className="text-white/60 font-semibold">{inv.clientId}</td>
                            <td className="font-bold text-white font-mono text-xs">{inv.total?.toLocaleString()} {inv.currency || compCurrency}</td>
                            <td className="text-white/40 font-semibold">{inv.dueDate}</td>
                            <td>
                              <Badge variant="outline" className={cn("font-bold text-[9px] py-0.5 tracking-wider uppercase shadow-none", STATUS_COLORS[inv.status] || STATUS_COLORS.draft)}>
                                {inv.status.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <button 
                                  className="btn-ghost p-1.5 hover:text-white text-white/50 cursor-pointer rounded-lg border-white/5 border hover:border-white/10"
                                  onClick={() => generateInvoice({
                                    invoiceNumber: inv.invoiceNumber,
                                    date: inv.date || new Date().toISOString().split('T')[0],
                                    clientName: inv.clientId || "Client",
                                    items: inv.items || [{ description: "Services rendered", amount: inv.total || 0 }],
                                    total: inv.total || 0,
                                    status: inv.status
                                  })}
                                >
                                  <FileDown className="h-4 w-4" />
                                </button>
                                {canAccess(role, "DELETE_DATA") && (
                                  <button 
                                    onClick={async () => {
                                      if (confirm(`Are you absolutely sure you want to permanently delete the invoice "${inv.invoiceNumber}"? This action cannot be undone.`)) {
                                        try {
                                          const { deleteDoc, doc } = await import("firebase/firestore");
                                          await deleteDoc(doc(db, "invoices", inv.id));
                                        } catch (err) {
                                          console.error("Error deleting invoice:", err);
                                        }
                                      }
                                    }}
                                    className="p-1.5 text-white/40 hover:text-red-500 rounded-lg hover:bg-white/5 transition-colors border border-white/5 hover:border-white/10"
                                    title="Delete Invoice"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expenses List */}
          <TabsContent value="expenses" className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Accounts Payable</h2>
              <RoleGuard permission="SUBMIT_EXPENSE">
                <div className="flex gap-2">
                  <Dialog open={isOcrModalOpen} onOpenChange={setIsOcrModalOpen}>
                    <DialogTrigger 
                      render={
                        <button className="px-4 h-9 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-1.5 cursor-pointer bg-blue-600/10 border border-blue-500/20 text-blue-300 hover:bg-blue-600/20">
                          <Sparkles className="h-4 w-4 text-blue-400 animate-pulse" /> Smart Scan
                        </button>
                      }
                    />
                    <DialogContent className="sm:max-w-[425px] bg-[#121813] border border-white/[0.08] text-white p-6 rounded-2xl shadow-xl">
                      <DialogHeader>
                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-blue-400" /> AI Receipt Scanner
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        {!ocrResult ? (
                          <div className="flex flex-col items-center justify-center p-8 border border-white/10 border-dashed rounded-xl bg-white/[0.01]">
                            {isScanning ? (
                              <div className="flex flex-col items-center gap-3 text-blue-400">
                                <Loader2 className="h-7 w-7 animate-spin" />
                                <p className="text-xs font-bold uppercase tracking-wider">Extracting details...</p>
                              </div>
                            ) : (
                              <>
                                <Upload className="h-8 w-8 text-white/30 mb-3" />
                                <p className="text-xs font-bold text-white mb-1 uppercase tracking-wider">Upload Receipt Image</p>
                                <p className="text-[10px] text-white/20 mb-4 text-center">JPG, PNG up to 5MB</p>
                                <Label htmlFor="receipt-upload" className="cursor-pointer btn-primary h-8 py-0 px-4 text-xs font-bold flex items-center justify-center">
                                  Select File
                                </Label>
                                <Input id="receipt-upload" type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 p-3 rounded-xl text-xs flex items-start gap-2">
                              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
                              <p className="font-semibold leading-normal">Data extracted successfully! Review and save.</p>
                            </div>
                            <div className="grid gap-2">
                              <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Vendor Name</Label>
                              <Input 
                                value={ocrVendor} 
                                onChange={(e) => setOcrVendor(e.target.value)} 
                                className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Amount ({compCurrency})</Label>
                                <Input 
                                  value={ocrAmount} 
                                  onChange={(e) => setOcrAmount(e.target.value)} 
                                  type="number" 
                                  step="0.01" 
                                  className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono" 
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Date</Label>
                                <Input 
                                  value={ocrDate} 
                                  onChange={(e) => setOcrDate(e.target.value)} 
                                  type="date" 
                                  className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                              <button onClick={() => {setOcrResult(null); setReceiptImage(null);}} className="btn-ghost h-9 py-0 px-4 text-xs font-semibold border-white/10 text-white/70 hover:text-white cursor-pointer">Scan Another</button>
                              <button onClick={handleSaveOcrExpense} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">Save Expense</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
                    <DialogTrigger 
                      render={
                        <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                          <Plus className="mr-1.5 h-4 w-4" /> Log Expense
                        </button>
                      }
                    />
                    <DialogContent className="sm:max-w-[425px] bg-[#121813] border border-white/[0.08] text-white p-6 rounded-2xl shadow-xl">
                      <DialogHeader>
                        <DialogTitle className="text-base font-bold text-white">Log Corporate Expense</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSaveManualExpense} className="space-y-4 py-4">
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Vendor Name</Label>
                          <Input 
                            required 
                            placeholder="e.g., Amazon Web Services" 
                            value={manualVendor} 
                            onChange={(e) => setManualVendor(e.target.value)} 
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Expense Category</Label>
                          <select 
                            value={manualCategory} 
                            onChange={(e) => setManualCategory(e.target.value)} 
                            className="w-full h-9 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#121813] text-white"
                          >
                            <option value="Software">Software & Subscriptions</option>
                            <option value="Marketing">Marketing & Advertising</option>
                            <option value="Freelancers">Freelancers & Outsourcing</option>
                            <option value="Office">Office Supplies & Utilities</option>
                            <option value="Travel">Business Travel</option>
                            <option value="Meals">Meals & Client Entertainment</option>
                            <option value="Other">Other Expenses</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Amount ({compCurrency})</Label>
                            <Input 
                              required 
                              type="number" 
                              step="0.01" 
                              placeholder="0.00" 
                              value={manualAmount} 
                              onChange={(e) => setManualAmount(e.target.value)} 
                              className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono" 
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Date</Label>
                            <Input 
                              required 
                              type="date" 
                              value={manualDate} 
                              onChange={(e) => setManualDate(e.target.value)} 
                              className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                            />
                          </div>
                        </div>
                        <DialogFooter className="pt-4 border-t border-white/[0.06] gap-2 sm:gap-0 mt-4">
                          <button type="button" onClick={() => setIsManualOpen(false)} className="btn-ghost h-9 py-0 px-4 text-xs font-semibold border-white/10 text-white/70 hover:text-white cursor-pointer">Cancel</button>
                          <button type="submit" disabled={savingManual} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                            {savingManual ? "Saving..." : "Log Expense"}
                          </button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </RoleGuard>
            </div>
            <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
              <CardContent className="p-0">
                {expenses.length === 0 ? (
                  <div className="text-center py-16 text-white/30 bg-white/[0.01]">
                    <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-wider text-white/40">No expenses logged yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="glass-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Vendor</th>
                          <th>Category</th>
                          <th>Amount</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="font-bold text-white">{exp.submittedBy}</td>
                            <td className="text-white/60 font-semibold">{exp.vendor || 'General Vendor'}</td>
                            <td className="text-white/60 font-semibold">{exp.category}</td>
                            <td className="font-bold text-white font-mono text-xs">{exp.amount?.toLocaleString()} {exp.currency || compCurrency}</td>
                            <td className="text-white/40 font-mono text-xs">
                              {exp.date || (exp.createdAt?.seconds ? new Date(exp.createdAt.seconds * 1000).toLocaleDateString() : 'N/A')}
                            </td>
                            <td>
                              <Badge variant="outline" className={cn("font-bold text-[9px] py-0.5 tracking-wider uppercase shadow-none", 
                                exp.status === 'approved' ? 'bg-emerald-600/15 text-emerald-300 border-emerald-500/20' :
                                exp.status === 'rejected' ? 'bg-rose-600/15 text-rose-300 border-rose-500/20' :
                                'bg-amber-600/15 text-amber-300 border-amber-500/20 animate-pulse'
                              )}>
                                {exp.status?.toUpperCase() || 'PENDING'}
                              </Badge>
                            </td>
                            <td className="text-right">
                              <div className="flex justify-end gap-2 items-center">
                                {exp.status === 'pending' || !exp.status ? (
                                  <div className="flex gap-1.5">
                                    <button 
                                      onClick={() => handleUpdateExpenseStatus(exp.id, "approved")}
                                      className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-glow-emerald"
                                    >
                                      Approve
                                    </button>
                                    <button 
                                      onClick={() => handleUpdateExpenseStatus(exp.id, "rejected")}
                                      className="h-7 px-3 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-300 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider italic">Reviewed</span>
                                )}
                                {canAccess(role, "DELETE_DATA") && (
                                  <button 
                                    onClick={async () => {
                                      if (confirm(`Are you absolutely sure you want to permanently delete the expense for "${exp.vendor || 'General Vendor'}" of amount ${exp.amount?.toLocaleString()} ${exp.currency}? This action is irreversible.`)) {
                                        try {
                                          const { deleteDoc, doc } = await import("firebase/firestore");
                                          await deleteDoc(doc(db, "expenses", exp.id));
                                        } catch (err) {
                                          console.error("Error deleting expense:", err);
                                        }
                                      }
                                    }}
                                    className="p-1.5 text-white/40 hover:text-red-500 rounded-lg hover:bg-white/5 transition-colors border border-white/5 hover:border-white/10"
                                    title="Delete Expense"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payroll & Payslips */}
          <TabsContent value="payroll" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Agency Payroll & Compensation</h2>
                <p className="text-[11px] text-white/40 mt-1">Manage employee base pay, process bonuses, and generate official payslips.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/40 uppercase">Period:</span>
                <select 
                  value={payrollPeriod}
                  onChange={(e) => setPayrollPeriod(e.target.value)}
                  className="h-8 border border-white/10 rounded-lg px-2 text-xs focus:ring-0 bg-[#121813] text-white font-semibold"
                >
                  <option value="May 2026">May 2026</option>
                  <option value="June 2026">June 2026</option>
                  <option value="July 2026">July 2026</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Roster list */}
              <Card className="lg:col-span-2 glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
                <CardHeader className="border-b border-white/[0.04] p-4 bg-white/[0.01]">
                  <CardTitle className="text-xs uppercase font-bold text-white tracking-wider">Employee Roster</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="glass-table text-xs">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Role</th>
                          <th>Base Salary</th>
                          <th>Deductions</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeesList.map(emp => {
                          const baseSalary = emp.baseSalary || 12000;
                          return (
                            <tr key={emp.id} className={cn("hover:bg-white/[0.02] transition-colors cursor-pointer", selectedEmpPayroll?.id === emp.id ? "bg-white/[0.04]" : "")} onClick={() => {
                              setSelectedEmpPayroll(emp);
                              setPayrollBonus("");
                              setPayrollDeduction("");
                            }}>
                              <td className="font-bold text-white flex items-center gap-2.5 py-3">
                                <Avatar className="h-7 w-7 border border-white/10">
                                  <AvatarImage src={emp.profilePhotoURL} />
                                  <AvatarFallback className="bg-indigo-600 text-[10px] font-bold text-white">
                                    {emp.fullName ? emp.fullName.split(" ").map((n: any) => n[0]).join("") : "EM"}
                                  </AvatarFallback>
                                </Avatar>
                                {emp.fullName || "Team Member"}
                              </td>
                              <td className="text-white/60 font-semibold">{emp.jobTitle || "Employee"}</td>
                              <td className="font-bold text-white font-mono">{baseSalary.toLocaleString()} AED</td>
                              <td className="text-white/40 font-mono">0 AED</td>
                              <td className="text-right">
                                <button className="text-blue-400 font-bold hover:underline hover:text-blue-300">Configure</button>
                              </td>
                            </tr>
                          );
                        })}
                        {employeesList.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-white/30 italic">No employees found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Configure Panel */}
              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs uppercase font-bold text-white/55 tracking-wider mb-4">Pay Period Configuration</h3>
                  
                  {selectedEmpPayroll ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] p-3 rounded-xl">
                        <Avatar className="h-10 w-10 border border-white/10">
                          <AvatarImage src={selectedEmpPayroll.profilePhotoURL} />
                          <AvatarFallback className="bg-indigo-600 text-xs font-bold text-white">
                            {selectedEmpPayroll.fullName ? selectedEmpPayroll.fullName.split(" ").map((n: any) => n[0]).join("") : "EM"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-white">{selectedEmpPayroll.fullName}</p>
                          <p className="text-[10px] text-white/40 font-semibold uppercase mt-0.5">{selectedEmpPayroll.jobTitle || "Employee"}</p>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Base Salary (AED)</Label>
                        <Input 
                          disabled
                          value={selectedEmpPayroll.baseSalary || 12000} 
                          className="glass-input h-9 text-xs border-white/10 bg-white/[0.01] text-white/50 font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Performance Bonus</Label>
                          <Input 
                            type="number"
                            placeholder="e.g. 1500"
                            value={payrollBonus} 
                            onChange={(e) => setPayrollBonus(e.target.value)}
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 font-mono text-white bg-[#121813]"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs font-bold text-white/50 uppercase tracking-wider">Unpaid Deductions</Label>
                          <Input 
                            type="number"
                            placeholder="e.g. 300"
                            value={payrollDeduction} 
                            onChange={(e) => setPayrollDeduction(e.target.value)}
                            className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 font-mono text-white bg-[#121813]"
                          />
                        </div>
                      </div>

                      {/* Pay Details Summary */}
                      <div className="bg-white/[0.01] border border-white/[0.06] p-3.5 rounded-xl space-y-2 text-xs text-white/60">
                        <div className="flex justify-between">
                          <span>Base Salary:</span>
                          <span className="font-mono text-white">{(selectedEmpPayroll.baseSalary || 12000).toLocaleString()} AED</span>
                        </div>
                        <div className="flex justify-between text-emerald-400">
                          <span>Bonus Added:</span>
                          <span className="font-mono">+{Number(payrollBonus || 0).toLocaleString()} AED</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Deductions Applied:</span>
                          <span className="font-mono">-{Number(payrollDeduction || 0).toLocaleString()} AED</span>
                        </div>
                        <div className="flex justify-between border-t border-white/[0.06] pt-2 font-bold text-white text-sm">
                          <span>Net Payday:</span>
                          <span className="font-mono text-indigo-400">
                            {((selectedEmpPayroll.baseSalary || 12000) + Number(payrollBonus || 0) - Number(payrollDeduction || 0)).toLocaleString()} AED
                          </span>
                        </div>
                      </div>

                      <Button 
                        onClick={async () => {
                          const base = selectedEmpPayroll.baseSalary || 12000;
                          const bon = Number(payrollBonus || 0);
                          const ded = Number(payrollDeduction || 0);
                          const net = base + bon - ded;
                          
                          const { generatePayslip } = await import("@/lib/pdfGenerator");
                          generatePayslip({
                            payslipNumber: `SLIP-2026-${Math.floor(100 + Math.random() * 900)}`,
                            employeeName: selectedEmpPayroll.fullName || "Team Member",
                            role: selectedEmpPayroll.jobTitle || "Employee",
                            period: payrollPeriod,
                            baseSalary: base + bon,
                            deductions: ded,
                            netPay: net,
                            unpaidLeaves: Math.max(0, Math.floor(ded / 500))
                          });

                          const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
                          await addDoc(collection(db, "auditLog"), {
                            actorId: user?.uid,
                            action: "GENERATE_PAYSLIP",
                            targetCollection: "employees",
                            targetId: selectedEmpPayroll.id,
                            details: `Generated salary payslip for ${selectedEmpPayroll.fullName} for period ${payrollPeriod} (Net: ${net} AED).`,
                            createdAt: serverTimestamp()
                          });
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-10 py-0 flex items-center justify-center gap-1.5 shadow-glow-indigo rounded-xl cursor-pointer"
                      >
                        <FileDown className="h-4 w-4" /> Download Official Payslip
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-white/30 italic text-xs">
                      Select an employee from the roster list to configure salary slip and pay adjustments.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
