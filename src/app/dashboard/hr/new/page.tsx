"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateEmployeeId } from "@/lib/employeeUtils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ROLE_META } from "@/lib/permissions";
import { RoleGuard } from "@/components/layout/RoleGuard";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  UserPlus, 
  Sparkles, 
  Wand2, 
  ShieldAlert, 
  Key,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit,
  Play,
  Loader2,
  X,
  FileSpreadsheet
} from "lucide-react";

const DEPARTMENTS = [
  "OPERATIONS",
  "IT & CYBER SECURITY",
  "MARKETING"
];

const SUBROLES_MAPPING: Record<string, string[]> = {
  "OPERATIONS": [
    "SALES",
    "PUBLIC RELATION",
    "STRATEGY",
    "CLIENT RELATION",
    "COMPANY MARKETING",
    "HUMAN RESOURCE",
    "FINANCE"
  ],
  "IT & CYBER SECURITY": [
    "PRODUCTS",
    "PRODUCTS » SHIELD DESK",
    "PRODUCTS » MINTS ERP",
    "PRODUCTS » MINORA",
    "SERVICES",
    "SERVICES » OFFENSIVE SECURITY",
    "SERVICES » INCIDENT RESPONSE",
    "SERVICES » MANAGED & ADVISORY",
    "SERVICES » COMPLIANCE & GRC",
    "SERVICES » CLOUD SECURITY",
    "SERVICES » OT / IOT SECURITY",
    "SERVICES » WEBAPPLICATION",
    "SERVICES » MOBILE APPLICATION",
    "SERVICES » WEBSITE DEVELOPMENT",
    "SERVICES » ERP DEVELOPMENT & SOLUTION",
    "SERVICES » CRM DEVELOPMENT",
    "SERVICES » E-COMMERCE"
  ],
  "MARKETING": [
    "CREATIVE",
    "CREATIVE » PHOTOGRAPHY",
    "CREATIVE » SMM",
    "CREATIVE » VIDEO GRAPHY",
    "CREATIVE » INFLUCENCE MARKETING",
    "PERFORMANCE",
    "PERFORMANCE » SEO",
    "PERFORMANCE » META",
    "PERFORMANCE » GOOGLE ADS",
    "PERFORMANCE » EMAIL MARKETING"
  ]
};

const formSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Must be a valid email address."),
  role: z.string().min(1, "Role is required."),
  departments: z.array(z.string()).min(1, "Select at least one department."),
  subRoles: z.array(z.string()).optional(),
  jobTitle: z.string().min(2, "Job title is required."),
  phone: z.string().optional(),
  isIntern: z.boolean(),
  internEndDate: z.string().optional(),
  temporaryPassword: z.string().min(6, "Password must be at least 6 characters."),
}).superRefine((data, ctx) => {
  if (data.isIntern && !data.internEndDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Intern end date is required when Is Intern is checked",
      path: ["internEndDate"],
    });
  }
});

interface ParsedEmployee {
  fullName: string;
  email: string;
  role: string;
  jobTitle: string;
  phone: string;
  departments: string[];
  subRoles: string[];
  isIntern: boolean;
  internEndDate: string;
  temporaryPassword?: string;
  errors: Record<string, string>;
  status: "pending" | "provisioning" | "success" | "failed";
  errorMessage?: string;
  employeeId?: string;
}

// Custom simple CSV Parser that handles quotes and line breaks
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        row[row.length - 1] += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push("");
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }

  if (lines.length === 0) return [];

  const headers = lines[0].map(h => h.trim().replace(/^"|"$/g, ''));
  const results: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const values = lines[r];
    if (values.length === 1 && values[0] === "") continue;
    const item: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      item[headers[c]] = (values[c] || "").trim().replace(/^"|"$/g, '');
    }
    results.push(item);
  }
  return results;
}

