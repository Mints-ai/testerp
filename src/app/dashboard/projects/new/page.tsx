"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { canAccess } from "@/lib/permissions";

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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Calendar, Info, Shield, Sparkles, Zap } from "lucide-react";
import { motion } from "framer-motion";

const SERVICES = [
  "SEO Campaign", "Performance Marketing", "Social Media Management",
  "Brand Strategy", "Cybersecurity Audit", "Penetration Testing",
  "Website Development", "Mobile App Development", "Video Production",
  "Photography Shoot", "Graphic Design", "Full-Service Retainer"
];

const formSchema = z.object({
  name: z.string().min(2, "Project name is required"),
  clientId: z.string().min(1, "Client is required"),
  serviceType: z.string().min(1, "Service type is required"),
  managerId: z.string().min(1, "Manager is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  budget: z.string().optional(),
  description: z.string().optional(),
});

export default function CreateProject() {
  const router = useRouter();
  const { user, role } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [managers, setManagers] = useState<any[]>([]);
  const [compCurrency, setCompCurrency] = useState("USD");

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        setCompCurrency(docSnap.data().currency || "USD");
      }
    });
    return () => unsubSettings();
  }, []);
  
  const [clients] = useState([
    { id: "client_1", name: "Al Safa Group" },
    { id: "client_2", name: "Dubai Tech LLC" },
    { id: "client_3", name: "Emirates Retail" }
  ]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      clientId: "",
      serviceType: "",
      managerId: user?.uid || "",
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      budget: "",
      description: "",
    },
  });

  useEffect(() => {
    const fetchManagers = async () => {
      const q = query(collection(db, "employees"), where("role", "in", ["manager", "c_suite", "founder"]));
      const snapshot = await getDocs(q);
      const mgrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setManagers(mgrs);
    };
    fetchManagers();
  }, []);

  const isManagerOrAbove = canAccess(role, "VIEW_ALL_FINANCE");

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) return;
    setIsSubmitting(true);
    
    try {
      const projectData = {
        ...values,
        createdBy: user.uid,
        status: "pitch", 
        memberIds: [values.managerId, user.uid].filter((v, i, a) => a.indexOf(v) === i), 
        memberRoles: {
          [values.managerId]: "Project Manager",
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "projects"), projectData);
      router.push(`/dashboard/projects/${docRef.id}`);
    } catch (err: any) {
      console.error("Error creating project:", err);
      setIsSubmitting(false);
    }
  }

  return (
    <RoleGuard permission="CREATE_PROJECT" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied. Only Senior Employees and above can create projects.</div>}>
      <div className="space-y-6 max-w-3xl pb-12 text-white pl-4 lg:pl-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-500" /> Create New Project
          </h1>
          <p className="text-xs text-white/40 mt-1">Set up a new client contract or strategic internal initiative.</p>
        </div>

        <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
          <CardHeader className="p-6 border-b border-white/[0.06]">
            <CardTitle className="text-sm font-bold text-white uppercase tracking-wider">Project Scope details</CardTitle>
            <CardDescription className="text-xs text-white/40 mt-1">
              Configure initial project specifications, targets, and executive leadership assignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Project Title</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. E-Commerce Platform Redesign" 
                          className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-rose-400 font-bold text-[10px]" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Target Client Account</FormLabel>
                        <FormControl>
                          <select 
                            onChange={field.onChange} 
                            value={field.value || ""} 
                            className="w-full h-10 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0d1f3c] text-white"
                          >
                            <option value="">Select account...</option>
                            {clients.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="serviceType"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Core Deliverable Category</FormLabel>
                        <FormControl>
                          <select 
                            onChange={field.onChange} 
                            value={field.value || ""} 
                            className="w-full h-10 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0d1f3c] text-white"
                          >
                            <option value="">Select scope...</option>
                            {SERVICES.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="managerId"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Assigned Project Director</FormLabel>
                        <FormControl>
                          <select 
                            onChange={field.onChange} 
                            value={field.value || ""} 
                            className="w-full h-10 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0d1f3c] text-white"
                          >
                            <option value="">Select director...</option>
                            {managers.map(m => (
                              <option key={m.id} value={m.id}>{m.fullName}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />

                  {isManagerOrAbove && (
                    <FormField
                      control={form.control}
                      name="budget"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Approved Budget ({compCurrency})</FormLabel>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-bold">Optional</span>
                          </div>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="e.g. 150000" 
                              className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono" 
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
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Kickoff Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
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
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Delivery Target Date</FormLabel>
                          <span className="text-[9px] text-white/30 uppercase tracking-wider font-bold">Optional</span>
                        </div>
                        <FormControl>
                          <Input 
                            type="date" 
                            className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-bold text-white/60 uppercase tracking-wider">Statement of Work & Goals</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Outline specific objectives, milestone deliverable schedules, and overall goals..." 
                          className="glass-input min-h-[120px] text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full p-3"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-rose-400 font-bold text-[10px]" />
                    </FormItem>
                  )}
                />

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
                    {isSubmitting ? "Generating Scope..." : "Log Project Profile"}
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
