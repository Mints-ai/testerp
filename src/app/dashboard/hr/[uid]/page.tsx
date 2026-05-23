"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ROLE_META, canAccess } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Mail, Phone, Calendar, UserRound, ArrowLeft, Shield, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmployeeProfile() {
  const { uid } = useParams();
  const router = useRouter();
  const { user, role } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!uid) return;
    
    const unsubscribe = onSnapshot(doc(db, "employees", uid as string), (docSnap) => {
      if (docSnap.exists()) {
        setEmployee({ id: docSnap.id, ...docSnap.data() });
      } else {
        setEmployee(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-white">
        <div className="animate-pulse text-xs font-bold uppercase tracking-widest text-white/30">Loading Profile Details...</div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center text-white">
        <UserRound className="h-10 w-10 text-white/20 mb-3" />
        <h2 className="text-base font-bold uppercase tracking-wider text-white/70">Employee Not Found</h2>
        <p className="text-xs text-white/30 mt-1 max-w-xs">The requested profile does not exist or you don't have access.</p>
        <button onClick={() => router.push('/dashboard/hr')} className="mt-4 btn-ghost h-9 py-0 px-4 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to HR Hub
        </button>
      </div>
    );
  }

  const roleMeta = ROLE_META[employee.role] || { label: "Employee", color: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" };
  const getInitials = (name: string) => name ? name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() : "U";

  const isManagerOrAbove = ["founder", "c_suite", "manager"].includes(role || "");
  const isSelf = user?.uid === uid;

  const handleDeleteEmployee = async () => {
    if (!window.confirm(`Are you sure you want to completely delete ${employee.fullName}? This cannot be undone.`)) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "employees", uid as string));
      router.push('/dashboard/hr');
    } catch (err) {
      console.error("Error deleting employee:", err);
      alert("Failed to delete employee.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl pb-12 text-white">
      {/* Top Actions */}
      <div className="flex justify-between items-center">
        <button 
          onClick={() => router.push('/dashboard/hr')} 
          className="btn-ghost h-8 py-0 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer text-white/50 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to HR Hub
        </button>

        {canAccess(role, "DELETE_DATA") && !isSelf && (
          <button 
            onClick={handleDeleteEmployee} 
            disabled={isDeleting}
            className="btn-ghost bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 h-8 py-0 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? "Deleting..." : "Delete Employee"}
          </button>
        )}
      </div>

      {/* Header Profile Card */}
      <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
        <div className="h-28 bg-gradient-to-r from-blue-900/60 to-[#0d1f3c] border-b border-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
        </div>
        <div className="px-6 pb-6 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end -mt-12 md:-mt-10">
            <Avatar className="h-24 w-24 border-4 border-[#0a1628] shadow-lg bg-[#0d1f3c] rounded-2xl">
              <AvatarImage src={employee.profilePhotoURL} alt={employee.fullName} />
              <AvatarFallback className="bg-blue-500/10 text-blue-300 text-xl font-bold">
                {getInitials(employee.fullName)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-1 mb-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  {employee.fullName}
                  {employee.email?.toLowerCase().trim() === "binuarjunanand@gmail.com" && (
                    <span title="Super Admin Override Locked">
                      <Shield className="h-4 w-4 text-blue-500 fill-blue-500/15" />
                    </span>
                  )}
                </h1>
                {!employee.isActive && (
                  <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/20 font-bold text-[9px] uppercase tracking-wider">Inactive</Badge>
                )}
              </div>
              <p className="text-xs text-white/50 font-medium">{employee.jobTitle || "No Job Title Assigned"}</p>
              
              <div className="flex flex-wrap items-center gap-2.5 pt-3">
                <Badge className={cn("font-bold text-[9px] shadow-none uppercase tracking-wider py-0.5", roleMeta.color)}>
                  {roleMeta.label}
                </Badge>
                {(employee.departments || (employee.department ? [employee.department] : [])).map((dept: string, idx: number) => (
                  <Badge key={idx} variant="outline" className="bg-white/[0.02] border-white/10 text-white/50 text-[9px] font-bold uppercase tracking-wider py-0.5">
                    <Building2 className="w-3 h-3 mr-1 text-white/30" />
                    {dept}
                  </Badge>
                ))}
                <div className="text-[10px] font-mono font-bold text-blue-400/80 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 tracking-wider md:ml-auto">
                  EMP ID: {employee.employeeId || "No ID"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass-tabs justify-start overflow-x-auto flex-wrap">
          <TabsTrigger value="overview" className="glass-tab">Overview</TabsTrigger>
          <TabsTrigger value="documents" className="glass-tab">Documents</TabsTrigger>
          <TabsTrigger value="projects" className="glass-tab">Projects</TabsTrigger>
          <TabsTrigger value="leaves" className="glass-tab">Leave History</TabsTrigger>
          {(isManagerOrAbove || isSelf) && (
            <TabsTrigger value="notes" className="glass-tab">Private Notes</TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <CardHeader className="p-5 border-b border-white/[0.06]">
                <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Email Address</p>
                    <p className="text-xs font-semibold text-white/95 mt-0.5">{employee.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Phone number</p>
                    <p className="text-xs font-semibold text-white/95 mt-0.5 font-mono">{employee.phone || "Not registered"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <CardHeader className="p-5 border-b border-white/[0.06]">
                <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Employment particulars</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Onboarding Date</p>
                    <p className="text-xs font-semibold text-white/95 mt-0.5">
                      {employee.dateJoined ? new Date(employee.dateJoined).toLocaleDateString(undefined, { dateStyle: 'medium' }) : "TBD"}
                    </p>
                  </div>
                </div>
                {employee.isIntern && (
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20 shrink-0">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Internship Expiration</p>
                      <p className="text-xs font-bold text-amber-300 mt-0.5">
                        {employee.internEndDate ? new Date(employee.internEndDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : "TBD"}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <CardHeader className="p-5 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Onboard Documents Ledger</CardTitle>
              <CardDescription className="text-xs text-white/40 mt-1">Passport copies, Global Visas, National ID, and Corporate Contracts.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <p className="text-xs font-bold uppercase tracking-wider text-white/20">Secure document cloud storage pending activation...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="projects" className="mt-4">
          <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <CardHeader className="p-5 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Assigned Strategic Projects</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-xs text-white/35 text-center font-bold uppercase tracking-wider">No active project scopes registered under this staff profile.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves" className="mt-4">
          <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <CardHeader className="p-5 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Staff Leave logs</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-xs text-white/35 text-center font-bold uppercase tracking-wider">No leave balance or history entries recorded.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {(isManagerOrAbove || isSelf) && (
          <TabsContent value="notes" className="mt-4">
            <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <CardHeader className="p-5 border-b border-white/[0.06]">
                <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Private Executive Notes</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-xs text-white/35 text-center font-bold uppercase tracking-wider">No private observations or performance assessments entered.</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
