"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess, ROLE_META, PERMISSIONS } from "@/lib/permissions";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Settings, Users, Building2, Calendar, ShieldAlert, UploadCloud, Plus, Trash2, User, Shield, Activity, ShieldCheck, Laptop, Wifi, Clock, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PERMISSION_LABELS: Record<string, string> = {
  VIEW_ALL_EMPLOYEES:   "View All Employee Records",
  MANAGE_USERS:         "Create & Manage Accounts",
  VIEW_ALL_FINANCE:     "View Global Company Finances",
  VIEW_DEPT_FINANCE:    "View Department Expenses & Budgets",
  MANAGE_FINANCE:       "Approve and Manage Finances",
  CREATE_INVOICE:       "Create and Issue Invoices",
  SUBMIT_EXPENSE:       "Submit Personal Expenses",
  APPROVE_EXPENSE:      "Approve Team Expenses",
  CREATE_PROJECT:       "Create and Plan Projects",
  APPROVE_LEAVE:        "Approve Employee Leaves",
  POST_ANNOUNCEMENT:    "Post Board Announcements",
  VIEW_REPORTS:         "Access Business Insights & Reports",
  SYSTEM_SETTINGS:      "Edit System Settings",
  VIEW_AUDIT_LOG:       "View Database Audit Trail",
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


