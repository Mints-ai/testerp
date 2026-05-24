"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, deleteDoc, query, collection, where, getDocs, addDoc, serverTimestamp, orderBy, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ROLE_META, canAccess } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Mail, Phone, Calendar, UserRound, ArrowLeft, Shield, Trash2, Plus, Send, FileText, Edit, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

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

export default function EmployeeProfile() {
  const { uid } = useParams();
  const router = useRouter();
  const { user, role } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [employeeLeaves, setEmployeeLeaves] = useState<any[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ name: "", type: "Contract" });
  const [isSubmittingDoc, setIsSubmittingDoc] = useState(false);

  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // Edit Modal state variables
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    jobTitle: "",
    phone: "",
    role: "",
    departments: [] as string[],
    subRoles: [] as string[],
    isIntern: false,
    internEndDate: ""
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenEditModal = () => {
    if (!employee) return;
    setEditForm({
      fullName: employee.fullName || "",
      jobTitle: employee.jobTitle || "",
      phone: employee.phone || "",
      role: employee.role || "",
      departments: employee.departments || (employee.department ? [employee.department] : []),
      subRoles: employee.subRoles || [],
      isIntern: !!employee.isIntern,
      internEndDate: employee.internEndDate || ""
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.fullName.trim()) {
      setEditError("Full Name is required.");
      return;
    }
    if (!editForm.jobTitle.trim()) {
      setEditError("Job Title is required.");
      return;
    }
    if (!editForm.role) {
      setEditError("System Role is required.");
      return;
    }
    if (editForm.departments.length === 0) {
      setEditError("Select at least one department.");
      return;
    }
    if (editForm.isIntern && !editForm.internEndDate) {
      setEditError("Internship expiration date is required when Is Intern is checked.");
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);

    // Filter subRoles to ensure only those belonging to selected departments are saved
    const validSubroles = editForm.subRoles.filter(sub => {
      return editForm.departments.some(dept => SUBROLES_MAPPING[dept]?.includes(sub));
    });

    try {
      await updateDoc(doc(db, "employees", uid as string), {
        fullName: editForm.fullName.trim(),
        jobTitle: editForm.jobTitle.trim(),
        phone: editForm.phone.trim(),
        role: editForm.role,
        departments: editForm.departments,
        subRoles: validSubroles,
        isIntern: editForm.isIntern,
        internEndDate: editForm.isIntern ? editForm.internEndDate : null
      });
      setIsEditOpen(false);
    } catch (err: any) {
      console.error("Error updating employee details:", err);
      setEditError(err.message || "Failed to update employee details.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

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

  useEffect(() => {
    if (!uid) return;
    const fetchProjects = async () => {
      const q = query(collection(db, "projects"), where("memberIds", "array-contains", uid));
      const snap = await getDocs(q);
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingProjects(false);
    };
    fetchProjects();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    
    // We cannot reliably sort leaves by createdAt right away without an index, but employee leaves might be small. 
    // Usually, we just filter. For now, we will sort on the client if it throws an error. Let's just use simple where.
    const qLeaves = query(collection(db, "leaves"), where("employeeId", "==", uid));
    const unsubLeaves = onSnapshot(qLeaves, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmployeeLeaves(docs.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
      setLoadingLeaves(false);
    });

    const qDocs = query(collection(db, "documents"), where("employeeId", "==", uid));
    const unsubDocs = onSnapshot(qDocs, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDocuments(docs.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
      setLoadingDocs(false);
    });

    const qNotes = query(collection(db, "notes"), where("employeeId", "==", uid));
    const unsubNotes = onSnapshot(qNotes, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotes(docs.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
      setLoadingNotes(false);
    });

    return () => {
      unsubLeaves();
      unsubDocs();
      unsubNotes();
    };
  }, [uid]);

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.name || !newDoc.type) return;
    setIsSubmittingDoc(true);
    try {
      await addDoc(collection(db, "documents"), {
        employeeId: uid,
        name: newDoc.name,
        type: newDoc.type,
        addedBy: user?.displayName || "System",
        createdAt: serverTimestamp()
      });
      setIsAddDocOpen(false);
      setNewDoc({ name: "", type: "Contract" });
    } catch (err) {
      console.error(err);
    }
    setIsSubmittingDoc(false);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setIsSubmittingNote(true);
    try {
      await addDoc(collection(db, "notes"), {
        employeeId: uid,
        text: newNote.trim(),
        authorName: user?.displayName || "System",
        createdAt: serverTimestamp()
      });
      setNewNote("");
    } catch (err) {
      console.error(err);
    }
    setIsSubmittingNote(false);
  };

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

        <div className="flex gap-2">
          {canAccess(role, "MANAGE_USERS") && (
            <button 
              onClick={handleOpenEditModal} 
              className="btn-primary h-8 py-0 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-glow-blue"
            >
              <Edit className="h-3.5 w-3.5" /> Edit Profile
            </button>
          )}

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
                {(employee.subRoles || []).map((subRole: string, idx: number) => (
                  <Badge key={`sub-${idx}`} variant="outline" className="bg-indigo-500/10 border-indigo-500/20 text-indigo-300 text-[9px] font-bold uppercase tracking-wider py-0.5 whitespace-nowrap shrink-0">
                    <Sparkles className="w-3 h-3 mr-1 text-indigo-400" />
                    {subRole}
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
            <CardHeader className="p-5 border-b border-white/[0.06] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Onboard Documents Ledger</CardTitle>
                <CardDescription className="text-xs text-white/40 mt-1">Passport copies, Global Visas, National ID, and Corporate Contracts.</CardDescription>
              </div>
              <Dialog open={isAddDocOpen} onOpenChange={setIsAddDocOpen}>
                <DialogTrigger render={<Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs font-bold px-3" />}>
                  <Plus className="h-3 w-3 mr-1" /> Add Record
                </DialogTrigger>
                <DialogContent className="bg-[#0f172a] border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle>Log New Document</DialogTitle>
                    <DialogDescription className="text-white/40">Record the receipt of a new employment document.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddDocument} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-white/60">Document Name</label>
                      <Input value={newDoc.name} onChange={e => setNewDoc({...newDoc, name: e.target.value})} placeholder="e.g. Passport Scan 2026" className="bg-white/5 border-white/10 text-white" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-white/60">Document Type</label>
                      <Select value={newDoc.type} onValueChange={v => setNewDoc({...newDoc, type: v || ""})}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1e293b] border-white/10 text-white">
                          <SelectItem value="Passport">Passport</SelectItem>
                          <SelectItem value="Visa">Visa</SelectItem>
                          <SelectItem value="National ID">National ID</SelectItem>
                          <SelectItem value="Contract">Contract</SelectItem>
                          <SelectItem value="Certificate">Certificate</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" disabled={isSubmittingDoc} className="w-full bg-blue-600 hover:bg-blue-500">{isSubmittingDoc ? "Saving..." : "Save Record"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-6">
              {loadingDocs ? (
                 <div className="flex justify-center"><div className="animate-pulse w-4 h-4 rounded-full bg-blue-500" /></div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/20">No documents recorded yet.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-xl flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{doc.name}</p>
                        <p className="text-xs text-white/40 mt-0.5">{doc.type} • Added {doc.createdAt ? new Date(doc.createdAt.toMillis()).toLocaleDateString() : 'Just now'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="projects" className="mt-4">
          <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <CardHeader className="p-5 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Assigned Strategic Projects</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {loadingProjects ? (
                <div className="flex justify-center"><div className="animate-pulse w-4 h-4 rounded-full bg-blue-500" /></div>
              ) : projects.length === 0 ? (
                <p className="text-xs text-white/35 text-center font-bold uppercase tracking-wider">No active project scopes registered under this staff profile.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {projects.map((proj: any) => (
                    <div key={proj.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors" onClick={() => router.push(`/dashboard/projects/${proj.id}`)}>
                      <h4 className="text-sm font-bold text-white mb-1">{proj.name}</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-white/5 border-white/10 text-white/60 text-[9px] uppercase tracking-wider">{proj.status || "active"}</Badge>
                        <span className="text-[10px] text-white/40 font-mono">{proj.serviceType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves" className="mt-4">
          <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <CardHeader className="p-5 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Staff Leave logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLeaves ? (
                <div className="flex justify-center p-6"><div className="animate-pulse w-4 h-4 rounded-full bg-blue-500" /></div>
              ) : employeeLeaves.length === 0 ? (
                <div className="p-6">
                  <p className="text-xs text-white/35 text-center font-bold uppercase tracking-wider">No leave balance or history entries recorded.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-white/80">
                    <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/50">
                      <tr>
                        <th className="px-5 py-3 font-bold">Leave Type</th>
                        <th className="px-5 py-3 font-bold">Dates</th>
                        <th className="px-5 py-3 font-bold">Days</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {employeeLeaves.map((leave) => (
                        <tr key={leave.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3 font-medium text-white">{leave.leaveType}</td>
                          <td className="px-5 py-3 text-white/50">
                            {leave.startDate} <span className="mx-1 text-white/20">to</span> {leave.endDate}
                          </td>
                          <td className="px-5 py-3">{leave.daysCount}</td>
                          <td className="px-5 py-3">
                            <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider bg-transparent",
                              leave.status === 'approved' ? 'text-emerald-400 border-emerald-500/20' : 
                              leave.status === 'rejected' ? 'text-rose-400 border-rose-500/20' : 
                              'text-amber-400 border-amber-500/20'
                            )}>
                              {leave.status}
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
        </TabsContent>

        {(isManagerOrAbove || isSelf) && (
          <TabsContent value="notes" className="mt-4">
            <Card className="glass-card border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <CardHeader className="p-5 border-b border-white/[0.06]">
                <CardTitle className="text-xs font-bold text-white uppercase tracking-wider">Private Executive Notes</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <form onSubmit={handleAddNote} className="flex gap-3">
                  <Input 
                    placeholder="Add a performance observation..." 
                    value={newNote} 
                    onChange={e => setNewNote(e.target.value)} 
                    className="bg-white/5 border-white/10 text-white" 
                  />
                  <Button type="submit" disabled={isSubmittingNote || !newNote.trim()} className="bg-blue-600 hover:bg-blue-500 text-white px-6 shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>

                <div className="space-y-4">
                  {loadingNotes ? (
                    <div className="flex justify-center py-4"><div className="animate-pulse w-4 h-4 rounded-full bg-blue-500" /></div>
                  ) : notes.length === 0 ? (
                    <p className="text-xs text-white/35 text-center font-bold uppercase tracking-wider py-8">No private observations or performance assessments entered.</p>
                  ) : (
                    notes.map(note => (
                      <div key={note.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                        <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-white/40 font-mono uppercase tracking-wider border-t border-white/5 pt-3">
                          <span>{note.authorName}</span>
                          <span>{note.createdAt ? new Date(note.createdAt.toMillis()).toLocaleString() : 'Just now'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Profile Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-[#0f172a] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-white">Edit Employee Profile</DialogTitle>
            <DialogDescription className="text-white/40 text-xs">Update the employee's system particulars, department assignments, and job details.</DialogDescription>
          </DialogHeader>
          
          {editError && (
            <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-500/20 rounded-xl text-center font-medium">
              {editError}
            </div>
          )}

          <form onSubmit={handleUpdateEmployee} className="space-y-5 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Full Name</label>
                <Input 
                  value={editForm.fullName} 
                  onChange={e => setEditForm({...editForm, fullName: e.target.value})} 
                  placeholder="e.g. John Doe" 
                  className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                  required 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Phone Number</label>
                <Input 
                  value={editForm.phone} 
                  onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                  placeholder="e.g. +971 50 123 4567" 
                  className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Job Title</label>
                <Input 
                  value={editForm.jobTitle} 
                  onChange={e => setEditForm({...editForm, jobTitle: e.target.value})} 
                  placeholder="e.g. Senior Software Architect" 
                  className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full" 
                  required 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">System Role</label>
                <select 
                  value={editForm.role} 
                  onChange={e => setEditForm({...editForm, role: e.target.value})} 
                  className="w-full h-10 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0d1f3c] text-white"
                  required
                >
                  <option value="">Select role...</option>
                  {Object.entries(ROLE_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Departments</label>
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Select one or more departments for this employee.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEPARTMENTS.map((dept) => {
                  const isChecked = editForm.departments.includes(dept);
                  const deptId = `edit-dept-${dept.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                  return (
                    <div
                      key={dept}
                      className="flex flex-row items-center space-x-2 rounded-md border border-white/5 bg-[#0d1f3c] p-2 hover:bg-white/5 transition-colors"
                    >
                      <Checkbox
                        id={deptId}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const updated = checked
                            ? [...editForm.departments, dept]
                            : editForm.departments.filter(d => d !== dept);
                          setEditForm({...editForm, departments: updated});
                        }}
                      />
                      <label 
                        htmlFor={deptId}
                        className="text-xs text-white/80 cursor-pointer select-none flex-1 py-0.5"
                      >
                        {dept}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Subrole Checklist grouped by parent department selection */}
            {editForm.departments.some(dept => SUBROLES_MAPPING[dept]?.length > 0) && (
              <div className="space-y-3 p-4 bg-white/[0.02] rounded-2xl border border-white/[0.06]">
                <div>
                  <label className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Specializations & Services (Subroles)
                  </label>
                  <p className="text-[9px] text-white/30 uppercase tracking-wider">Select specific service subroles within selected departments.</p>
                </div>
                
                <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                  {editForm.departments.map(dept => {
                    const mappedSubroles = SUBROLES_MAPPING[dept] || [];
                    if (mappedSubroles.length === 0) return null;
                    return (
                      <div key={dept} className="space-y-2 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                        <h5 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">{dept} Specialities</h5>
                        <div className="grid grid-cols-2 gap-2">
                          {mappedSubroles.map(sub => {
                            const isChecked = editForm.subRoles.includes(sub);
                            const checkboxId = `edit-sub-${sub.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                            return (
                              <div
                                key={sub}
                                className="flex flex-row items-center space-x-2 rounded-md border border-white/5 bg-[#0a1628] p-2 hover:bg-white/5 transition-colors"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    const updated = checked
                                      ? [...editForm.subRoles, sub]
                                      : editForm.subRoles.filter(s => s !== sub);
                                    setEditForm({...editForm, subRoles: updated});
                                  }}
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
              </div>
            )}

            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/[0.06] space-y-4">
              <div className="flex flex-row items-start space-x-3 space-y-0">
                <Checkbox
                  checked={editForm.isIntern}
                  onCheckedChange={(checked) => setEditForm({...editForm, isIntern: !!checked})}
                  id="editIsIntern"
                />
                <div className="space-y-1 leading-none">
                  <label htmlFor="editIsIntern" className="text-xs font-bold text-white/80 cursor-pointer">This employee is an Intern</label>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    Interns have restricted dashboards and automatic time-bound account termination.
                  </p>
                </div>
              </div>

              {editForm.isIntern && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Internship Expiration Date</label>
                  <Input 
                    type="date" 
                    value={editForm.internEndDate} 
                    onChange={e => setEditForm({...editForm, internEndDate: e.target.value})} 
                    className="glass-input h-10 text-xs border-white/10 focus:border-blue-500/60 focus:ring-0 w-full" 
                    required={editForm.isIntern}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.06]">
              <button 
                type="button" 
                onClick={() => setIsEditOpen(false)} 
                disabled={isSubmittingEdit}
                className="btn-ghost h-10 py-0 px-5 text-xs font-bold border-white/10 text-white/70 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmittingEdit}
                className="btn-primary h-10 py-0 px-5 text-xs font-bold flex items-center justify-center cursor-pointer shadow-glow-blue"
              >
                {isSubmittingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