function validateRow(emp: Partial<ParsedEmployee>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!emp.fullName || emp.fullName.trim().length < 2) {
    errors.fullName = "Name must be at least 2 characters.";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emp.email || !emailRegex.test(emp.email)) {
    errors.email = "Must be a valid email address.";
  }
  if (!emp.role || !ROLE_META[emp.role]) {
    errors.role = `Invalid role. Must be one of: ${Object.keys(ROLE_META).join(", ")}`;
  }
  if (!emp.jobTitle || emp.jobTitle.trim().length < 2) {
    errors.jobTitle = "Job title is required.";
  }
  if (!emp.departments || emp.departments.length === 0) {
    errors.departments = "At least one department is required.";
  } else {
    const invalidDepts = emp.departments.filter(d => !DEPARTMENTS.includes(d));
    if (invalidDepts.length > 0) {
      errors.departments = `Invalid departments: ${invalidDepts.join(", ")}`;
    }
  }
  if (emp.subRoles && emp.subRoles.length > 0 && emp.departments) {
    const invalidSubroles: string[] = [];
    emp.subRoles.forEach(sub => {
      const isValid = emp.departments!.some(dept => SUBROLES_MAPPING[dept]?.includes(sub));
      if (!isValid) {
        invalidSubroles.push(sub);
      }
    });
    if (invalidSubroles.length > 0) {
      errors.subRoles = `Subroles not valid for selected departments: ${invalidSubroles.join(", ")}`;
    }
  }
  if (emp.isIntern && !emp.internEndDate) {
    errors.internEndDate = "Intern end date is required when Is Intern is checked.";
  }
  if (emp.temporaryPassword && emp.temporaryPassword.length < 6) {
    errors.temporaryPassword = "Password must be at least 6 characters.";
  }
  return errors;
}

