"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc } from "firebase/firestore";
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
import { UserPlus, Sparkles, Wand2, ShieldAlert, Key } from "lucide-react";

const DEPARTMENTS = [
  "Executive Office", "Operations", "HR & Admin", "Finance", 
  "Cyber Security", "Marketing", "Performance Marketing", "SEO", 
  "Social Media", "Branding & Creative", "Software Development", 
  "Information Technology", "Video Production", "Photography & Graphics"
];

const SUBROLES_MAPPING: Record<string, string[]> = {
  "Cyber Security": [
    "Products",
    "Services",
    "Offensive security",
    "Incident response / DFIR",
    "Cloud Security",
    "Compliance/GRC",
    "Managed/Advisory",
    "OT/Iot security",
    "Training"
  ],
  "Software Development": [
    "Products",
    "Services",
    "Website Development",
    "WordPress Websites",
    "Custom-Coded Websites",
    "Web Applications",
    "ERP",
    "CRM",
    "Mobile Application Development",
    "E-Commerce Solutions",
    "WooCommerce Development"
  ],
  "Information Technology": [
    "Products",
    "Services"
  ],
  "Marketing": [
    "Performance",
    "Creative"
  ],
  "Performance Marketing": [
    "Branding",
    "Search Engine Optimization (SEO)",
    "Performance Marketing",
    "Social Media Management",
    "Influencer Marketing",
    "Commercial Video Production",
    "Photography",
    "Creative Designing"
  ],
  "SEO": [
    "Search Engine Optimization (SEO)"
  ],
  "Social Media": [
    "Social Media Management",
    "Influencer Marketing"
  ],
  "Branding & Creative": [
    "Branding",
    "Creative Designing"
  ],
  "Video Production": [
    "Commercial Video Production"
  ],
  "Photography & Graphics": [
    "Photography",
    "Creative Designing"
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

export default function AddEmployee() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextEmpId, setNextEmpId] = useState("");

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

  // Generate static internal corporate email based on full name slugifier!
  const handleGenerateStaticEmail = () => {
    if (!fullNameValue || fullNameValue.trim().length < 2) {
      setError("Please input the employee's Full Name first to generate a static email.");
      return;
    }
    
    setError(null);
    const slug = fullNameValue
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s.-]/g, '') // remove special chars
      .replace(/\s+/g, '.');         // replace spaces with dots
      
    const staticEmail = `${slug}@mintsglobal.ae`;
    form.setValue("email", staticEmail, { shouldValidate: true });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    setError(null);
    let tempApp: any = null;
    try {
      const generatedId = await generateEmployeeId();
      
      // Initialize a temporary secondary Firebase app context
      // This allows us to register the auth credentials client-side without logging out the current admin!
      const { initializeApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");
      const { setDoc, doc } = await import("firebase/firestore");
      const { firebaseConfig } = await import("@/lib/firebase");
      
      const appName = `tempOnboarding_${Date.now()}`;
      tempApp = initializeApp(firebaseConfig, appName);
      const tempAuth = getAuth(tempApp);
      
      // 1. Create firebase auth credentials
      const userCred = await createUserWithEmailAndPassword(
        tempAuth,
        values.email.trim(),
        values.temporaryPassword
      );
      
      const newUid = userCred.user.uid;
      
      // 2. Set doc with new UID as key
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

  return (
    <RoleGuard permission="MANAGE_USERS" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied. You do not have permission to add employees.</div>}>
      <div className="space-y-6 max-w-3xl pb-12 text-white">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-500" /> Add New Employee
          </h1>
          <p className="text-xs text-white/40 mt-1">Onboard a team member by creating their secure ERP login credentials.</p>
        </div>

        <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
          <CardHeader className="p-6 border-b border-white/[0.06]">
            <CardTitle className="text-sm font-bold text-white uppercase tracking-wider flex justify-between items-center w-full">
              <span>Employee Onboarding Sheet</span>
              <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 shadow-glow-blue shrink-0 uppercase tracking-widest">
                ID: {nextEmpId || "Calculating..."}
              </span>
            </CardTitle>
            <CardDescription className="text-xs text-white/40 mt-1.5">
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
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Full Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. John Doe" 
                            className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Email Address</FormLabel>
                          <button 
                            type="button" 
                            onClick={handleGenerateStaticEmail}
                            className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 uppercase tracking-wider transition-colors cursor-pointer bg-blue-500/5 hover:bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20"
                          >
                            <Wand2 className="h-3 w-3" /> Static internal mail
                          </button>
                        </div>
                        <FormControl>
                          <Input 
                            placeholder="e.g. john.doe@mintsglobal.ae or personal@gmail.com" 
                            type="email" 
                            className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription className="text-[10px] text-white/30 leading-relaxed">
                          💡 <strong>Static Accounts:</strong> Auto-generating an @mintsglobal.ae email lets users log in using their username slug (e.g. `john.doe`) without needing a real Google Account!
                        </FormDescription>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
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
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">System Role</FormLabel>
                        <FormControl>
                          <select 
                            onChange={field.onChange} 
                            value={field.value || ""} 
                            className="w-full h-10 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0d1f3c] text-white"
                          >
                            <option value="">Select role...</option>
                            {Object.entries(ROLE_META).map(([key, meta]) => (
                              <option key={key} value={key}>{meta.label}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormDescription className="text-[9px] text-white/30 uppercase tracking-wider">Determines permissions and access levels.</FormDescription>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="departments"
                    render={() => (
                      <FormItem className="space-y-3 col-span-1 md:col-span-2">
                        <div className="mb-2">
                          <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Departments</FormLabel>
                          <FormDescription className="text-[9px] text-white/30 uppercase tracking-wider">Select one or more departments for this employee.</FormDescription>
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
                                    className="flex flex-row items-start space-x-2 space-y-0 rounded-md border border-white/5 bg-[#0d1f3c] p-2 hover:bg-white/5 transition-colors cursor-pointer"
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
                                    <FormLabel className="font-normal text-xs text-white/80 cursor-pointer">
                                      {dept}
                                    </FormLabel>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Dynamic Subrole Checklist grouped by parent department selection */}
                {selectedDepts.some(dept => SUBROLES_MAPPING[dept]?.length > 0) && (
                  <FormField
                    control={form.control}
                    name="subRoles"
                    render={({ field }) => (
                      <FormItem className="space-y-3 col-span-1 md:col-span-2 p-4 bg-white/[0.02] rounded-2xl border border-white/[0.06]">
                        <div>
                          <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            Specializations & Services (Subroles)
                          </FormLabel>
                          <FormDescription className="text-[9px] text-white/30 uppercase tracking-wider">Select specific service subroles within selected departments.</FormDescription>
                        </div>
                        
                        <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                          {selectedDepts.map(dept => {
                            const mappedSubroles = SUBROLES_MAPPING[dept] || [];
                            if (mappedSubroles.length === 0) return null;
                            return (
                              <div key={dept} className="space-y-2 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                                <h5 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">{dept} Specialities</h5>
                                <div className="grid grid-cols-2 gap-2">
                                  {mappedSubroles.map(sub => {
                                    const isChecked = field.value?.includes(sub);
                                    const checkboxId = `new-sub-${sub.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                                    return (
                                      <div
                                        key={sub}
                                        className="flex flex-row items-center space-x-2 rounded-md border border-white/5 bg-[#0a1628] p-2 hover:bg-white/5 transition-colors cursor-pointer"
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
                                          className="text-xs text-white/70 cursor-pointer select-none flex-1 py-0.5"
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
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
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
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Job Title</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. Senior SEO Specialist" 
                            className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Phone Number</FormLabel>
                          <span className="text-[9px] text-white/30 uppercase tracking-wider font-bold">Optional</span>
                        </div>
                        <FormControl>
                          <Input 
                            placeholder="e.g. +971 50 123 4567" 
                            className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/[0.06] space-y-4">
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
                          <FormLabel className="text-xs font-bold text-white/80">This employee is an Intern</FormLabel>
                          <FormDescription className="text-[10px] text-white/30 mt-0.5">
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
                          <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Internship Expiration Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              className="glass-input h-10 text-xs border-white/10 focus:border-blue-500/60 focus:ring-0 w-full" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-rose-400 font-bold text-[10px]" />
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
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1">
                          <Key className="h-3.5 w-3.5 text-blue-400" /> Temporary Login Password
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="text" 
                            className="glass-input h-10 text-xs border-white/10 focus:border-blue-500/60 focus:ring-0 w-full font-mono text-blue-400 font-bold" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription className="text-[9px] text-white/30 uppercase tracking-wider">Auto-generated secure credentials. Provide to the employee.</FormDescription>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-white/[0.06]">
                  <button 
                    type="button" 
                    onClick={() => router.back()} 
                    disabled={isSubmitting}
                    className="btn-ghost h-10 py-0 px-5 text-xs font-bold border-white/10 text-white/70 hover:text-white cursor-pointer"
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
      </div>
    </RoleGuard>
  );
}