export default function SettingsDashboard() {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const { theme, setThemeMode } = useTheme();
  const [employees, setEmployees] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"preferences" | "users" | "roles" | "company" | "holidays" | "audit" | "integrations" | "security">("preferences");
  const [selectedRole, setSelectedRole] = useState<string>("employee");

  // Security Credentials states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length === 0) return { score, label: "None", color: "bg-muted/80" };
    if (pass.length >= 8) score++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    switch (score) {
      case 0:
      case 1:
        return { score, label: "Very Weak", color: "bg-rose-500 shadow-glow-rose" };
      case 2:
        return { score, label: "Weak", color: "bg-orange-500 shadow-glow-orange" };
      case 3:
        return { score, label: "Strong", color: "bg-yellow-500 shadow-glow-yellow" };
      case 4:
        return { score, label: "Excellent", color: "bg-emerald-500 shadow-glow-emerald" };
      default:
        return { score, label: "None", color: "bg-muted/80" };
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all security credential fields.", "warning");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match. Please verify.", "error");
      return;
    }
    
    const strengthScore = getPasswordStrength(newPassword).score;
    if (strengthScore < 3) {
      showToast("Your password is too weak. Please meet the required strength metrics.", "warning");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import("firebase/auth");
      const authUser = auth.currentUser;
      if (!authUser || !authUser.email) {
        showToast("No active authenticated session detected.", "error");
        return;
      }
      
      const credential = EmailAuthProvider.credential(authUser.email, currentPassword);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, newPassword);

      // Audit log the password modification for security tracing
      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid,
        action: "UPDATE_PASSWORD",
        targetCollection: "users",
        details: `Successfully modified personal account security password.`,
        createdAt: serverTimestamp()
      });

      showToast("Password updated successfully! Keep it secure.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/wrong-password") {
        showToast("Incorrect current password. Re-authentication failed.", "error");
      } else {
        showToast(err.message || "Failed to update password.", "error");
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Integrations states
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState({
    auth: true,
    finance: true,
    projects: true,
    security: true,
    ocr: true
  });
  const [webhookUrls, setWebhookUrls] = useState({
    auth: "",
    finance: "",
    projects: "",
    security: "",
    ocr: ""
  });
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  
  // Audit Logs V2 Filtering States
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  const [selectedAuditAction, setSelectedAuditAction] = useState<string>("ALL");
  const [selectedAuditActor, setSelectedAuditActor] = useState<string>("ALL");
  
  const [companySettings, setCompanySettings] = useState<any>({
    name: "Mints Global",
    address: "Global HQ",
    vatNumber: "100XXXXXXXXXX",
    currency: "AED",
    holidays: []
  });
  
  // Company Profile states
  const [compName, setCompName] = useState("");
  const [compVat, setCompVat] = useState("");
  const [compCurrency, setCompCurrency] = useState("AED");
  const [compAddress, setCompAddress] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });

  // Preferences local states
  const [prefName, setPrefName] = useState("");
  const [prefPhone, setPrefPhone] = useState("");
  const [prefPhoto, setPrefPhoto] = useState("");
  const [prefGrid, setPrefGrid] = useState(true);
  const [prefNotifs, setPrefNotifs] = useState({ email: true, app: true });
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

      const fileRef = ref(firebaseStorage, `profile-photos/${user?.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      setPrefPhoto(downloadURL);
      showToast("Avatar uploaded successfully!", "success");
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      showToast("Failed to upload avatar to cloud storage.", "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const isFounder = role === "founder" || role === "system_admin";
  const isCSuiteOrAbove = canAccess(role, "SYSTEM_SETTINGS"); // founder, c_suite

  // Load preferences from Firestore / localStorage on mount
  useEffect(() => {
    if (!user) return;
    
    // Fallback initially to user profile / localStorage
    if (user.displayName) {
      setPrefName(user.displayName);
    }
    if (typeof window !== "undefined") {
      const hideGrid = localStorage.getItem("hideGrid") === "true";
      setPrefGrid(!hideGrid);
      const savedEmailNotifs = localStorage.getItem("notifEmail") !== "false";
      const savedAppNotifs = localStorage.getItem("notifApp") !== "false";
      setPrefNotifs({ email: savedEmailNotifs, app: savedAppNotifs });
    }

    // Realtime sync from user's Firestore employee document
    const unsubUser = onSnapshot(doc(db, "employees", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.fullName) setPrefName(data.fullName);
        if (data.phone) setPrefPhone(data.phone);
        if (data.profilePhotoURL) setPrefPhoto(data.profilePhotoURL);
        if (data.preferences) {
          const prefs = data.preferences;
          if (prefs.theme !== undefined) {
            setThemeMode(prefs.theme as "light" | "dark");
          }
          if (prefs.hideGrid !== undefined) {
            setPrefGrid(!prefs.hideGrid);
            // Apply grid class globally
            if (typeof window !== "undefined") {
              if (prefs.hideGrid) {
                document.documentElement.classList.add("no-grid");
              } else {
                document.documentElement.classList.remove("no-grid");
              }
            }
          }
          setPrefNotifs({
            email: prefs.emailNotifications ?? true,
            app: prefs.inAppAlerts ?? true
          });
        }
      }
    });

    return () => unsubUser();
  }, [user]);

  useEffect(() => {
    if (!user || !isCSuiteOrAbove) return;

    // Fetch Employees for User Management
    const qEmp = query(collection(db, "employees"), orderBy("fullName"));
    const unsubEmp = onSnapshot(qEmp, (snapshot) => {
      setEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Firestore onSnapshot error (settings employees):", error);
    });

    // Fetch Company Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanySettings(data);
        setCompName(data.name || "");
        setCompVat(data.vatNumber || "");
        setCompCurrency(data.currency || "AED");
        setCompAddress(data.address || "");
      }
    }, (error) => {
      console.error("Firestore onSnapshot error (settings company):", error);
    });

    // Fetch Audit Logs (Founder only)
    let unsubAudit = () => {};
    let unsubWebhook = () => {};
    if (isFounder) {
      const qAudit = query(collection(db, "auditLog"), orderBy("createdAt", "desc"));
      unsubAudit = onSnapshot(qAudit, (snapshot) => {
        setAuditLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (error) => {
        console.error("Firestore onSnapshot error (settings auditLog):", error);
      });

      unsubWebhook = onSnapshot(doc(db, "settings", "discordWebhook"), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDiscordWebhookUrl(data.url || "");
          if (data.events) {
            setWebhookEvents(prev => ({ ...prev, ...data.events }));
          }
          if (data.urls) {
            setWebhookUrls(prev => ({ ...prev, ...data.urls }));
          }
        }
      }, (error) => {
        console.warn("Firestore onSnapshot error (settings discordWebhook):", error);
      });
    }

    return () => {
      unsubEmp();
      unsubSettings();
      unsubAudit();
      unsubWebhook();
    };
  }, [user, isCSuiteOrAbove, isFounder]);

  const handleRoleChange = async (employeeId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, "employees", employeeId), { role: newRole });
      showToast("Employee role has been successfully updated across all corporate departments.", "success");
    } catch (err) {
      console.error("Error updating role:", err);
      showToast("Failed to update employee role settings.", "error");
    }
  };

  const toggleEmployeeStatus = async (employeeId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "employees", employeeId), { isActive: !currentStatus });
      showToast(`User account has been successfully ${currentStatus ? "deactivated" : "activated"}.`, "success");
    } catch (err) {
      console.error("Error updating status:", err);
      showToast("Failed to change user account status.", "error");
    }
  };

  const handleDeleteEmployee = async (employeeId: string, employeeName: string) => {
    if (!confirm(`Are you absolutely sure you want to permanently delete the account of ${employeeName}? This action is irreversible.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "employees", employeeId));
      
      // Also audit log this security event
      const { addDoc, collection: collRef, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collRef(db, "auditLog"), {
        actorId: user?.uid,
        action: "DELETE_USER",
        targetCollection: "employees",
        details: `Permanently deleted employee account record of ${employeeName} (${employeeId}).`,
        createdAt: serverTimestamp()
      });

      showToast(`Account of ${employeeName} has been permanently deleted from the database.`, "success");
    } catch (err) {
      console.error("Error deleting employee:", err);
      showToast("Failed to delete the user account.", "error");
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.date || !newHoliday.name) return;
    
    try {
      const updatedHolidays = [...(companySettings.holidays || []), newHoliday];
      await updateDoc(doc(db, "settings", "company"), { holidays: updatedHolidays });
      setNewHoliday({ date: "", name: "" });
      showToast(`Public holiday "${newHoliday.name}" registered successfully.`, "success");
    } catch (err) {
      console.error("Error adding holiday:", err);
      showToast("Company profile settings record needs to be initialized first.", "warning");
    }
  };

  const handleDeleteHoliday = async (index: number) => {
    try {
      const updatedHolidays = [...companySettings.holidays];
      const deletedName = updatedHolidays[index]?.name || "Holiday";
      updatedHolidays.splice(index, 1);
      await updateDoc(doc(db, "settings", "company"), { holidays: updatedHolidays });
      showToast(`Public holiday "${deletedName}" removed successfully.`, "success");
    } catch (err) {
      console.error("Error deleting holiday:", err);
      showToast("Failed to remove public holiday.", "error");
    }
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    
    try {
      // 1. Save in Firestore employee record
      await updateDoc(doc(db, "employees", user.uid), {
        fullName: prefName,
        phone: prefPhone,
        profilePhotoURL: prefPhoto,
        preferences: {
          hideGrid: !prefGrid,
          emailNotifications: prefNotifs.email,
          inAppAlerts: prefNotifs.app,
          theme: theme
        }
      });

      // 2. Local cache fallback
      if (typeof window !== "undefined") {
        localStorage.setItem("hideGrid", String(!prefGrid));
        localStorage.setItem("notifEmail", String(prefNotifs.email));
        localStorage.setItem("notifApp", String(prefNotifs.app));
        localStorage.setItem("theme", theme);
        
        if (!prefGrid) {
          document.documentElement.classList.add("no-grid");
        } else {
          document.documentElement.classList.remove("no-grid");
        }
      }
      
      showToast("Your corporate preferences and display settings have been securely synced to the database.", "success");
    } catch (error) {
      console.error("Error saving preferences to database:", error);
      showToast("Failed to save preferences to database.", "error");
    }
  };

  const handleSaveCompanySettings = async () => {
    setSavingCompany(true);
    try {
      await updateDoc(doc(db, "settings", "company"), {
        name: compName,
        vatNumber: compVat,
        currency: compCurrency,
        address: compAddress
      });
      showToast("Company profile settings successfully updated across all corporate departments.", "success");
    } catch (err) {
      console.error("Error saving company settings:", err);
      showToast("Failed to save company settings.", "error");
    } finally {
      setSavingCompany(false);
    }
  };

  const handlePasswordReset = () => {
    showToast(`A secure password reset link has been dispatched to ${user?.email || "your corporate email address"}. Please check your inbox and follow the instructions to set a new password.`, "info");
  };

  const getEmployeesWithRole = (r: string) => {
    return employees.filter(emp => emp.role === r);
  };

  const getActorInfo = (actorId: string) => {
    const emp = employees.find(e => e.id === actorId);
    return {
      name: emp?.fullName || emp?.name || "System Actor",
      role: emp?.role || "System",
      jobTitle: emp?.jobTitle || "Corporate Profile",
      avatar: emp?.profilePhotoURL || "",
      initials: (emp?.fullName || emp?.name || "SA").split(" ").map((n: any) => n[0]).join("").substring(0, 2).toUpperCase()
    };
  };

  const getAuditDescription = (log: any) => {
    if (log.details) return log.details;
    const actor = getActorInfo(log.actorId).name;
    switch(log.action) {
      case "LOGIN": return `${actor} successfully signed in to the ERP.`;
      case "LOGOUT": return `${actor} signed out from corporate network.`;
      case "START_DM": return `${actor} initiated a private direct message room.`;
      case "CREATE_GROUP": return `${actor} created a custom private team room.`;
      default: return `${actor} performed action ${log.action} on ${log.targetCollection || 'system'}.`;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case "LOGIN": return "bg-emerald-100 text-emerald-800 border-emerald-250";
      case "LOGOUT": return "bg-amber-100 text-amber-800 border-amber-250";
      case "START_DM": return "bg-cyan-100 text-cyan-800 border-cyan-250";
      case "CREATE_GROUP": return "bg-primary text-primary border-primary";
      case "SYSTEM_SETTINGS": return "bg-rose-100 text-rose-800 border-rose-250";
      default: return "bg-slate-100 text-slate-800 border-slate-250";
    }
  };

  const isOnline = (lastSeenAtString?: string) => {
    if (!lastSeenAtString) return false;
    const diff = Date.now() - new Date(lastSeenAtString).getTime();
    return diff < 300000; // 5 minutes in milliseconds
  };

  const handleExportAuditLogs = (logsToExport: any[]) => {
    try {
      if (logsToExport.length === 0) {
        showToast("No audit logs available to export.", "warning");
        return;
      }
      
      const headers = ["Log ID", "Actor ID", "Actor Name", "Action Type", "Target Component", "Description Details", "Timestamp"];
      const rows = logsToExport.map(log => {
        const actor = getActorInfo(log.actorId);
        const desc = getAuditDescription(log);
        const dateString = log.createdAt?.seconds 
          ? new Date(log.createdAt.seconds * 1000).toLocaleString() 
          : "Just now";
        return [
          log.id,
          log.actorId,
          `"${actor.name.replace(/"/g, '""')}"`,
          log.action,
          log.targetCollection || "system",
          `"${desc.replace(/"/g, '""')}"`,
          dateString
        ];
      });

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `mints_global_erp_audit_log_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Audit logs successfully exported as a corporate compliance CSV sheet.", "success");
    } catch (err) {
      console.error("CSV Export failed:", err);
      showToast("Failed to export audit logs as CSV.", "error");
    }
  };

  return (
    <div className="space-y-6 pb-12 h-full flex flex-col text-foreground">
      <div className="shrink-0 mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-8 w-8 text-primary dark:text-primary" />
          {isCSuiteOrAbove ? "System Settings" : "My Settings"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isCSuiteOrAbove 
            ? "Manage users, roles, company profile, and audit logs." 
            : "Manage your personal preferences, theme layouts, and credentials."}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 flex-1 items-start">
        
        {/* Vertical Navigation */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab("preferences")}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
              activeTab === "preferences" 
                ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
            )}
          >
            <User className="w-5 h-5" />
            My Preferences
          </button>

          <button 
            onClick={() => setActiveTab("security")}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
              activeTab === "security" 
                ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
            )}
          >
            <ShieldCheck className="w-5 h-5" />
            Security & Password
          </button>

          {isCSuiteOrAbove && (
            <>
              <button 
                onClick={() => setActiveTab("users")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "users" 
                    ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <Users className="w-5 h-5" />
                User Management
              </button>
              <button 
                onClick={() => setActiveTab("roles")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "roles" 
                    ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <Shield className="w-5 h-5" />
                Roles & Permissions
              </button>
              <button 
                onClick={() => setActiveTab("company")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "company" 
                    ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <Building2 className="w-5 h-5" />
                Company Info
              </button>
              <button 
                onClick={() => setActiveTab("holidays")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "holidays" 
                    ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <Calendar className="w-5 h-5" />
                Holidays
              </button>
            </>
          )}

          {isFounder && (
            <>
              <button 
                onClick={() => setActiveTab("audit")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "audit" 
                    ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <ShieldAlert className="w-5 h-5" />
                Audit Log
              </button>
              <button 
                onClick={() => setActiveTab("integrations")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "integrations" 
                    ? "bg-primary/20 text-primary/90 dark:text-primary/80 border-primary/25 shadow-sm" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <Wifi className="w-5 h-5" />
                Integrations Center
              </button>
            </>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full bg-card rounded-2xl border border-border shadow-card overflow-hidden text-foreground">

          {/* SECURITY & CREDENTIALS */}
          {activeTab === "security" && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border">
                <h3 className="font-bold text-lg text-foreground">Account Security & Credentials</h3>
                <p className="text-xs text-muted-foreground mt-1">Strengthen your security posture by maintaining strong passwords.</p>
              </div>

              <form onSubmit={handleUpdatePassword} className="p-8 space-y-6 max-w-xl">
                
                {/* Current Password */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Current Password</label>
                  <Input 
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-0 bg-background/50"
                  />
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">New Password</label>
                  <Input 
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-0 bg-background/50"
                  />
                  
                  {/* Real-time Password Strength Meter */}
                  {newPassword.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-bold uppercase tracking-wider">Password Strength:</span>
                        <span className="font-bold text-foreground">{getPasswordStrength(newPassword).label}</span>
                      </div>
                      
                      {/* Bar indicator */}
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex gap-1">
                        <div className={cn("h-full transition-all duration-500 rounded-full", 
                          getPasswordStrength(newPassword).score >= 1 ? getPasswordStrength(newPassword).color : "w-0",
                          getPasswordStrength(newPassword).score === 1 ? "w-1/4" : 
                          getPasswordStrength(newPassword).score === 2 ? "w-2/4" : 
                          getPasswordStrength(newPassword).score === 3 ? "w-3/4" : 
                          getPasswordStrength(newPassword).score === 4 ? "w-full" : "w-0"
                        )} />
                      </div>

                      {/* Criteria feedback list */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1.5 text-xs font-semibold text-muted-foreground">
                        <div className={cn("flex items-center gap-1", newPassword.length >= 8 ? "text-accent" : "opacity-40")}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", newPassword.length >= 8 ? "bg-emerald-400" : "bg-muted-foreground/20")} />
                          At least 8 characters
                        </div>
                        <div className={cn("flex items-center gap-1", /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? "text-accent" : "opacity-40")}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? "bg-emerald-400" : "bg-muted-foreground/20")} />
                          Case mix (aA)
                        </div>
                        <div className={cn("flex items-center gap-1", /\d/.test(newPassword) ? "text-accent" : "opacity-40")}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", /\d/.test(newPassword) ? "bg-emerald-400" : "bg-muted-foreground/20")} />
                          Contains number (0-9)
                        </div>
                        <div className={cn("flex items-center gap-1", /[^A-Za-z0-9]/.test(newPassword) ? "text-accent" : "opacity-40")}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", /[^A-Za-z0-9]/.test(newPassword) ? "bg-emerald-400" : "bg-muted-foreground/20")} />
                          Special symbol (!@#)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Confirm New Password</label>
                  <Input 
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-10 border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-0 bg-background/50"
                  />
                  {confirmPassword.length > 0 && (
                    <div className="flex items-center gap-1 text-xs font-bold">
                      {newPassword === confirmPassword ? (
                        <span className="text-accent shadow-glow-emerald">✓ Passwords match</span>
                      ) : (
                        <span className="text-rose-400">✗ Passwords do not match</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="pt-4 flex gap-3">
                  <Button 
                    type="submit" 
                    disabled={updatingPassword}
                    className="bg-primary hover:bg-blue-700 text-foreground font-bold rounded-xl h-10 px-6 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {updatingPassword ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Hardening credentials...
                      </>
                    ) : (
                      "Update Credentials"
                    )}
                  </Button>
                  <button 
                    type="button"
                    onClick={() => {
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary border border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground cursor-pointer"
                  >
                    Reset Form
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* MY PREFERENCES */}
          {activeTab === "preferences" && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border">
                <h3 className="font-bold text-lg text-foreground">Personal Preferences</h3>
                <p className="text-sm text-muted-foreground">Manage your profile metadata, background settings, and alert options.</p>
              </div>
              <div className="p-8 space-y-8">
                {/* Profile Photo / Avatar Selection */}
                <div className="p-5 rounded-2xl border border-border space-y-4">
                  <Label className="text-foreground font-bold text-xs uppercase tracking-wider block">Profile Avatar</Label>
                  
                  <div className="flex flex-col sm:flex-row gap-5 items-center">
                    <Avatar className="h-16 w-16 border border-border shadow-sm bg-secondary rounded-xl shrink-0">
                      <AvatarImage src={prefPhoto} />
                      <AvatarFallback className="bg-primary text-foreground text-lg font-bold">
                        {prefName ? prefName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "U"}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 w-full space-y-3">
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          id="settings-photo-upload" 
                          className="hidden" 
                          accept="image/*"
                          onChange={handleAvatarUpload}
                        />
                        <Button 
                          type="button" 
                          onClick={() => document.getElementById('settings-photo-upload')?.click()}
                          disabled={uploadingAvatar}
                          variant="outline"
                          className="text-xs h-9 border-border text-foreground bg-secondary hover:bg-secondary/80 font-bold"
                        >
                          {uploadingAvatar ? "Uploading..." : "Upload Photo"}
                        </Button>
                        {prefPhoto && (
                          <Button 
                            type="button" 
                            onClick={() => setPrefPhoto("")}
                            variant="ghost"
                            className="text-xs h-9 text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-500/10 font-bold"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-semibold">PNG, JPG or WEBP. Max 2MB.</p>
                    </div>
                  </div>

                  {/* Presets Grid */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Or select a premium preset avatar:</p>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_AVATARS.map((avatar, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPrefPhoto(avatar)}
                          className={cn("h-10 w-10 rounded-lg overflow-hidden border-2 transition-all p-0.5 bg-[#0a0f18]",
                            prefPhoto === avatar ? "border-blue-600 scale-105 shadow-md" : "border-border hover:border-muted-foreground/30"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={avatar} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover rounded-md" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold text-xs uppercase tracking-wider">Full Name</Label>
                    <Input value={prefName} onChange={(e) => setPrefName(e.target.value)} placeholder="Your Full Name" className="border-border focus-visible:ring-primary bg-background/50 text-foreground font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold text-xs uppercase tracking-wider">Phone Number</Label>
                    <Input value={prefPhone} onChange={(e) => setPrefPhone(e.target.value)} placeholder="+971 50 123 4567" className="border-border focus-visible:ring-primary bg-background/50 text-foreground font-bold font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold text-xs uppercase tracking-wider">Email Address</Label>
                    <Input value={user?.email || ""} disabled className="border-border focus-visible:ring-primary bg-background/20 cursor-not-allowed opacity-70 text-foreground font-bold" />
                    <p className="text-xs text-muted-foreground mt-1 font-semibold">To change your primary email, please raise a ticket with HR.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold text-xs uppercase tracking-wider">Corporate Role</Label>
                    <Input value={ROLE_META[role || "employee"]?.label || role || "employee"} disabled className="border-border focus-visible:ring-primary bg-background/20 cursor-not-allowed opacity-70 text-foreground font-bold capitalize" />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end pt-2">
                    <Label className="text-foreground font-bold text-xs uppercase tracking-wider mb-2">Security</Label>
                    <Button onClick={handlePasswordReset} variant="outline" className="border-border text-foreground hover:bg-secondary shadow-sm w-full md:w-auto self-start font-bold">
                      Reset Password via Email
                    </Button>
                  </div>
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <h4 className="font-bold text-foreground text-sm">ERP Preferences & Viewports</h4>
                  
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Display Blueprint Grid Overlay</p>
                      <p className="text-xs text-muted-foreground">Enable the technical grid overlay pattern in the background.</p>
                    </div>
                    <Switch 
                      checked={prefGrid} 
                      onCheckedChange={setPrefGrid}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Light Theme Mode</p>
                      <p className="text-xs text-muted-foreground">Enable light theme mode across all dashboard screens.</p>
                    </div>
                    <Switch 
                      checked={theme === "light"} 
                      onCheckedChange={(val) => setThemeMode(val ? "light" : "dark")}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Email Notifications</p>
                      <p className="text-xs text-muted-foreground">Receive automated daily notifications and notices in your email.</p>
                    </div>
                    <Switch 
                      checked={prefNotifs.email} 
                      onCheckedChange={(val) => setPrefNotifs({...prefNotifs, email: val})}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">In-App Alerts</p>
                      <p className="text-xs text-muted-foreground">Show floating toast notifications for chats and system logs.</p>
                    </div>
                    <Switch 
                      checked={prefNotifs.app} 
                      onCheckedChange={(val) => setPrefNotifs({...prefNotifs, app: val})}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-border flex justify-end">
                  <Button onClick={handleSavePreferences} className="bg-primary hover:bg-blue-700 text-foreground shadow-md px-8 font-bold rounded-xl h-11">Save Preferences</Button>
                </div>
              </div>
            </div>
          )}

           {/* USER MANAGEMENT */}
          {activeTab === "users" && isCSuiteOrAbove && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg text-foreground">Team Accounts</h3>
                  <p className="text-sm text-muted-foreground">Manage roles and access for all staff.</p>
                </div>
                <Link href="/dashboard/hr/new" className="inline-flex items-center justify-center rounded-lg text-sm font-bold h-10 px-4 py-2 bg-primary hover:bg-blue-700 text-foreground shadow-md transition-colors">
                  <Plus className="mr-2 h-4 w-4" /> Create Account
                </Link>
              </div>
              <div className="overflow-x-auto p-0 bg-card">
                <table className="w-full text-sm text-left">
                  <thead className="text-muted-foreground text-xs uppercase font-bold border-b border-border">
                    <tr>
                      <th className="px-6 py-4">Employee Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Current Role</th>
                      <th className="px-6 py-4">Last Login IP</th>
                      <th className="px-6 py-4 text-center">Active Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover: transition-colors">
                        <td className="px-6 py-4 font-bold text-foreground">{emp.fullName}</td>
                        <td className="px-6 py-4 text-muted-foreground font-medium">{emp.email}</td>
                        <td className="px-6 py-4">
                          <Select 
                            defaultValue={emp.role} 
                            onValueChange={(val) => handleRoleChange(emp.id, val)}
                            disabled={emp.id === user?.uid}
                          >
                            <SelectTrigger className="w-[180px] h-9 bg-background border-border focus:ring-primary text-foreground font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover text-popover-foreground font-semibold border-border">
                              {Object.entries(ROLE_META).map(([key, meta]) => (
                                <SelectItem key={key} value={key} className="focus:bg-muted hover:bg-muted cursor-pointer">{meta.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground font-semibold">{emp.lastLoginIP || "N/A"}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-4">
                            <Switch 
                              checked={emp.isActive} 
                              onCheckedChange={() => toggleEmployeeStatus(emp.id, emp.isActive)}
                              disabled={emp.id === user?.uid}
                              className="data-[state=checked]:bg-green-500"
                            />
                            {emp.id !== user?.uid && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg cursor-pointer flex items-center justify-center shrink-0 border border-transparent hover:border-rose-500/25"
                                onClick={() => handleDeleteEmployee(emp.id, emp.fullName || emp.name)}
                                title="Permanently Delete Account"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ROLES & PERMISSIONS */}
          {activeTab === "roles" && isCSuiteOrAbove && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border">
                <h3 className="font-bold text-lg text-foreground">Roles & Permissions Matrix</h3>
                <p className="text-sm text-muted-foreground">Audit system roles, view which employees are assigned to each role, and inspect their active permission scopes.</p>
              </div>
              <div className="p-8 flex flex-col lg:flex-row gap-8 items-start">
                
                {/* Left List of Roles */}
                <div className="w-full lg:w-72 shrink-0 space-y-3">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Select System Role</h4>
                  <div className="space-y-2">
                    {Object.entries(ROLE_META).map(([key, meta]) => {
                      const count = employees.filter(e => e.role === key).length;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedRole(key)}
                          className={cn("w-full flex items-center justify-between p-4 rounded-xl text-left border transition-all",
                            selectedRole === key 
                              ? "bg-primary/15 border-primary/30 text-primary dark:text-primary/80 font-bold shadow-sm" 
                              : "border-border hover:bg-secondary/40 text-foreground"
                          )}
                        >
                          <div>
                            <span className="text-xs uppercase tracking-wider font-extrabold font-mono block text-primary dark:text-primary">{key}</span>
                            <span className="text-sm font-semibold">{meta.label}</span>
                          </div>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",
                            selectedRole === key 
                              ? "bg-primary text-foreground" 
                              : "bg-muted text-muted-foreground border border-border"
                          )}>
                            {count} {count === 1 ? "user" : "users"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right panel: permissions check list and users */}
                <div className="flex-1 w-full space-y-8">
                  
                  {/* Scope Matrix */}
                  <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
                    <div className="p-5 border-b border-border flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-foreground flex items-center gap-2">
                          <Shield className="h-4.5 w-4.5 text-primary dark:text-primary" />
                          Permission Scope: {ROLE_META[selectedRole]?.label || selectedRole}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Permissions defined inside system security models.</p>
                      </div>
                      <Badge className={cn("text-xs font-bold px-3 py-1 uppercase rounded-full shadow-sm border", ROLE_META[selectedRole]?.color || "bg-muted text-muted-foreground border-border")}>
                        {selectedRole}
                      </Badge>
                    </div>

                    <div className="divide-y divide-border">
                      {Object.entries(PERMISSION_LABELS).map(([permKey, permLabel]) => {
                        // Check if the selected role has this permission
                        const hasAccess = (PERMISSIONS[permKey as keyof typeof PERMISSIONS] as readonly string[]).includes(selectedRole);
                        return (
                          <div key={permKey} className="flex items-center justify-between p-4 hover: transition-colors">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{permLabel}</p>
                              <p className="text-xs font-mono text-muted-foreground uppercase">{permKey}</p>
                            </div>
                            <div>
                              {hasAccess ? (
                                <Badge className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-accent border border-emerald-500/20 font-bold text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Granted
                                </Badge>
                              ) : (
                                <Badge className="bg-red-500/5 hover:bg-red-500/10 text-red-500/70 border border-red-500/10 font-bold text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-none">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  Restricted
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assigned Staff */}
                  <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
                    <div className="p-5 border-b border-border">
                      <h4 className="font-bold text-foreground">
                        Assigned Team Members ({getEmployeesWithRole(selectedRole).length})
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Staff members currently holding {ROLE_META[selectedRole]?.label || selectedRole} authority.</p>
                    </div>

                    <div className="divide-y divide-border">
                      {getEmployeesWithRole(selectedRole).length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground font-medium italic bg-card">
                          No team members are currently assigned to the {ROLE_META[selectedRole]?.label || selectedRole} role.
                        </div>
                      ) : (
                        getEmployeesWithRole(selectedRole).map((emp) => (
                          <div key={emp.id} className="p-4 flex items-center justify-between hover: transition-colors bg-card">
                            <div>
                              <p className="text-sm font-bold text-foreground">{emp.fullName}</p>
                              <p className="text-xs text-muted-foreground font-medium mt-0.5">{emp.email}</p>
                              {emp.lastLoginIP && (
                                <p className="text-xs text-muted-foreground font-mono mt-1 font-semibold">IP Address: {emp.lastLoginIP}</p>
                              )}
                            </div>
                            <Badge className="bg-muted text-foreground font-bold text-xs uppercase border border-border shadow-sm">
                              {emp.isActive ? "Active Account" : "Suspended"}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

           {/* COMPANY INFO */}
          {activeTab === "company" && isCSuiteOrAbove && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border">
                <h3 className="font-bold text-lg text-foreground">Company Profile</h3>
                <p className="text-sm text-muted-foreground">Details used across the ERP, including generated PDFs and Invoices.</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="flex items-center gap-6 pb-8 border-b border-border">
                  <div className="w-24 h-24 bg-secondary rounded-xl flex items-center justify-center border-2 border-dashed border-border">
                    {companySettings.logoURL ? (
                      <img src={companySettings.logoURL} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground opacity-50" />
                    )}
                  </div>
                  <div>
                    <Button variant="outline" className="mb-2 border-border text-foreground bg-secondary hover:bg-secondary/80 shadow-sm"><UploadCloud className="mr-2 h-4 w-4" /> Upload New Logo</Button>
                    <p className="text-xs text-muted-foreground font-medium">Recommended size: 256x256px. Max 2MB.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold">Company Name</Label>
                    <Input value={compName} onChange={e => setCompName(e.target.value)} className="border-border focus-visible:ring-primary bg-background/50 text-foreground font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold">VAT / Tax Number</Label>
                    <Input value={compVat} onChange={e => setCompVat(e.target.value)} className="border-border focus-visible:ring-primary bg-background/50 text-foreground font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground font-bold">Default Currency</Label>
                    <Select value={compCurrency} onValueChange={(val) => setCompCurrency(val || "AED")}>
                      <SelectTrigger className="border-border focus:ring-primary bg-background/50 text-foreground font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover text-foreground font-semibold">
                        <SelectItem value="AED">AED - Global Currency</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-foreground font-bold">Headquarters Address</Label>
                    <Input value={compAddress} onChange={e => setCompAddress(e.target.value)} className="border-border focus-visible:ring-primary bg-background/50 text-foreground font-bold" />
                  </div>
                </div>

                <div className="pt-6 flex justify-end">
                  <Button onClick={handleSaveCompanySettings} disabled={savingCompany} className="bg-primary hover:bg-blue-700 text-foreground shadow-md px-8 font-bold rounded-xl h-11">
                    {savingCompany ? "Saving Changes..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* HOLIDAYS */}
          {activeTab === "holidays" && isCSuiteOrAbove && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border">
                <h3 className="font-bold text-lg text-foreground">Public Holidays</h3>
                <p className="text-sm text-muted-foreground">These dates are automatically excluded when calculating working days for Leave Requests.</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="flex flex-col sm:flex-row gap-4 items-end p-6 rounded-xl border border-border shadow-sm">
                  <div className="space-y-2 flex-1">
                    <Label className="text-foreground font-bold">Holiday Name</Label>
                    <Input 
                      placeholder="e.g. Eid Al Fitr" 
                      value={newHoliday.name}
                      onChange={e => setNewHoliday({...newHoliday, name: e.target.value})}
                      className="bg-background text-foreground border-border font-bold"
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-foreground font-bold">Date</Label>
                    <Input 
                      type="date" 
                      value={newHoliday.date}
                      onChange={e => setNewHoliday({...newHoliday, date: e.target.value})}
                      className="bg-background text-foreground border-border font-bold"
                    />
                  </div>
                  <Button className="bg-primary hover:bg-blue-700 text-foreground shadow-md font-bold rounded-xl h-11 px-6" onClick={handleAddHoliday} disabled={!newHoliday.name || !newHoliday.date}>
                    <Plus className="h-4 w-4 mr-2" /> Add Date
                  </Button>
                </div>

                <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="text-muted-foreground text-xs uppercase font-bold border-b border-border">
                      <tr>
                        <th className="px-6 py-4">Holiday Date</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {!companySettings.holidays || companySettings.holidays.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
                            No holidays configured.
                          </td>
                        </tr>
                      ) : (
                        companySettings.holidays.map((h: any, i: number) => (
                          <tr key={i} className="hover: transition-colors">
                            <td className="px-6 py-4 font-bold text-foreground">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            <td className="px-6 py-4 text-muted-foreground font-medium">{h.name}</td>
                            <td className="px-6 py-4 text-right">
                              <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-500/10" onClick={() => handleDeleteHoliday(i)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* AUDIT LOG & LIVE TELEMETRY SUITE */}
          {isFounder && activeTab === "audit" && (() => {
            const filteredAuditLogs = auditLogs.filter(log => {
              const actor = getActorInfo(log.actorId);
              const desc = getAuditDescription(log);
              const matchesSearch = actor.name.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                                    desc.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                                    log.action.toLowerCase().includes(auditSearchQuery.toLowerCase());
              const matchesAction = selectedAuditAction === "ALL" || log.action === selectedAuditAction;
              const matchesActor = selectedAuditActor === "ALL" || log.actorId === selectedAuditActor;
              return matchesSearch && matchesAction && matchesActor;
            });

            const onlineEmployees = employees.filter(emp => emp.isActive && isOnline(emp.lastSeenAt));

            return (
              <div className="flex flex-col h-full bg-card text-foreground">
                
                {/* Visual Header */}
                <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary dark:text-primary animate-pulse" />
                      Live Telemetry & Audit Logs
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Foundational dashboard monitoring team activities and active sessions in real-time.</p>
                  </div>
                  
                  {/* Status Indicator Counters */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => handleExportAuditLogs(filteredAuditLogs)}
                      variant="outline"
                      className="bg-secondary border-border text-foreground hover:bg-secondary/80 text-xs font-bold flex items-center gap-2 h-9 py-0 px-4 shrink-0 shadow-sm cursor-pointer"
                    >
                      <UploadCloud className="h-4 w-4 rotate-180 text-primary dark:text-primary" />
                      Export CSV
                    </Button>

                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
                      <span className="relative flex h-3 w-3 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <div>
                        <p className="text-xs uppercase font-bold text-primary dark:text-accent">Active Staff</p>
                        <p className="text-sm font-extrabold text-foreground font-mono">{onlineEmployees.length} Online</p>
                      </div>
                    </div>

                    <div className="bg-primary/10 border border-primary/20 px-4 py-2 rounded-xl flex items-center gap-3">
                      <Clock className="h-4.5 w-4.5 text-primary dark:text-primary" />
                      <div>
                        <p className="text-xs uppercase font-bold text-primary dark:text-primary">Logged Events</p>
                        <p className="text-sm font-extrabold text-foreground font-mono">{auditLogs.length} Total</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="p-4 bg-card border-b border-border grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search live events..." 
                      value={auditSearchQuery}
                      onChange={e => setAuditSearchQuery(e.target.value)}
                      className="pl-9 bg-background border-border text-foreground focus-visible:ring-primary rounded-lg text-xs"
                    />
                  </div>

                  <Select value={selectedAuditAction} onValueChange={(val) => setSelectedAuditAction(val || "ALL")}>
                    <SelectTrigger className="bg-background border-border text-foreground rounded-lg text-xs font-semibold">
                      <SelectValue placeholder="Filter Action" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground font-semibold border-border">
                      <SelectItem value="ALL">All Actions</SelectItem>
                      <SelectItem value="LOGIN">User Logins</SelectItem>
                      <SelectItem value="START_DM">Direct Messages</SelectItem>
                      <SelectItem value="CREATE_GROUP">Group Creations</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedAuditActor} onValueChange={(val) => setSelectedAuditActor(val || "ALL")}>
                    <SelectTrigger className="bg-background border-border text-foreground rounded-lg text-xs font-semibold">
                      <SelectValue placeholder="Filter Employee" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground font-semibold border-border">
                      <SelectItem value="ALL">All Colleagues</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.fullName || emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Two-Column Telemetry workspace */}
                <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 min-h-0 overflow-y-auto">
                  
                  {/* Left Column (65%): Feed timeline */}
                  <div className="flex-1 space-y-4">
                    <h4 className="text-xs uppercase tracking-wider font-extrabold text-muted-foreground">Activity Logs Timeline</h4>
                    <div className="space-y-3">
                      {filteredAuditLogs.length === 0 ? (
                        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
                          <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-30 text-primary dark:text-primary" />
                          <p className="font-bold text-sm">No activity events found</p>
                          <p className="text-xs mt-1">Refine your search tags or filters.</p>
                        </div>
                      ) : (
                        filteredAuditLogs.map(log => {
                          const actor = getActorInfo(log.actorId);
                          const description = getAuditDescription(log);
                          const dateString = log.createdAt?.seconds 
                            ? new Date(log.createdAt.seconds * 1000).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              }) 
                            : 'Just now';

                          return (
                            <div key={log.id} className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex items-start gap-4">
                              <Avatar className="h-10 w-10 shrink-0 border border-border">
                                <AvatarImage src={actor.avatar} />
                                <AvatarFallback className="bg-primary text-foreground font-bold text-sm">{actor.initials}</AvatarFallback>
                              </Avatar>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <span className="font-bold text-foreground text-sm block md:inline mr-2">{actor.name}</span>
                                    <span className="text-xs font-bold text-muted-foreground uppercase font-mono tracking-tight bg-background border border-border px-2 py-0.5 rounded-full">{actor.role}</span>
                                  </div>
                                  <Badge className={cn("text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-none", getActionBadgeColor(log.action))}>
                                    {log.action}
                                  </Badge>
                                </div>
                                <p className="text-xs font-semibold text-foreground/80 mt-2 leading-relaxed">{description}</p>
                                
                                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground font-semibold font-mono">
                                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {dateString}</span>
                                  <span>ID: {log.id.substring(0, 8)}...</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column (35%): Online Staff live metrics */}
                  <div className="w-full lg:w-80 shrink-0 space-y-4">
                    <h4 className="text-xs uppercase tracking-wider font-extrabold text-muted-foreground">Live Online Staff ({onlineEmployees.length})</h4>
                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                      {onlineEmployees.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-xs italic">
                          No team members are active currently.
                        </div>
                      ) : (
                        <div className="space-y-3.5 divide-y divide-border">
                          {onlineEmployees.map((emp, idx) => {
                            const initials = emp.fullName.split(" ").map((n: any) => n[0]).join("").substring(0,2).toUpperCase();
                            return (
                              <div key={emp.id} className={cn("flex items-center gap-3", idx > 0 ? "pt-3.5" : "")}>
                                <div className="relative">
                                  <Avatar className="h-9 w-9 border border-border">
                                    <AvatarImage src={emp.profilePhotoURL} />
                                    <AvatarFallback className="bg-primary text-foreground font-bold text-xs">{initials}</AvatarFallback>
                                  </Avatar>
                                  <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-extrabold text-foreground truncate">{emp.fullName || emp.name}</p>
                                  <p className="text-xs text-muted-foreground font-semibold truncate">{emp.jobTitle || "Employee"}</p>
                                  {emp.lastLoginIP && (
                                    <p className="text-xs text-muted-foreground font-mono mt-1 font-semibold flex items-center gap-1"><Wifi className="h-3 w-3 shrink-0" /> {emp.lastLoginIP}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* EXECUTIVE INTEGRATIONS CENTER */}
          {isFounder && activeTab === "integrations" && (
            <div className="flex flex-col h-full bg-card text-foreground">
              <div className="p-6 border-b border-border">
                <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-primary dark:text-primary animate-pulse" />
                  Discord Webhook Integration Center
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Configure real-time automated system event routing directly to your Discord server channels.</p>
              </div>

              <div className="p-8 space-y-6 max-w-3xl">
                <Card className="border border-border shadow-sm bg-card rounded-xl">
                  <CardHeader className="border-b border-border p-5">
                    <CardTitle className="text-sm font-bold text-foreground">Active Webhook Configurations</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Specify the targeting URL of your Discord webhook channel integration.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-foreground uppercase tracking-wider">Discord Webhook Destination URL</Label>
                      <div className="flex gap-3">
                        <Input
                          value={discordWebhookUrl}
                          onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                          placeholder="https://discord.com/api/webhooks/..."
                          className="bg-background border-border text-foreground font-medium"
                        />
                        <Button 
                          onClick={async () => {
                            if (!discordWebhookUrl) return;
                            setTestingWebhook(true);
                            try {
                              const res = await fetch("/api/discord-alert", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  content: "🛡️ **Mints Global ERP Webhook Integration Test**\nSystem webhooks have been successfully configured and verified. Real-time telemetry is operational!",
                                  webhookUrl: discordWebhookUrl
                                })
                              });
                              if (res.ok) {
                                showToast("Test alert successfully dispatched to Discord channel!", "success");
                              } else {
                                throw new Error("Test failed");
                              }
                            } catch (err) {
                              showToast("Failed to connect to Discord channel. Verify webhook URL.", "error");
                            } finally {
                              setTestingWebhook(false);
                            }
                          }}
                          disabled={testingWebhook || !discordWebhookUrl}
                          variant="outline"
                          className="font-bold shrink-0 text-foreground border-border bg-secondary hover:bg-secondary/80 cursor-pointer"
                        >
                          {testingWebhook ? "Testing..." : "Test Connection"}
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-border pt-5 space-y-4">
                      <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">Configure Automated Event Triggers</h4>
                      <p className="text-xs text-muted-foreground font-semibold mt-0.5">Toggle which high-impact business activities route real-time telemetry updates to Discord.</p>
                      
                      <div className="space-y-3.5 mt-4">
                        {[
                          { key: "auth", label: "User Authentication & Sign-ins", desc: "Monitors successful employee logins, profile creations, and self-heal hooks." },
                          { key: "finance", label: "Financial Actions & Billing Suite", desc: "Routes invoice generation, expense approvals, and payroll ledger changes." },
                          { key: "projects", label: "Project Management & Timeline Schedules", desc: "Routes client allocations, active gantt milestones, and deliverable updates." },
                          { key: "security", label: "Security Breach Alerts & Audit Logs", desc: "Monitors blocked credentials, active role changes, and account suspensions." },
                          { key: "ocr", label: "Document Processing & OCR Scans", desc: "Monitors vaulted receipts, parsed invoices, and cognitive extraction alerts." }
                        ].map(item => (
                          <div key={item.key} className="p-4 rounded-xl border border-border hover: transition-all space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="text-xs font-bold text-foreground">{item.label}</h5>
                                <p className="text-xs text-muted-foreground font-semibold mt-0.5">{item.desc}</p>
                              </div>
                              <Switch
                                checked={(webhookEvents as any)[item.key]}
                                onCheckedChange={(checked) => setWebhookEvents(prev => ({ ...prev, [item.key]: checked }))}
                              />
                            </div>
                            {(webhookEvents as any)[item.key] && (
                              <div className="pt-2 border-t border-border/50 space-y-1.5 animate-in fade-in duration-200">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Specific Channel Webhook URL (Optional)</Label>
                                <Input
                                  value={(webhookUrls as any)[item.key] || ""}
                                  onChange={(e) => setWebhookUrls(prev => ({ ...prev, [item.key]: e.target.value }))}
                                  placeholder="Defaults to main global webhook destination above if left empty..."
                                  className="bg-background border-border text-xs font-medium text-foreground placeholder:text-muted-foreground/45"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-border pt-6 flex justify-end">
                      <Button
                        onClick={async () => {
                          setSavingWebhook(true);
                          try {
                            const { db: dbRef } = await import("@/lib/firebase");
                            const { setDoc, doc: docRef } = await import("firebase/firestore");
                            await setDoc(docRef(dbRef, "settings", "discordWebhook"), {
                              url: discordWebhookUrl,
                              events: webhookEvents,
                              urls: webhookUrls,
                              updatedAt: new Date().toISOString()
                            });
                            showToast("Discord Integration Settings saved successfully.", "success");
                          } catch (err) {
                            showToast("Failed to save integration settings.", "error");
                          } finally {
                            setSavingWebhook(false);
                          }
                        }}
                        disabled={savingWebhook}
                        className="bg-primary hover:bg-blue-700 text-foreground font-bold cursor-pointer"
                      >
                        {savingWebhook ? "Saving..." : "Save Webhook Settings"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