export default function OnboardEmployees() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // Single Onboarding State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextEmpId, setNextEmpId] = useState("");

  // Bulk Onboarding State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedEmployees, setParsedEmployees] = useState<ParsedEmployee[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkSuccessCount, setBulkSuccessCount] = useState(0);
  const [bulkErrorCount, setBulkErrorCount] = useState(0);
  const [bulkFinished, setBulkFinished] = useState(false);
  const [onboardedCredentials, setOnboardedCredentials] = useState<{ fullName: string; email: string; tempPass: string }[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);

  useEffect(() => {
    generateEmployeeId().then(id => setNextEmpId(id));
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      role: "",
      departments: [],
      subRoles: [],
      jobTitle: "",
      phone: "",
      isIntern: false,
      internEndDate: "",
      temporaryPassword: Math.random().toString(36).slice(-8) + "Aa1!",
    },
  });

  const isIntern = form.watch("isIntern");
  const fullNameValue = form.watch("fullName");
  const selectedDepts = form.watch("departments") || [];

  const handleGenerateStaticEmail = () => {
    if (!fullNameValue || fullNameValue.trim().length < 2) {
      setError("Please input the employee's Full Name first to generate a static email.");
      return;
    }
    
    setError(null);
    const slug = fullNameValue
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s.-]/g, '')
      .replace(/\s+/g, '.');
      
    const staticEmail = `${slug}@mintsglobal.ae`;
    form.setValue("email", staticEmail, { shouldValidate: true });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    setError(null);
    let tempApp: any = null;
    try {
      const generatedId = await generateEmployeeId();
      
      const { initializeApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");
      const { setDoc, doc } = await import("firebase/firestore");
      const { firebaseConfig } = await import("@/lib/firebase");
      
      const appName = `tempOnboarding_${Date.now()}`;
      tempApp = initializeApp(firebaseConfig, appName);
      const tempAuth = getAuth(tempApp);
      
      const userCred = await createUserWithEmailAndPassword(
        tempAuth,
        values.email.trim(),
        values.temporaryPassword
      );
      
      const newUid = userCred.user.uid;
      
      const selectedSubroles = values.subRoles || [];
      const validSubroles = selectedSubroles.filter(sub => {
        return values.departments.some(dept => SUBROLES_MAPPING[dept]?.includes(sub));
      });

      await setDoc(doc(db, "employees", newUid), {
        fullName: values.fullName.trim(),
        email: values.email.toLowerCase().trim(),
        role: values.role,
        departments: values.departments,
        subRoles: validSubroles,
        jobTitle: values.jobTitle,
        phone: values.phone || "",
        isIntern: values.isIntern,
        internEndDate: values.internEndDate || null,
        employeeId: generatedId,
        isActive: true,
        dateJoined: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      router.push("/dashboard/hr");
    } catch (err: any) {
      setError(err.message || "Failed to create employee account.");
      setIsSubmitting(false);
    } finally {
      if (tempApp) {
        try {
          await tempApp.delete();
        } catch (e) {
          console.error("Error deleting tempApp:", e);
        }
      }
    }
  }

  // Bulk CSV Handlers
  const downloadSampleTemplate = () => {
    const headers = [
      "FullName",
      "Email",
      "Role",
      "JobTitle",
      "Phone",
      "Departments",
      "SubRoles",
      "IsIntern",
      "InternEndDate",
      "TemporaryPassword"
    ];
    const rows = [
      [
        "Jane Doe",
        "jane.doe@mintsglobal.ae",
        "employee",
        "SEO Specialist",
        "+971501234567",
        "MARKETING",
        "PERFORMANCE;PERFORMANCE » SEO",
        "false",
        "",
        "TempPass123!"
      ],
      [
        "Bob Smith",
        "bob.smith@mintsglobal.ae",
        "intern",
        "Cyber Security Intern",
        "",
        "IT & CYBER SECURITY",
        "SERVICES » OFFENSIVE SECURITY",
        "true",
        "2026-09-30",
        ""
      ]
    ];
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mints_bulk_onboarding_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      try {
        const rows = parseCSV(text);
        const formatted: ParsedEmployee[] = rows.map((row) => {
          const normalizedRow: Record<string, string> = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedRow[normalizedKey] = row[key];
          });

          const fullName = normalizedRow.fullname || "";
          const email = normalizedRow.email || "";
          const role = normalizedRow.role || "employee";
          const jobTitle = normalizedRow.jobtitle || "";
          const phone = normalizedRow.phone || "";
          
          const rawDepts = normalizedRow.departments || "";
          const departments = rawDepts
            ? rawDepts.split(/[;,]/).map(d => d.trim().toUpperCase()).filter(Boolean)
            : [];
            
          const rawSubroles = normalizedRow.subroles || "";
          const subRoles = rawSubroles
            ? rawSubroles.split(/[;,]/).map(s => s.trim()).filter(Boolean)
            : [];

          const isIntern = normalizedRow.isintern?.toLowerCase() === "true";
          const internEndDate = normalizedRow.internenddate || "";
          const temporaryPassword = normalizedRow.temporarypassword || "";

          const parsedEmp: ParsedEmployee = {
            fullName,
            email,
            role,
            jobTitle,
            phone,
            departments,
            subRoles,
            isIntern,
            internEndDate,
            temporaryPassword,
            errors: {},
            status: "pending"
          };

          parsedEmp.errors = validateRow(parsedEmp);
          return parsedEmp;
        });
        setParsedEmployees(formatted);
      } catch (err) {
        console.error("CSV parse error", err);
        alert("Failed to parse CSV file. Please make sure it is a valid format.");
      }
    };
    reader.readAsText(file);
  };

  const downloadOnboardedCredentials = () => {
    const headers = ["FullName", "Email", "TemporaryPassword"];
    const csvContent = [
      headers.join(","),
      ...onboardedCredentials.map(c => `"${c.fullName}","${c.email}","${c.tempPass}"`)
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mints_onboarded_credentials.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startBulkOnboarding = async () => {
    if (parsedEmployees.length === 0) return;
    
    const hasErrors = parsedEmployees.some(emp => Object.keys(emp.errors).length > 0);
    if (hasErrors) {
      alert("Please resolve all validation errors before proceeding.");
      return;
    }

    setIsProcessingBulk(true);
    setBulkFinished(false);
    setBulkSuccessCount(0);
    setBulkErrorCount(0);
    setOnboardedCredentials([]);
    setBulkProgress({ current: 0, total: parsedEmployees.length });

    const { initializeApp } = await import("firebase/app");
    const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");
    const { setDoc, doc } = await import("firebase/firestore");
    const { firebaseConfig } = await import("@/lib/firebase");

    let maxSeq = 0;
    const currentYear = new Date().getFullYear();
    try {
      const snap = await getDocs(collection(db, "employees"));
      snap.forEach((doc) => {
        const data = doc.data();
        const empId = data.employeeId || "";
        if (empId.startsWith("MNTSGBL-")) {
          const parts = empId.split("-");
          if (parts.length === 3) {
            const seq = parseInt(parts[1], 10);
            if (!isNaN(seq) && seq > maxSeq) {
              maxSeq = seq;
            }
          }
        }
      });
    } catch (err) {
      console.error("Failed to query employee ID sequence:", err);
    }

    const credentialsList: { fullName: string; email: string; tempPass: string }[] = [];
    const updatedEmployees = [...parsedEmployees];

    for (let i = 0; i < updatedEmployees.length; i++) {
      const emp = updatedEmployees[i];
      if (emp.status === "success") continue;

      updatedEmployees[i] = { ...emp, status: "provisioning" };
      setParsedEmployees([...updatedEmployees]);
      setBulkProgress(prev => ({ ...prev, current: i + 1 }));

      let tempApp: any = null;
      const tempPass = emp.temporaryPassword || (Math.random().toString(36).slice(-8) + "Aa1!");
      maxSeq++;
      const paddedSeq = maxSeq.toString().padStart(3, "0");
      const generatedId = `MNTSGBL-${paddedSeq}-${currentYear}`;

      try {
        const appName = `tempOnboardingBulk_${Date.now()}_${i}`;
        tempApp = initializeApp(firebaseConfig, appName);
        const tempAuth = getAuth(tempApp);

        const userCred = await createUserWithEmailAndPassword(
          tempAuth,
          emp.email.trim(),
          tempPass
        );
        const newUid = userCred.user.uid;

        const validSubroles = (emp.subRoles || []).filter(sub => {
          return emp.departments.some(dept => SUBROLES_MAPPING[dept]?.includes(sub));
        });

        await setDoc(doc(db, "employees", newUid), {
          fullName: emp.fullName.trim(),
          email: emp.email.toLowerCase().trim(),
          role: emp.role,
          departments: emp.departments,
          subRoles: validSubroles,
          jobTitle: emp.jobTitle,
          phone: emp.phone || "",
          isIntern: emp.isIntern,
          internEndDate: emp.internEndDate || null,
          employeeId: generatedId,
          isActive: true,
          dateJoined: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });

        updatedEmployees[i] = {
          ...updatedEmployees[i],
          status: "success",
          employeeId: generatedId
        };
        credentialsList.push({ fullName: emp.fullName, email: emp.email, tempPass });
        setBulkSuccessCount(prev => prev + 1);
      } catch (err: any) {
        console.error(`Failed to onboard ${emp.fullName}:`, err);
        updatedEmployees[i] = {
          ...updatedEmployees[i],
          status: "failed",
          errorMessage: err.message || "Failed to create account"
        };
        maxSeq--;
        setBulkErrorCount(prev => prev + 1);
      } finally {
        if (tempApp) {
          try {
            await tempApp.delete();
          } catch (e) {
            console.error("Error deleting tempApp:", e);
          }
        }
        setParsedEmployees([...updatedEmployees]);
      }
    }

    setOnboardedCredentials(credentialsList);
    setIsProcessingBulk(false);
    setBulkFinished(true);
  };

  return (
    <RoleGuard permission="MANAGE_USERS" fallback={<div className="p-8 text-center text-foreground/40 font-bold uppercase tracking-wider text-xs">Access Denied. You do not have permission to add employees.</div>}>
      <div className="space-y-6 max-w-4xl pb-12 text-foreground">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Onboard Employees
            </h1>
            <p className="text-xs text-foreground/40 mt-1">Provision login credentials and dashboard settings for your team members.</p>
          </div>
          
          <div className="flex p-1 rounded-xl border border-border shadow-inner">
            <button 
              onClick={() => setActiveTab("single")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "single" ? "bg-primary text-foreground shadow-sm" : "text-foreground/40 hover:text-foreground/80"}`}
            >
              Single Onboarding
            </button>
            <button 
              onClick={() => setActiveTab("bulk")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "bulk" ? "bg-primary text-foreground shadow-sm" : "text-foreground/40 hover:text-foreground/80"}`}
            >
              Bulk CSV Wizard
            </button>
          </div>
        </div>

        {activeTab === "single" ? (
          <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
            <CardHeader className="p-6 border-b border-border">
              <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider flex justify-between items-center w-full">
                <span>Employee Onboarding Sheet</span>
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 shadow-sm shrink-0 uppercase tracking-widest">
                  ID: {nextEmpId || "Calculating..."}
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-foreground/40 mt-1.5">
                Input system details. Generates encrypted Firebase credentials automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {error && (
                <div className="p-3 mb-6 text-xs text-red-300 bg-red-950/40 border border-red-500/20 rounded-xl text-center font-medium">
                  {error}
                </div>
              )}
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Full Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. John Doe" 
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Email Address</FormLabel>
                            <button 
                              type="button" 
                              onClick={handleGenerateStaticEmail}
                              className="text-xs text-primary hover:text-primary/80 font-bold flex items-center gap-1 uppercase tracking-wider transition-colors cursor-pointer bg-primary/5 hover:bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20"
                            >
                              <Wand2 className="h-3 w-3" /> Static internal mail
                            </button>
                          </div>
                          <FormControl>
                            <Input 
                              placeholder="e.g. john.doe@mintsglobal.ae or personal@gmail.com" 
                              type="email" 
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription className="text-xs text-foreground/30 leading-relaxed">
                            💡 <strong>Static Accounts:</strong> Auto-generating an @mintsglobal.ae email lets users log in using their username slug (e.g. `john.doe`) without needing a real Google Account!
                          </FormDescription>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">System Role</FormLabel>
                          <FormControl>
                            <select 
                              onChange={field.onChange} 
                              value={field.value || ""} 
                              className="w-full h-10 border border-border rounded-xl px-3 text-xs focus:border-primary/60 focus:ring-0 bg-background text-foreground"
                            >
                              <option value="">Select role...</option>
                              {Object.entries(ROLE_META).map(([key, meta]) => (
                                <option key={key} value={key}>{meta.label}</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription className="text-xs text-foreground/30 uppercase tracking-wider">Determines permissions and access levels.</FormDescription>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="departments"
                      render={() => (
                        <FormItem className="space-y-3 col-span-1 md:col-span-2">
                          <div className="mb-2">
                            <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Departments</FormLabel>
                            <FormDescription className="text-xs text-foreground/30 uppercase tracking-wider">Select one or more departments for this employee.</FormDescription>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {DEPARTMENTS.map((dept) => (
                              <FormField
                                key={dept}
                                control={form.control}
                                name="departments"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={dept}
                                      className="flex flex-row items-start space-x-2 space-y-0 rounded-md border border-border/30 bg-background p-2 hover: transition-colors cursor-pointer"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(dept)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...(field.value || []), dept])
                                              : field.onChange(
                                                  field.value?.filter((value) => value !== dept)
                                                )
                                          }}
                                          className="mt-0.5"
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal text-xs text-foreground/80 cursor-pointer">
                                        {dept}
                                      </FormLabel>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {selectedDepts.some(dept => SUBROLES_MAPPING[dept]?.length > 0) && (
                    <FormField
                      control={form.control}
                      name="subRoles"
                      render={({ field }) => (
                        <FormItem className="space-y-3 col-span-1 md:col-span-2 p-4 rounded-2xl border border-border">
                          <div>
                            <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-accent" />
                              Specializations & Services (Subroles)
                            </FormLabel>
                            <FormDescription className="text-xs text-foreground/30 uppercase tracking-wider">Select specific service subroles within selected departments.</FormDescription>
                          </div>
                          
                          <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                            {selectedDepts.map(dept => {
                              const mappedSubroles = SUBROLES_MAPPING[dept] || [];
                              if (mappedSubroles.length === 0) return null;
                              return (
                                <div key={dept} className="space-y-2 border-b border-border/30 pb-3 last:border-b-0 last:pb-0">
                                  <h5 className="text-xs font-bold text-primary uppercase tracking-wider">{dept} Specialities</h5>
                                  <div className="grid grid-cols-2 gap-2">
                                    {mappedSubroles.map(sub => {
                                      const isChecked = field.value?.includes(sub);
                                      const checkboxId = `new-sub-${sub.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                                      return (
                                        <div
                                          key={sub}
                                          className="flex flex-row items-center space-x-2 rounded-md border border-border/30 bg-card p-2 hover: transition-colors cursor-pointer"
                                        >
                                          <Checkbox
                                            id={checkboxId}
                                            checked={isChecked}
                                            onCheckedChange={(checked) => {
                                              const currentVal = field.value || [];
                                              const updated = checked
                                                ? [...currentVal, sub]
                                                : currentVal.filter(s => s !== sub);
                                              field.onChange(updated);
                                            }}
                                            className="mt-0.5"
                                          />
                                          <label 
                                            htmlFor={checkboxId}
                                            className="text-xs text-foreground/70 cursor-pointer select-none flex-1 py-0.5"
                                          >
                                            {sub}
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="jobTitle"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Job Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. Senior SEO Specialist" 
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Phone Number</FormLabel>
                            <span className="text-xs text-foreground/30 uppercase tracking-wider font-bold">Optional</span>
                          </div>
                          <FormControl>
                            <Input 
                              placeholder="e.g. +971 50 123 4567" 
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full font-mono" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="p-4 rounded-2xl border border-border space-y-4">
                    <FormField
                      control={form.control}
                      name="isIntern"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-xs font-bold text-foreground/80">This employee is an Intern</FormLabel>
                            <FormDescription className="text-xs text-foreground/30 mt-0.5">
                              Interns have restricted dashboards and automatic time-bound account termination.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {isIntern && (
                      <FormField
                        control={form.control}
                        name="internEndDate"
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Internship Expiration Date</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border focus:border-primary/60 focus:ring-0 w-full" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage className="text-rose-400 font-bold text-xs" />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="temporaryPassword"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-bold text-foreground/60 uppercase tracking-wider flex items-center gap-1">
                            <Key className="h-3.5 w-3.5 text-primary" /> Temporary Login Password
                          </FormLabel>
                          <FormControl>
                            <Input 
                              type="text" 
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border focus:border-primary/60 focus:ring-0 w-full font-mono text-primary font-bold" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription className="text-xs text-foreground/30 uppercase tracking-wider">Auto-generated secure credentials. Provide to the employee.</FormDescription>
                          <FormMessage className="text-rose-400 font-bold text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-border">
                    <button 
                      type="button" 
                      onClick={() => router.back()} 
                      disabled={isSubmitting}
                      className="btn-ghost h-10 py-0 px-5 text-xs font-bold border-border text-foreground/70 hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="btn-primary h-10 py-0 px-5 text-xs font-bold flex items-center justify-center cursor-pointer"
                    >
                      {isSubmitting ? "Provisioning..." : "Onboard Employee"}
                    </button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
            <CardHeader className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-primary" /> Bulk CSV Onboarding
                </CardTitle>
                <CardDescription className="text-xs text-foreground/40 mt-1.5">
                  Upload employee details in bulk. System validates rules and creates secure logins in batches.
                </CardDescription>
              </div>
              <button
                onClick={downloadSampleTemplate}
                className="text-xs text-primary hover:text-primary/80 font-bold flex items-center gap-1.5 uppercase tracking-wider bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20 transition-all cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Sample CSV Template
              </button>
            </CardHeader>
            <CardContent className="p-6">
              {!csvFile ? (
                <div className="border-2 border-dashed border-border hover:border-primary/40 rounded-2xl p-12 text-center hover: transition-all relative group cursor-pointer flex flex-col items-center justify-center">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-8 h-8 text-foreground/20 group-hover:text-primary transition-colors mb-4" />
                  <p className="text-xs font-bold text-foreground/80">Drag & Drop your CSV file here, or click to browse</p>
                  <p className="text-xs text-foreground/30 mt-1.5 uppercase tracking-wider">Supports .csv files up to 10MB</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Stats Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3.5 rounded-xl border border-border">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Total Records</p>
                      <p className="text-lg font-bold text-foreground mt-1">{parsedEmployees.length}</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-border">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Validation Errors</p>
                      <p className={`text-lg font-bold mt-1 ${parsedEmployees.some(e => Object.keys(e.errors).length > 0) ? 'text-amber-400' : 'text-accent'}`}>
                        {parsedEmployees.filter(e => Object.keys(e.errors).length > 0).length}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-border">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Successfully Created</p>
                      <p className="text-lg font-bold text-accent mt-1">{bulkSuccessCount}</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-border">
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider">Failed Runs</p>
                      <p className="text-lg font-bold text-rose-400 mt-1">{bulkErrorCount}</p>
                    </div>
                  </div>

                  {/* Processing Status Block */}
                  {isProcessingBulk && (
                    <div className="p-4 bg-blue-950/20 border border-primary/20 rounded-xl space-y-3">
                      <div className="flex justify-between items-center text-xs font-bold text-primary/80">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Processing Batch Onboarding...
                        </span>
                        <span>{bulkProgress.current} / {bulkProgress.total} Complete</span>
                      </div>
                      <div className="bg-card border border-border shadow-sm-progress w-full h-2">
                        <div 
                          className="bg-card border border-border shadow-sm-progress-fill bg-primary h-full transition-all duration-300" 
                          style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {bulkFinished && (
                    <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Batch Onboarding Complete!
                        </p>
                        <p className="text-xs text-foreground/40 mt-1">
                          Successfully onboarded {bulkSuccessCount} employee profiles ({bulkErrorCount} failed).
                        </p>
                      </div>
                      {onboardedCredentials.length > 0 && (
                        <button
                          onClick={downloadOnboardedCredentials}
                          className="text-xs text-accent hover:text-emerald-300 font-bold flex items-center gap-1.5 uppercase tracking-wider bg-emerald-500/5 hover:bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 transition-all cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" /> Download credentials list
                        </button>
                      )}
                    </div>
                  )}

                  {/* Interactive CSV Table Preview */}
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[350px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border text-foreground/40 font-bold uppercase tracking-wider text-xs">
                            <th className="p-3 w-10 text-center">Status</th>
                            <th className="p-3">Full Name</th>
                            <th className="p-3">Email</th>
                            <th className="p-3">Job Title & Role</th>
                            <th className="p-3">Departments</th>
                            <th className="p-3">Internship</th>
                            <th className="p-3 text-center w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedEmployees.map((emp, index) => {
                            const hasErrors = Object.keys(emp.errors).length > 0;
                            return (
                              <tr 
                                key={index} 
                                className={`border-b border-border hover: transition-colors ${hasErrors ? 'bg-amber-500/[0.02]' : ''}`}
                              >
                                <td className="p-3 text-center">
                                  {emp.status === "provisioning" && <Loader2 className="w-4 h-4 text-primary animate-spin mx-auto" />}
                                  {emp.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />}
                                  {emp.status === "failed" && (
                                    <div className="cursor-help" title={emp.errorMessage || "Account creation failed"}>
                                      <AlertCircle className="w-4 h-4 text-rose-500 mx-auto" />
                                    </div>
                                  )}
                                  {emp.status === "pending" && hasErrors && (
                                    <div className="cursor-help animate-pulse" title={Object.values(emp.errors).join("\n")}>
                                      <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                                    </div>
                                  )}
                                  {emp.status === "pending" && !hasErrors && (
                                    <div className="w-2 h-2 rounded-full mx-auto" />
                                  )}
                                </td>
                                <td className="p-3 font-bold text-foreground">
                                  {emp.fullName || <span className="text-rose-400 italic">Empty</span>}
                                </td>
                                <td className="p-3 font-mono text-xs text-foreground/80">{emp.email || <span className="text-rose-400 italic">Empty</span>}</td>
                                <td className="p-3">
                                  <div className="font-semibold">{emp.jobTitle || <span className="text-rose-400 italic">Empty</span>}</div>
                                  <div className="text-xs text-foreground/40 capitalize">{emp.role}</div>
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {emp.departments.map(d => (
                                      <span key={d} className="badge border border-border text-foreground/50 text-xs px-1 py-0.5 uppercase tracking-wider">{d}</span>
                                    ))}
                                    {emp.subRoles.map(s => (
                                      <span key={s} className="badge bg-primary/5 border border-primary/10 text-primary text-xs px-1 py-0.5 uppercase tracking-wider">{s}</span>
                                    ))}
                                    {emp.departments.length === 0 && <span className="text-rose-400 italic text-xs">None</span>}
                                  </div>
                                </td>
                                <td className="p-3">
                                  {emp.isIntern ? (
                                    <span className="text-amber-400 text-xs font-bold">Intern (Exp: {emp.internEndDate || "Date missing"})</span>
                                  ) : (
                                    <span className="text-foreground/30 text-xs">Regular</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      disabled={isProcessingBulk || emp.status === "success"}
                                      onClick={() => {
                                        setEditingIndex(index);
                                        setEditFormData({ ...emp });
                                      }}
                                      className="p-1 text-foreground/40 hover:text-foreground hover: rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={isProcessingBulk || emp.status === "success"}
                                      onClick={() => {
                                        const updated = parsedEmployees.filter((_, i) => i !== index);
                                        setParsedEmployees(updated);
                                      }}
                                      className="p-1 text-foreground/40 hover:text-rose-400 hover:bg-rose-500/5 rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Wizard Footer Controls */}
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-border">
                    <button
                      onClick={() => {
                        setCsvFile(null);
                        setParsedEmployees([]);
                        setBulkFinished(false);
                      }}
                      disabled={isProcessingBulk}
                      className="btn-ghost h-10 px-5 text-xs font-bold border-border text-foreground/70 hover:text-foreground cursor-pointer w-full sm:w-auto"
                    >
                      Clear & Upload New File
                    </button>
                    <button
                      onClick={startBulkOnboarding}
                      disabled={isProcessingBulk || parsedEmployees.some(emp => Object.keys(emp.errors).length > 0) || parsedEmployees.length === 0}
                      className="btn-primary h-10 px-6 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isProcessingBulk ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Onboarding...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" /> Onboard {parsedEmployees.length} Employees
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit row dialog */}
      {editingIndex !== null && editFormData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-xl text-foreground">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-1.5">
                <Edit className="w-4 h-4 text-primary" />
                Edit Onboarding Profile
              </h3>
              <button 
                onClick={() => {
                  setEditingIndex(null);
                  setEditFormData(null);
                }}
                className="text-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Full Name</label>
                <Input 
                  value={editFormData.fullName}
                  onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Email Address</label>
                <Input 
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="e.g. john.doe@mintsglobal.ae"
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">System Role</label>
                  <select 
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="w-full h-9 border border-border rounded-xl px-2.5 text-xs focus:border-primary/60 focus:ring-0 bg-[#0f1510] text-foreground"
                  >
                    {Object.entries(ROLE_META).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Job Title</label>
                  <Input 
                    value={editFormData.jobTitle}
                    onChange={(e) => setEditFormData({ ...editFormData, jobTitle: e.target.value })}
                    placeholder="e.g. SEO Specialist"
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Departments</label>
                <div className="grid grid-cols-3 gap-2">
                  {DEPARTMENTS.map((dept) => (
                    <div 
                      key={dept}
                      onClick={() => {
                        const depts = editFormData.departments.includes(dept)
                          ? editFormData.departments.filter((d: string) => d !== dept)
                          : [...editFormData.departments, dept];
                        setEditFormData({ ...editFormData, departments: depts });
                      }}
                      className={`flex items-center space-x-2 border rounded-md p-1.5 hover: transition-colors cursor-pointer ${editFormData.departments.includes(dept) ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-[#0a100b]'}`}
                    >
                      <input 
                        type="checkbox" 
                        checked={editFormData.departments.includes(dept)}
                        onChange={() => {}}
                        className="rounded border-border/80"
                      />
                      <span className="text-xs text-foreground/80">{dept}</span>
                    </div>
                  ))}
                </div>
              </div>

              {editFormData.departments.some((d: string) => SUBROLES_MAPPING[d]?.length > 0) && (
                <div className="space-y-1.5 p-3 border border-border rounded-xl">
                  <label className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Specializations (Subroles)
                  </label>
                  <div className="space-y-3 max-h-32 overflow-y-auto pr-1">
                    {editFormData.departments.map((d: string) => {
                      const subs = SUBROLES_MAPPING[d] || [];
                      if (subs.length === 0) return null;
                      return (
                        <div key={d} className="space-y-1 border-b border-border/30 pb-2 last:border-0 last:pb-0">
                          <h6 className="text-xs font-bold text-primary uppercase tracking-wider">{d}</h6>
                          <div className="grid grid-cols-2 gap-2">
                            {subs.map((sub: string) => (
                              <div
                                key={sub}
                                onClick={() => {
                                  const subroles = editFormData.subRoles.includes(sub)
                                    ? editFormData.subRoles.filter((s: string) => s !== sub)
                                    : [...editFormData.subRoles, sub];
                                  setEditFormData({ ...editFormData, subRoles: subroles });
                                }}
                                className={`flex items-center space-x-2 border rounded p-1 hover: transition-colors cursor-pointer ${editFormData.subRoles.includes(sub) ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-[#050912]'}`}
                              >
                                <input 
                                  type="checkbox" 
                                  checked={editFormData.subRoles.includes(sub)}
                                  onChange={() => {}}
                                  className="rounded border-border/80"
                                />
                                <span className="text-xs text-foreground/70">{sub}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Phone</label>
                  <Input 
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="Optional"
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Temporary Password</label>
                  <Input 
                    value={editFormData.temporaryPassword}
                    onChange={(e) => setEditFormData({ ...editFormData, temporaryPassword: e.target.value })}
                    placeholder="Auto-Generated"
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full font-mono"
                  />
                </div>
              </div>

              <div className="p-3 border border-border rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="edit-is-intern"
                    checked={editFormData.isIntern}
                    onChange={(e) => setEditFormData({ ...editFormData, isIntern: e.target.checked })}
                    className="rounded border-border/80"
                  />
                  <label htmlFor="edit-is-intern" className="text-xs text-foreground/80 cursor-pointer">This employee is an Intern</label>
                </div>

                {editFormData.isIntern && (
                  <Input 
                    type="date"
                    value={editFormData.internEndDate}
                    onChange={(e) => setEditFormData({ ...editFormData, internEndDate: e.target.value })}
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8 text-xs border-border focus:border-primary/60 focus:ring-0 w-32"
                  />
                )}
              </div>
            </div>

            <div className="p-5 border-t border-border flex justify-end gap-3">
              <button 
                onClick={() => {
                  setEditingIndex(null);
                  setEditFormData(null);
                }}
                className="btn-ghost h-9 px-4 text-xs font-bold border-border text-foreground/70"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const updated = [...parsedEmployees];
                  const validated = { ...editFormData };
                  validated.errors = validateRow(validated);
                  updated[editingIndex] = validated;
                  setParsedEmployees(updated);
                  setEditingIndex(null);
                  setEditFormData(null);
                }}
                className="btn-primary h-9 px-4 text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
