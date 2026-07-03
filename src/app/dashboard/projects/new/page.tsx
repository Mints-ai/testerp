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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    const fetchClients = async () => {
      const q = query(collection(db, "clients"));
      const snapshot = await getDocs(q);
      const clis = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().companyName }));
      setClients(clis);
    };
    fetchClients();
  }, []);

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
      const q = query(collection(db, "employees"), where("role", "in", ["manager", "system_admin", "c_suite", "founder"]));
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

      if (values.managerId !== user.uid) {
        await addDoc(collection(db, "notifications"), {
          userId: values.managerId,
          title: "New Project Assigned",
          message: `You have been assigned as Project Manager for: ${values.name}`,
          read: false,
          createdAt: serverTimestamp()
        });

        fetch('/api/discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `🚀 **New Project Created**\n**Project:** ${values.name}\n**Manager ID:** ${values.managerId}`
          })
        }).catch(err => console.error("Discord error:", err));
      }

      router.push(`/dashboard/projects/${docRef.id}`);
    } catch (err: any) {
      console.error("Error creating project:", err);
      setIsSubmitting(false);
    }
  }

  return (
    <RoleGuard permission="CREATE_PROJECT" fallback={<div className="p-8 text-center text-foreground/40 font-bold uppercase tracking-wider text-xs">Access Denied. Only Senior Employees and above can create projects.</div>}>
      <div className="space-y-6 max-w-3xl pb-12 text-foreground">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" /> Create New Project
          </h1>
          <p className="text-sm text-foreground/60 mt-1">Set up a new client contract or strategic internal initiative.</p>
        </div>

        <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
          <CardHeader className="p-8 border-b border-border">
            <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">Project Scope details</CardTitle>
            <CardDescription className="text-sm text-foreground/60 mt-1">
              Configure initial project specifications, targets, and executive leadership assignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Project Title</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. E-Commerce Platform Redesign" 
                          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-11 text-sm border-border placeholder:text-foreground/30 focus:border-primary/60 focus:ring-0 w-full" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-rose-400 font-bold text-xs" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Target Client Account</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="w-full h-11 border-border rounded-xl px-4 text-sm focus:border-primary/60 focus:ring-0 bg-background text-foreground">
                              <SelectValue placeholder="Select account..." />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-border text-foreground">
                              {clients.map(c => (
                                <SelectItem key={c.id} value={c.id} className="text-sm hover: focus:">{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-xs" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="serviceType"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Core Deliverable Category</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="w-full h-11 border-border rounded-xl px-4 text-sm focus:border-primary/60 focus:ring-0 bg-background text-foreground">
                              <SelectValue placeholder="Select scope..." />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-border text-foreground">
                              {SERVICES.map(s => (
                                <SelectItem key={s} value={s} className="text-sm hover: focus:">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="managerId"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Assigned Project Director</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="w-full h-11 border-border rounded-xl px-4 text-sm focus:border-primary/60 focus:ring-0 bg-background text-foreground">
                              <SelectValue placeholder="Select director..." />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-border text-foreground">
                              {managers.map(m => (
                                <SelectItem key={m.id} value={m.id} className="text-sm hover: focus:">{m.fullName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-xs" />
                      </FormItem>
                    )}
                  />

                  {isManagerOrAbove && (
                    <FormField
                      control={form.control}
                      name="budget"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Approved Budget ({compCurrency})</FormLabel>
                            <span className="text-xs text-foreground/40 uppercase tracking-wider font-bold">Optional</span>
                          </div>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="e.g. 150000" 
                              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-11 text-sm border-border placeholder:text-foreground/30 focus:border-primary/60 focus:ring-0 w-full font-mono" 
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
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Kickoff Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-11 text-sm border-border placeholder:text-foreground/30 focus:border-primary/60 focus:ring-0 w-full bg-background/50" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-xs" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex justify-between items-center">
                          <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Delivery Target Date</FormLabel>
                          <span className="text-xs text-foreground/40 uppercase tracking-wider font-bold">Optional</span>
                        </div>
                        <FormControl>
                          <Input 
                            type="date" 
                            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-11 text-sm border-border placeholder:text-foreground/30 focus:border-primary/60 focus:ring-0 w-full bg-background/50" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-rose-400 font-bold text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Statement of Work & Goals</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Outline specific objectives, milestone deliverable schedules, and overall goals..." 
                          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-h-[140px] text-sm border-border placeholder:text-foreground/30 focus:border-primary/60 focus:ring-0 w-full p-4"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-rose-400 font-bold text-xs" />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-4 pt-8 border-t border-border">
                  <button 
                    type="button" 
                    onClick={() => router.back()} 
                    disabled={isSubmitting}
                    className="btn-ghost h-11 py-0 px-6 text-sm font-bold border-border text-foreground/70 hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="btn-primary h-11 py-0 px-6 text-sm font-bold flex items-center justify-center cursor-pointer"
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
