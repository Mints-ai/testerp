"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, deleteDoc, query, collection, where, getDocs, addDoc, serverTimestamp, orderBy, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
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
import { Building2, Mail, Phone, Calendar, UserRound, ArrowLeft, Shield, Trash2, Plus, Send, FileText, Edit, Sparkles, ArrowRightLeft, History } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

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


const PRESET_AVATARS = [
  "https://api.dicebear.com/7.x/bottts/svg?seed=mints1",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=James",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Jack",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Luna"
];


export default function EmployeeProfile() {
  const { uid } = useParams();
  const router = useRouter();
  const { user, role } = useAuth();
  const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
  const adminEmails = adminEmailsEnv.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
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

  // Transfer state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferHistory, setTransferHistory] = useState<any[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [transferForm, setTransferForm] = useState({
    departments: [] as string[],
    subRoles: [] as string[],
    role: "",
    reason: ""
  });

  // Admin Security Controls State & Handlers
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const handlePasswordReset = async () => {
    if (!employee?.email) return;
    if (!window.confirm(`Send a secure password reset email to ${employee.fullName} (${employee.email})?`)) return;

    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, employee.email);
      alert(`Password reset link successfully dispatched to ${employee.email}!`);
    } catch (err: any) {
      console.error("Error triggering password reset:", err);
      alert(err.message || "Failed to trigger password reset.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!employee) return;
    const targetStatus = !employee.isActive;
    const actionLabel = targetStatus ? "reactivate" : "deactivate";
    
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${employee.fullName}'s account? This will ${targetStatus ? "restore" : "suspend"} their system login access.`)) return;

    setIsTogglingStatus(true);
    try {
      await updateDoc(doc(db, "employees", uid as string), {
        isActive: targetStatus,
        isArchived: !targetStatus ? true : false, // Synchronize archived state for safety
        updatedAt: new Date().toISOString()
      });
      alert(`User successfully ${targetStatus ? "reactivated" : "deactivated"}!`);
    } catch (err: any) {
      console.error("Error toggling account status:", err);
      alert(err.message || "Failed to toggle account status.");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleUpdateOnboarding = async (taskKey: string, status: "pending" | "completed" | "rejected") => {
    if (!employee || !uid) return;
    try {
      const defaultOnboardingChecklist = {
        nda: "pending",
        visa: "pending",
        emiratesId: "pending",
        digitalSetup: "pending",
        hardware: "pending",
        training: "pending",
      };
      const updatedChecklist = {
        ...(employee.onboardingChecklist || defaultOnboardingChecklist),
        [taskKey]: status
      };
      await updateDoc(doc(db, "employees", uid as string), {
        onboardingChecklist: updatedChecklist,
        updatedAt: new Date().toISOString()
      });
      
      const statusLabels = { pending: "Logged", completed: "Completed", rejected: "Rejected" };
      const getTaskName = (key: string) => {
        if (key === "nda") return "Signed NDA / Employment Contract";
        if (key === "visa") return "Residency Visa Processing & Dispatch";
        if (key === "emiratesId") return "Emirates ID Copy Received";
        if (key === "digitalSetup") return "Digital Access Setup (Secure Mail & Chat)";
        if (key === "hardware") return "Corporate Hardware & Laptop Provisioning";
        return "Cybersecurity Training & Compliance Certificate";
      };

      await addDoc(collection(db, "notifications"), {
        userId: uid,
        title: `Onboarding Milestone ${statusLabels[status]}`,
        message: `Your milestone "${getTaskName(taskKey)}" was marked as ${statusLabels[status]} by ${user?.fullName || "HR Admin"}.`,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (err: any) {
      console.error("Error updating onboarding:", err);
      alert("Failed to update onboarding milestone.");
    }
  };

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
    internEndDate: "",
    profilePhotoURL: ""
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("File size exceeds 2MB limit.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const { storage: firebaseStorage } = await import("@/lib/firebase");

      const fileRef = ref(firebaseStorage, `profile-photos/${uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      setEditForm(prev => ({ ...prev, profilePhotoURL: downloadURL }));
      alert("Avatar uploaded successfully!");
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      alert("Failed to upload avatar to cloud storage.");
    } finally {
      setUploadingAvatar(false);
    }
  };

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
      internEndDate: employee.internEndDate || "",
      profilePhotoURL: employee.profilePhotoURL || ""
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAdmin = canAccess(role, "MANAGE_USERS");
    
    if (!editForm.fullName.trim()) {
      setEditError("Full Name is required.");
      return;
    }
    if (isAdmin) {
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
    }

    setIsSubmittingEdit(true);
    setEditError(null);

    try {
      const updatedFields: any = {
        fullName: editForm.fullName.trim(),
        phone: editForm.phone.trim(),
        profilePhotoURL: editForm.profilePhotoURL || ""
      };

      if (isAdmin) {
        const validSubroles = editForm.subRoles.filter(sub => {
          return editForm.departments.some(dept => SUBROLES_MAPPING[dept]?.includes(sub));
        });

        updatedFields.jobTitle = editForm.jobTitle.trim();
        updatedFields.role = editForm.role;
        updatedFields.departments = editForm.departments;
        updatedFields.subRoles = validSubroles;
        updatedFields.isIntern = editForm.isIntern;
        updatedFields.internEndDate = editForm.isIntern ? editForm.internEndDate : null;
      }

      await updateDoc(doc(db, "employees", uid as string), updatedFields);
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

    // Transfer history
    const qTransfers = query(collection(db, `employees/${uid}/transfers`), orderBy("createdAt", "desc"));
    const unsubTransfers = onSnapshot(qTransfers, (snap) => {
      setTransferHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingTransfers(false);
    }, () => setLoadingTransfers(false));

    return () => {
      unsubLeaves();
      unsubDocs();
      unsubNotes();
      unsubTransfers();
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

  const handleOpenTransferModal = () => {
    if (!employee) return;
    setTransferForm({
      departments: employee.departments || (employee.department ? [employee.department] : []),
      subRoles: employee.subRoles || [],
      role: employee.role || "",
      reason: ""
    });
    setIsTransferOpen(true);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.reason.trim()) {
      alert("A transfer reason is mandatory for audit compliance.");
      return;
    }
    if (transferForm.departments.length === 0) {
      alert("Select at least one department.");
      return;
    }
    setIsSubmittingTransfer(true);
    try {
      const prevDepts = employee.departments || (employee.department ? [employee.department] : []);
      const prevSubRoles = employee.subRoles || [];
      const prevRole = employee.role || "";

      // Atomic update the employee document
      await updateDoc(doc(db, "employees", uid as string), {
        departments: transferForm.departments,
        subRoles: transferForm.subRoles,
        role: transferForm.role,
        updatedAt: new Date().toISOString()
      });

      // Create a transfer record
      await addDoc(collection(db, `employees/${uid}/transfers`), {
        fromDepartments: prevDepts,
        toDepartments: transferForm.departments,
        fromSubRoles: prevSubRoles,
        toSubRoles: transferForm.subRoles,
        fromRole: prevRole,
        toRole: transferForm.role,
        reason: transferForm.reason.trim(),
        executedBy: user?.uid,
        executedByName: user?.fullName || "Admin",
        createdAt: serverTimestamp()
      });

      // Create audit log
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid || "system",
        actorName: user?.fullName || "Admin",
        action: "EMPLOYEE_TRANSFER",
        targetCollection: "employees",
        targetId: uid as string,
        details: `Transferred ${employee.fullName} from [${prevDepts.join(", ")}] to [${transferForm.departments.join(", ")}]. Role: ${prevRole} → ${transferForm.role}. Reason: ${transferForm.reason.trim()}`,
        createdAt: serverTimestamp()
      });

      setIsTransferOpen(false);
      alert("Employee transferred successfully!");
    } catch (err) {
      console.error("Transfer failed:", err);
      alert("Failed to execute transfer.");
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-foreground">
        <div className="animate-pulse text-xs font-bold uppercase tracking-widest text-foreground/30">Loading Profile Details...</div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center text-foreground">
        <UserRound className="h-10 w-10 text-foreground/20 mb-3" />
        <h2 className="text-base font-bold uppercase tracking-wider text-foreground/70">Employee Not Found</h2>
        <p className="text-xs text-foreground/30 mt-1 max-w-xs">The requested profile does not exist or you don't have access.</p>
        <button onClick={() => router.push('/dashboard/hr')} className="mt-4 btn-ghost h-9 py-0 px-4 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to HR Hub
        </button>
      </div>
    );
  }

  const roleMeta = ROLE_META[employee.role] || { label: "Employee", color: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" };
  const getInitials = (name: string) => name ? name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() : "U";

  const isManagerOrAbove = ["founder", "system_admin", "c_suite", "manager"].includes(role || "");
  const isSelf = user?.uid === uid;

  const handleDeleteEmployee = async () => {
    if (!window.confirm(`WARNING: Are you sure you want to deprovision ${employee.fullName}? This will deactivate their ERP access, archive their profile, and sign them out of all active sessions.`)) return;
    
    setIsDeleting(true);
    try {
      await updateDoc(doc(db, "employees", uid as string), {
        isActive: false,
        isArchived: true,
        role: "employee", // Downgrade system role for security
        updatedAt: new Date().toISOString()
      });
      router.push('/dashboard/hr');
    } catch (err) {
      console.error("Error deprovisioning employee:", err);
      alert("Failed to deprovision employee.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl pb-12 text-foreground">
      {/* Top Actions */}
      <div className="flex justify-between items-center">
        <button 
          onClick={() => router.push('/dashboard/hr')} 
          className="btn-ghost h-8 py-0 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer text-foreground/50 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to HR Hub
        </button>

        <div className="flex gap-2">
          {canAccess(role, "MANAGE_USERS") && !isSelf && (
            <button
              onClick={handleOpenTransferModal}
              className="btn-ghost bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 h-8 py-0 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border border-violet-500/20"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer / Promote
            </button>
          )}

          {(canAccess(role, "MANAGE_USERS") || isSelf) && (
            <button 
              onClick={handleOpenEditModal} 
              className="btn-primary h-8 py-0 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
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
              <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? "Deprovisioning..." : "Deprovision Employee"}
            </button>
          )}
        </div>
      </div>

      {/* Header Profile Card */}
      <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
        <div className="h-28 bg-gradient-to-r from-[#708238]/30 to-[#121813] border-b border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
        </div>
        <div className="px-6 pb-6 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end -mt-12 md:-mt-10">
            <Avatar className="h-24 w-24 border-4 border-[#0a0e0b] shadow-lg bg-background rounded-2xl">
              <AvatarImage src={employee.profilePhotoURL} alt={employee.fullName} />
              <AvatarFallback className="bg-primary/10 text-primary/80 text-xl font-bold">
                {getInitials(employee.fullName)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-1 mb-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                  {employee.fullName}
                  {employee.email && adminEmails.includes(employee.email.toLowerCase().trim()) && (
                    <span title="Super Admin Override Locked">
                      <Shield className="h-4 w-4 text-primary fill-blue-500/15" />
                    </span>
                  )}
                </h1>
                {!employee.isActive && (
                  <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/20 font-bold text-xs uppercase tracking-wider">Inactive</Badge>
                )}
              </div>
              <p className="text-xs text-foreground/50 font-medium">{employee.jobTitle || "Team Member"}</p>
              
              <div className="flex flex-wrap items-center gap-2.5 pt-3">
                <Badge className="bg-primary/10 border border-primary/20 text-primary/80 font-bold text-xs shadow-none uppercase tracking-wider py-0.5 whitespace-nowrap shrink-0">
                  💼 Privilege: {roleMeta.label}
                </Badge>
                {(employee.departments || (employee.department ? [employee.department] : [])).map((dept: string, idx: number) => (
                  <Badge key={idx} variant="outline" className="border-border text-foreground/50 text-xs font-bold uppercase tracking-wider py-0.5">
                    <Building2 className="w-3 h-3 mr-1 text-foreground/30" />
                    {dept}
                  </Badge>
                ))}
                {(employee.subRoles || []).map((subRole: string, idx: number) => (
                  <Badge key={`sub-${idx}`} variant="outline" className="bg-primary/10 border-primary/20 text-primary text-xs font-bold uppercase tracking-wider py-0.5 whitespace-nowrap shrink-0">
                    <Sparkles className="w-3 h-3 mr-1 text-accent" />
                    {subRole}
                  </Badge>
                ))}
                <div className="text-xs font-mono font-bold text-primary/80 bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 tracking-wider md:ml-auto">
                  EMP ID: {employee.employeeId || "No ID"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border shadow-sm-tabs justify-start overflow-x-auto flex-wrap">
          <TabsTrigger value="overview" className="bg-card border border-border shadow-sm-tab">Overview</TabsTrigger>
          <TabsTrigger value="documents" className="bg-card border border-border shadow-sm-tab">Documents</TabsTrigger>
          <TabsTrigger value="projects" className="bg-card border border-border shadow-sm-tab">Projects</TabsTrigger>
          <TabsTrigger value="leaves" className="bg-card border border-border shadow-sm-tab">Leave History</TabsTrigger>
          {(isManagerOrAbove || isSelf) && (
            <TabsTrigger value="notes" className="bg-card border border-border shadow-sm-tab">Private Notes</TabsTrigger>
          )}
          <TabsTrigger value="onboarding" className="bg-card border border-border shadow-sm-tab">Onboarding Tracker</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">Email Address</p>
                    <p className="text-xs font-semibold text-foreground/95 mt-0.5">{employee.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">Phone number</p>
                    <p className="text-xs font-semibold text-foreground/95 mt-0.5 font-mono">{employee.phone || "Not registered"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Employment particulars</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">Onboarding Date</p>
                    <p className="text-xs font-semibold text-foreground/95 mt-0.5">
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
                      <p className="text-xs font-bold text-foreground/30 uppercase tracking-wider">Internship Expiration</p>
                      <p className="text-xs font-bold text-amber-300 mt-0.5">
                        {employee.internEndDate ? new Date(employee.internEndDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : "TBD"}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin Security & Lifecycle Panel */}
            {canAccess(role, "MANAGE_USERS") && (
              <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden md:col-span-2">
                <CardHeader className="p-5 border-b border-border bg-blue-950/20">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1">Admin Security & Lifecycle Panel</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-border">
                    <div>
                      <p className="text-xs font-bold text-foreground">System Access Status</p>
                      <p className="text-xs text-foreground/40 uppercase tracking-wider mt-1">Current state in Firebase Auth & Firestore</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={cn("font-bold text-xs uppercase tracking-wider py-1 px-3 shadow-none border", 
                        employee.isActive 
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                      )}>
                        {employee.isActive ? "Active / Allowed Access" : "Deactivated / Access Blocked"}
                      </Badge>
                      <Button
                        type="button"
                        onClick={handleToggleStatus}
                        disabled={isTogglingStatus || isSelf}
                        className={cn("h-8 text-xs font-bold px-3 rounded-lg shrink-0", 
                          employee.isActive 
                            ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30" 
                            : "bg-emerald-600 hover:bg-emerald-500 text-foreground shadow-glow-emerald"
                        )}
                      >
                        {employee.isActive ? "Deactivate Account" : "Reactivate Account"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-border">
                    <div>
                      <p className="text-xs font-bold text-foreground">Account Password Control</p>
                      <p className="text-xs text-foreground/40 uppercase tracking-wider mt-1">Dispatches secure email to set a new password</p>
                    </div>
                    <Button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={isResettingPassword || !employee.email}
                      className="bg-primary hover:bg-primary text-foreground h-8 text-xs font-bold px-4 rounded-lg shrink-0 shadow-sm flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5 rotate-45" /> Dispatch Password Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transfer History Section */}
            {transferHistory.length > 0 && (
              <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden md:col-span-2">
                <CardHeader className="p-5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-violet-400" />
                    <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Transfer & Promotion History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-white/[0.04]">
                  {transferHistory.map((t: any) => (
                    <div key={t.id} className="p-4 hover: transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0 mt-0.5">
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-300 border-rose-500/20 text-xs font-bold uppercase shadow-none">
                              {(t.fromDepartments || []).join(", ") || "N/A"}
                            </Badge>
                            <span className="text-foreground/25 text-xs">→</span>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-xs font-bold uppercase shadow-none">
                              {(t.toDepartments || []).join(", ") || "N/A"}
                            </Badge>
                            {t.fromRole !== t.toRole && (
                              <span className="text-xs text-foreground/40 font-mono">
                                Role: {t.fromRole} → <span className="text-primary/80">{t.toRole}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/50 leading-relaxed">
                            <strong className="text-foreground/60">Reason:</strong> {t.reason}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-foreground/25 font-mono">
                            <span>By: {t.executedByName || "Admin"}</span>
                            <span>{t.createdAt ? new Date(t.createdAt.seconds ? t.createdAt.seconds * 1000 : t.createdAt).toLocaleDateString() : "Just now"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
            <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Onboard Documents Ledger</CardTitle>
                <CardDescription className="text-xs text-foreground/40 mt-1">Passport copies, Global Visas, National ID, and Corporate Contracts.</CardDescription>
              </div>
              <Dialog open={isAddDocOpen} onOpenChange={setIsAddDocOpen}>
                <DialogTrigger render={<Button size="sm" className="bg-primary hover:bg-primary text-foreground h-8 text-xs font-bold px-3" />}>
                  <Plus className="h-3 w-3 mr-1" /> Add Record
                </DialogTrigger>
                <DialogContent className="bg-card border-border text-foreground">
                  <DialogHeader>
                    <DialogTitle>Log New Document</DialogTitle>
                    <DialogDescription className="text-foreground/40">Record the receipt of a new employment document.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddDocument} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-foreground/60">Document Name</label>
                      <Input value={newDoc.name} onChange={e => setNewDoc({...newDoc, name: e.target.value})} placeholder="e.g. Passport Scan 2026" className="border-border text-foreground" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-foreground/60">Document Type</label>
                      <Select value={newDoc.type} onValueChange={v => setNewDoc({...newDoc, type: v || ""})}>
                        <SelectTrigger className="border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1e293b] border-border text-foreground">
                          <SelectItem value="Passport">Passport</SelectItem>
                          <SelectItem value="Visa">Visa</SelectItem>
                          <SelectItem value="National ID">National ID</SelectItem>
                          <SelectItem value="Contract">Contract</SelectItem>
                          <SelectItem value="Certificate">Certificate</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" disabled={isSubmittingDoc} className="w-full bg-primary hover:bg-primary">{isSubmittingDoc ? "Saving..." : "Save Record"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-6">
              {loadingDocs ? (
                 <div className="flex justify-center"><div className="animate-pulse w-4 h-4 rounded-full bg-primary" /></div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground/20">No documents recorded yet.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="p-4 border border-border rounded-xl flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{doc.name}</p>
                        <p className="text-xs text-foreground/40 mt-0.5">{doc.type} • Added {doc.createdAt ? new Date(doc.createdAt.toMillis()).toLocaleDateString() : 'Just now'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="projects" className="mt-4">
          <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Assigned Strategic Projects</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {loadingProjects ? (
                <div className="flex justify-center"><div className="animate-pulse w-4 h-4 rounded-full bg-primary" /></div>
              ) : projects.length === 0 ? (
                <p className="text-xs text-foreground/35 text-center font-bold uppercase tracking-wider">No active project scopes registered under this staff profile.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {projects.map((proj: any) => (
                    <div key={proj.id} className="p-4 border border-border rounded-xl cursor-pointer hover: transition-colors" onClick={() => router.push(`/dashboard/projects/${proj.id}`)}>
                      <h4 className="text-sm font-bold text-foreground mb-1">{proj.name}</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-border text-foreground/60 text-xs uppercase tracking-wider">{proj.status || "active"}</Badge>
                        <span className="text-xs text-foreground/40 font-mono">{proj.serviceType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves" className="mt-4">
          <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Staff Leave logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLeaves ? (
                <div className="flex justify-center p-6"><div className="animate-pulse w-4 h-4 rounded-full bg-primary" /></div>
              ) : employeeLeaves.length === 0 ? (
                <div className="p-6">
                  <p className="text-xs text-foreground/35 text-center font-bold uppercase tracking-wider">No leave balance or history entries recorded.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-foreground/80">
                    <thead className="border-b border-border text-xs uppercase tracking-wider text-foreground/50">
                      <tr>
                        <th className="px-5 py-3 font-bold">Leave Type</th>
                        <th className="px-5 py-3 font-bold">Dates</th>
                        <th className="px-5 py-3 font-bold">Days</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {employeeLeaves.map((leave) => (
                        <tr key={leave.id} className="hover: transition-colors">
                          <td className="px-5 py-3 font-medium text-foreground">{leave.leaveType}</td>
                          <td className="px-5 py-3 text-foreground/50">
                            {leave.startDate} <span className="mx-1 text-foreground/20">to</span> {leave.endDate}
                          </td>
                          <td className="px-5 py-3">{leave.daysCount}</td>
                          <td className="px-5 py-3">
                            <Badge variant="outline" className={cn("text-xs uppercase tracking-wider bg-transparent",
                              leave.status === 'approved' ? 'text-accent border-emerald-500/20' : 
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
            <Card className="bg-card border border-border shadow-sm rounded-lg border-border overflow-hidden">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Private Executive Notes</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <form onSubmit={handleAddNote} className="flex gap-3">
                  <Input 
                    placeholder="Add a performance observation..." 
                    value={newNote} 
                    onChange={e => setNewNote(e.target.value)} 
                    className="border-border text-foreground" 
                  />
                  <Button type="submit" disabled={isSubmittingNote || !newNote.trim()} className="bg-primary hover:bg-primary text-foreground px-6 shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>

                <div className="space-y-4">
                  {loadingNotes ? (
                    <div className="flex justify-center py-4"><div className="animate-pulse w-4 h-4 rounded-full bg-primary" /></div>
                  ) : notes.length === 0 ? (
                    <p className="text-xs text-foreground/35 text-center font-bold uppercase tracking-wider py-8">No private observations or performance assessments entered.</p>
                  ) : (
                    notes.map(note => (
                      <div key={note.id} className="p-4 border border-border rounded-xl">
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-foreground/40 font-mono uppercase tracking-wider border-t border-border/30 pt-3">
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

        <TabsContent value="onboarding" className="mt-4">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Circular Progress Gauge */}
            <Card className="bg-card border border-border shadow-sm rounded-lg border-border p-6 flex flex-col items-center justify-center text-center">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">Onboarding Completion</h4>
              
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  {/* Background Circle */}
                  <circle
                    cx="72"
                    cy="72"
                    r="54"
                    className="stroke-white/5 fill-none"
                    strokeWidth="8"
                  />
                  {/* Glow active Ring */}
                  <circle
                    cx="72"
                    cy="72"
                    r="54"
                    className="stroke-indigo-500 fill-none transition-all duration-500"
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 54}
                    strokeDashoffset={2 * Math.PI * 54 - (Math.round((Object.values(employee?.onboardingChecklist || {
                      nda: "pending", visa: "pending", emiratesId: "pending", digitalSetup: "pending", hardware: "pending", training: "pending"
                    }).filter(s => s === "completed").length / 6) * 100) / 100) * (2 * Math.PI * 54)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-extrabold text-foreground font-mono tracking-tight">
                    {Math.round((Object.values(employee?.onboardingChecklist || {
                      nda: "pending", visa: "pending", emiratesId: "pending", digitalSetup: "pending", hardware: "pending", training: "pending"
                    }).filter(s => s === "completed").length / 6) * 100)}%
                  </span>
                  <span className="text-xs font-bold text-foreground/40 uppercase tracking-wider mt-0.5">Verified</span>
                </div>
              </div>

              <p className="text-xs text-foreground/50 font-bold uppercase tracking-wider mt-4">
                {Object.values(employee?.onboardingChecklist || {
                  nda: "pending", visa: "pending", emiratesId: "pending", digitalSetup: "pending", hardware: "pending", training: "pending"
                }).filter(s => s === "completed").length} of 6 Milestones Complete
              </p>
            </Card>

            {/* Checklist List */}
            <Card className="bg-card border border-border shadow-sm rounded-lg border-border md:col-span-2 overflow-hidden">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">Milestone Progress Ledger</CardTitle>
                <CardDescription className="text-xs text-foreground/40">Verify residency documentation, digital accounts, and hardware allocation tracks.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-white/[0.04]">
                {Object.entries(employee?.onboardingChecklist || {
                  nda: "pending", visa: "pending", emiratesId: "pending", digitalSetup: "pending", hardware: "pending", training: "pending"
                }).map(([taskKey, taskVal]: [string, any]) => {
                  const label = (() => {
                    if (taskKey === "nda") return "Signed NDA / Employment Contract";
                    if (taskKey === "visa") return "Residency Visa Processing & Dispatch";
                    if (taskKey === "emiratesId") return "Emirates ID Copy Received";
                    if (taskKey === "digitalSetup") return "Digital Access Setup (Secure Mail & Chat)";
                    if (taskKey === "hardware") return "Corporate Hardware & Laptop Provisioning";
                    return "Cybersecurity Training & Compliance Certificate";
                  })();

                  const statusColor = 
                    taskVal === "completed" ? "bg-emerald-600/10 text-accent border-emerald-500/20" :
                    taskVal === "rejected" ? "bg-rose-600/10 text-rose-400 border-rose-500/20 shadow-glow-red" :
                    "bg-amber-600/10 text-amber-400 border-amber-500/20";

                  return (
                    <div key={taskKey} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover: transition-colors">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-foreground block">{label}</span>
                        <span className="text-xs font-mono text-foreground/30 uppercase tracking-widest block">{taskKey}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <Badge variant="outline" className={`font-bold text-xs py-0.5 tracking-wider uppercase shadow-none shrink-0 ${statusColor}`}>
                          {taskVal || "pending"}
                        </Badge>

                        {canAccess(role, "MANAGE_USERS") && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleUpdateOnboarding(taskKey, "completed")}
                              className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-xs font-bold text-accent transition-colors uppercase cursor-pointer"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => handleUpdateOnboarding(taskKey, "rejected")}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 transition-colors uppercase cursor-pointer"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleUpdateOnboarding(taskKey, "pending")}
                              className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-xs font-bold text-amber-400 transition-colors uppercase cursor-pointer"
                            >
                              Log
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-foreground">Edit Employee Profile</DialogTitle>
            <DialogDescription className="text-foreground/40 text-xs">Update the employee's system particulars, department assignments, and job details.</DialogDescription>
          </DialogHeader>
          
          {editError && (
            <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-500/20 rounded-xl text-center font-medium">
              {editError}
            </div>
          )}

          <form onSubmit={handleUpdateEmployee} className="space-y-5 pt-2">
            {/* Profile Photo Upload / Curated presets */}
            <div className="p-4 rounded-2xl border border-border space-y-4">
              <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider block">Profile Avatar</label>
              
              <div className="flex flex-col sm:flex-row gap-5 items-center">
                <Avatar className="h-16 w-16 border-2 border-border bg-background rounded-xl shrink-0">
                  <AvatarImage src={editForm.profilePhotoURL} />
                  <AvatarFallback className="bg-primary/10 text-primary/80 text-lg font-bold">
                    {getInitials(editForm.fullName)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 w-full space-y-3">
                  <div className="flex gap-2">
                    <input 
                      type="file" 
                      id="profile-photo-upload" 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleAvatarUpload}
                    />
                    <Button 
                      type="button" 
                      onClick={() => document.getElementById('profile-photo-upload')?.click()}
                      disabled={uploadingAvatar}
                      variant="outline"
                      className="text-xs h-9 border-border text-foreground hover:bg-muted/80"
                    >
                      {uploadingAvatar ? "Uploading..." : "Upload Photo"}
                    </Button>
                    {editForm.profilePhotoURL && (
                      <Button 
                        type="button" 
                        onClick={() => setEditForm({...editForm, profilePhotoURL: ""})}
                        variant="ghost"
                        className="text-xs h-9 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-foreground/40">PNG, JPG or WEBP. Max 2MB.</p>
                </div>
              </div>

              {/* Presets Row */}
              <div className="space-y-2">
                <p className="text-xs text-foreground/50 uppercase tracking-wider font-bold">Or select a premium preset avatar:</p>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_AVATARS.map((avatar, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, profilePhotoURL: avatar })}
                      className={cn("h-10 w-10 rounded-lg overflow-hidden border-2 transition-all p-0.5 bg-[#0a0f18]",
                        editForm.profilePhotoURL === avatar ? "border-primary scale-105 shadow-sm" : "border-border hover:border-border"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatar} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover rounded-md" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Full Name</label>
                <Input 
                  value={editForm.fullName} 
                  onChange={e => setEditForm({...editForm, fullName: e.target.value})} 
                  placeholder="e.g. John Doe" 
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full" 
                  required 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Phone Number</label>
                <Input 
                  value={editForm.phone} 
                  onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                  placeholder="e.g. +971 50 123 4567" 
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full font-mono" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Job Title</label>
                <Input 
                  value={editForm.jobTitle} 
                  onChange={e => setEditForm({...editForm, jobTitle: e.target.value})} 
                  placeholder="e.g. Senior Software Architect" 
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full disabled:opacity-50 disabled:cursor-not-allowed" 
                  required 
                  disabled={!canAccess(role, "MANAGE_USERS")}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">System Role</label>
                <select 
                  value={editForm.role} 
                  onChange={e => setEditForm({...editForm, role: e.target.value})} 
                  className="w-full h-10 border border-border rounded-xl px-3 text-xs focus:border-primary/60 focus:ring-0 bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                  disabled={!canAccess(role, "MANAGE_USERS")}
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
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Departments</label>
                <p className="text-xs text-foreground/30 uppercase tracking-wider">Select one or more departments for this employee.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEPARTMENTS.map((dept) => {
                  const isChecked = editForm.departments.includes(dept);
                  const deptId = `edit-dept-${dept.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                  return (
                    <div
                      key={dept}
                      className="flex flex-row items-center space-x-2 rounded-md border border-border/30 bg-background p-2 hover: transition-colors"
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
                        disabled={!canAccess(role, "MANAGE_USERS")}
                      />
                      <label 
                        htmlFor={deptId}
                        className="text-xs text-foreground/80 cursor-pointer select-none flex-1 py-0.5"
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
              <div className="space-y-3 p-4 rounded-2xl border border-border">
                <div>
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    Specializations & Services (Subroles)
                  </label>
                  <p className="text-xs text-foreground/30 uppercase tracking-wider">Select specific service subroles within selected departments.</p>
                </div>
                
                <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                  {editForm.departments.map(dept => {
                    const mappedSubroles = SUBROLES_MAPPING[dept] || [];
                    if (mappedSubroles.length === 0) return null;
                    return (
                      <div key={dept} className="space-y-2 border-b border-border/30 pb-3 last:border-b-0 last:pb-0">
                        <h5 className="text-xs font-bold text-primary uppercase tracking-wider">{dept} Specialities</h5>
                        <div className="grid grid-cols-2 gap-2">
                          {mappedSubroles.map(sub => {
                            const isChecked = editForm.subRoles.includes(sub);
                            const checkboxId = `edit-sub-${sub.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                            return (
                              <div
                                key={sub}
                                className="flex flex-row items-center space-x-2 rounded-md border border-border/30 bg-card p-2 hover: transition-colors"
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
                                  disabled={!canAccess(role, "MANAGE_USERS")}
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
              </div>
            )}

            <div className="p-4 rounded-2xl border border-border space-y-4">
              <div className="flex flex-row items-start space-x-3 space-y-0">
                <Checkbox
                  checked={editForm.isIntern}
                  onCheckedChange={(checked) => setEditForm({...editForm, isIntern: !!checked})}
                  id="editIsIntern"
                  disabled={!canAccess(role, "MANAGE_USERS")}
                />
                <div className="space-y-1 leading-none">
                  <label htmlFor="editIsIntern" className="text-xs font-bold text-foreground/80 cursor-pointer">This employee is an Intern</label>
                  <p className="text-xs text-foreground/30 mt-0.5">
                    Interns have restricted dashboards and automatic time-bound account termination.
                  </p>
                </div>
              </div>

              {editForm.isIntern && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Internship Expiration Date</label>
                  <Input 
                    type="date" 
                    value={editForm.internEndDate} 
                    onChange={e => setEditForm({...editForm, internEndDate: e.target.value})} 
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 text-xs border-border focus:border-primary/60 focus:ring-0 w-full disabled:opacity-50" 
                    required={editForm.isIntern}
                    disabled={!canAccess(role, "MANAGE_USERS")}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button 
                type="button" 
                onClick={() => setIsEditOpen(false)} 
                disabled={isSubmittingEdit}
                className="btn-ghost h-10 py-0 px-5 text-xs font-bold border-border text-foreground/70 hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmittingEdit}
                className="btn-primary h-10 py-0 px-5 text-xs font-bold flex items-center justify-center cursor-pointer shadow-sm"
              >
                {isSubmittingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer / Promote Dialog */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-violet-400" />
              Transfer / Promote Employee
            </DialogTitle>
            <DialogDescription className="text-foreground/40 text-xs">
              Reassign {employee?.fullName}'s department, specializations, and role. A mandatory reason is required for audit compliance.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitTransfer} className="space-y-5 pt-2">
            {/* Role */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">New System Role</label>
              <select
                value={transferForm.role}
                onChange={e => setTransferForm({ ...transferForm, role: e.target.value })}
                className="w-full h-10 border border-border rounded-xl px-3 text-xs focus:border-violet-500/60 focus:ring-0 bg-background text-foreground"
                required
              >
                <option value="">Select role...</option>
                {Object.entries(ROLE_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>

            {/* Departments */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Target Departments</label>
                <p className="text-xs text-foreground/30 uppercase tracking-wider">Select the new department assignment(s).</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEPARTMENTS.map((dept) => {
                  const isChecked = transferForm.departments.includes(dept);
                  const deptId = `transfer-dept-${dept.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                  return (
                    <div
                      key={dept}
                      className="flex flex-row items-center space-x-2 rounded-md border border-border/30 bg-background p-2 hover: transition-colors"
                    >
                      <Checkbox
                        id={deptId}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const updated = checked
                            ? [...transferForm.departments, dept]
                            : transferForm.departments.filter(d => d !== dept);
                          setTransferForm({ ...transferForm, departments: updated });
                        }}
                      />
                      <label
                        htmlFor={deptId}
                        className="text-xs text-foreground/80 cursor-pointer select-none flex-1 py-0.5"
                      >
                        {dept}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subroles */}
            {transferForm.departments.some(dept => SUBROLES_MAPPING[dept]?.length > 0) && (
              <div className="space-y-3 p-4 rounded-2xl border border-border">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  Transfer Specializations
                </label>
                <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                  {transferForm.departments.map(dept => {
                    const mappedSubroles = SUBROLES_MAPPING[dept] || [];
                    if (mappedSubroles.length === 0) return null;
                    return (
                      <div key={dept} className="space-y-2 border-b border-border/30 pb-3 last:border-b-0 last:pb-0">
                        <h5 className="text-xs font-bold text-primary uppercase tracking-wider">{dept}</h5>
                        <div className="grid grid-cols-2 gap-2">
                          {mappedSubroles.map(sub => {
                            const isChecked = transferForm.subRoles.includes(sub);
                            const checkboxId = `transfer-sub-${sub.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                            return (
                              <div
                                key={sub}
                                className="flex flex-row items-center space-x-2 rounded-md border border-border/30 bg-card p-2 hover: transition-colors"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    const updated = checked
                                      ? [...transferForm.subRoles, sub]
                                      : transferForm.subRoles.filter(s => s !== sub);
                                    setTransferForm({ ...transferForm, subRoles: updated });
                                  }}
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
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Reason for Transfer *</label>
              <Textarea
                placeholder="e.g. Departmental restructuring, performance-based promotion, project requirements..."
                value={transferForm.reason}
                onChange={e => setTransferForm({ ...transferForm, reason: e.target.value })}
                className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-h-[80px] text-xs border-border p-3 placeholder:text-foreground/20 focus:border-violet-500/60 focus:ring-0"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                disabled={isSubmittingTransfer}
                className="btn-ghost h-10 py-0 px-5 text-xs font-bold border-border text-foreground/70 hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingTransfer}
                className="h-10 py-0 px-5 text-xs font-bold flex items-center justify-center cursor-pointer rounded-xl bg-violet-600 hover:bg-violet-500 text-foreground transition-colors"
              >
                {isSubmittingTransfer ? "Executing Transfer..." : "Execute Transfer"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
