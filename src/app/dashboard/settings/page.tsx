"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess, ROLE_META, PERMISSIONS } from "@/lib/permissions";
import { useToast } from "@/context/ToastContext";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Settings, Users, Building2, Calendar, ShieldAlert, UploadCloud, Plus, Trash2, User, Shield } from "lucide-react";
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

export default function SettingsDashboard() {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"preferences" | "users" | "roles" | "company" | "holidays" | "audit">("preferences");
  const [selectedRole, setSelectedRole] = useState<string>("employee");
  
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
  const [prefGrid, setPrefGrid] = useState(true);
  const [prefNotifs, setPrefNotifs] = useState({ email: true, app: true });

  const isFounder = role === "founder";
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
        if (data.preferences) {
          const prefs = data.preferences;
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
    if (isFounder) {
      const qAudit = query(collection(db, "auditLog"), orderBy("createdAt", "desc"));
      unsubAudit = onSnapshot(qAudit, (snapshot) => {
        setAuditLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (error) => {
        console.error("Firestore onSnapshot error (settings auditLog):", error);
      });
    }

    return () => {
      unsubEmp();
      unsubSettings();
      unsubAudit();
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
        preferences: {
          hideGrid: !prefGrid,
          emailNotifications: prefNotifs.email,
          inAppAlerts: prefNotifs.app
        }
      });

      // 2. Local cache fallback
      if (typeof window !== "undefined") {
        localStorage.setItem("hideGrid", String(!prefGrid));
        localStorage.setItem("notifEmail", String(prefNotifs.email));
        localStorage.setItem("notifApp", String(prefNotifs.app));
        
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

  return (
    <div className="space-y-6 pb-12 h-full flex flex-col">
      <div className="shrink-0 mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="h-8 w-8 text-blue-400" />
          {isCSuiteOrAbove ? "System Settings" : "My Settings"}
        </h1>
        <p className="text-white/40 mt-1">
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
                ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm" 
                : "text-white/40 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
            )}
          >
            <User className="w-5 h-5" />
            My Preferences
          </button>

          {isCSuiteOrAbove && (
            <>
              <button 
                onClick={() => setActiveTab("users")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "users" 
                    ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm" 
                    : "text-white/40 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
                )}
              >
                <Users className="w-5 h-5" />
                User Management
              </button>
              <button 
                onClick={() => setActiveTab("roles")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "roles" 
                    ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm" 
                    : "text-white/40 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
                )}
              >
                <Shield className="w-5 h-5" />
                Roles & Permissions
              </button>
              <button 
                onClick={() => setActiveTab("company")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "company" 
                    ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm" 
                    : "text-white/40 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
                )}
              >
                <Building2 className="w-5 h-5" />
                Company Info
              </button>
              <button 
                onClick={() => setActiveTab("holidays")}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                  activeTab === "holidays" 
                    ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm" 
                    : "text-white/40 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
                )}
              >
                <Calendar className="w-5 h-5" />
                Holidays
              </button>
            </>
          )}

          {isFounder && (
            <button 
              onClick={() => setActiveTab("audit")}
              className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left border", 
                activeTab === "audit" 
                  ? "bg-blue-600/20 text-blue-300 border-blue-500/25 shadow-sm" 
                  : "text-white/40 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
              )}
            >
              <ShieldAlert className="w-5 h-5" />
              Audit Log
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full bg-white rounded-2xl border border-white/[0.08] shadow-card overflow-hidden">
          
          {/* MY PREFERENCES */}
          {activeTab === "preferences" && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-olive-100 bg-olive-50/50">
                <h3 className="font-bold text-lg text-olive-900">Personal Preferences</h3>
                <p className="text-sm text-olive-600">Manage your profile metadata, background settings, and alert options.</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-olive-900 font-bold text-xs uppercase tracking-wider text-olive-800">Full Name</Label>
                    <Input value={prefName} onChange={(e) => setPrefName(e.target.value)} placeholder="Your Full Name" className="border-olive-200 focus-visible:ring-olive-500 bg-olive-50/30 text-olive-950 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-olive-900 font-bold text-xs uppercase tracking-wider text-olive-800">Email Address</Label>
                    <Input value={user?.email || ""} disabled className="border-olive-200 focus-visible:ring-olive-500 bg-olive-50/10 cursor-not-allowed opacity-70 text-olive-950 font-bold" />
                    <p className="text-[10px] text-olive-500 mt-1 font-semibold">To change your primary email, please raise a ticket with HR.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-olive-900 font-bold text-xs uppercase tracking-wider text-olive-800">Corporate Role</Label>
                    <Input value={ROLE_META[role || "employee"]?.label || role || "employee"} disabled className="border-olive-200 focus-visible:ring-olive-500 bg-olive-50/10 cursor-not-allowed opacity-70 text-olive-950 font-bold capitalize" />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end pt-2">
                    <Label className="text-olive-900 font-bold text-xs uppercase tracking-wider text-olive-800 mb-2">Security</Label>
                    <Button onClick={handlePasswordReset} variant="outline" className="border-olive-200 text-olive-700 hover:bg-olive-50 shadow-sm w-full md:w-auto self-start font-bold">
                      Reset Password via Email
                    </Button>
                  </div>
                </div>

                <div className="pt-6 border-t border-olive-100 space-y-4">
                  <h4 className="font-bold text-olive-900 text-sm">ERP Preferences & Viewports</h4>
                  
                  <div className="flex items-center justify-between py-2 border-b border-olive-50">
                    <div>
                      <p className="text-sm font-semibold text-olive-800">Display Blueprint Grid Overlay</p>
                      <p className="text-xs text-olive-500">Enable the technical grid overlay pattern in the background.</p>
                    </div>
                    <Switch 
                      checked={prefGrid} 
                      onCheckedChange={setPrefGrid}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-olive-50">
                    <div>
                      <p className="text-sm font-semibold text-olive-800">Email Notifications</p>
                      <p className="text-xs text-olive-500">Receive automated daily notifications and notices in your email.</p>
                    </div>
                    <Switch 
                      checked={prefNotifs.email} 
                      onCheckedChange={(val) => setPrefNotifs({...prefNotifs, email: val})}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-olive-800">In-App Alerts</p>
                      <p className="text-xs text-olive-500">Show floating toast notifications for chats and system logs.</p>
                    </div>
                    <Switch 
                      checked={prefNotifs.app} 
                      onCheckedChange={(val) => setPrefNotifs({...prefNotifs, app: val})}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-olive-100 flex justify-end">
                  <Button onClick={handleSavePreferences} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md px-8 font-bold rounded-xl h-11">Save Preferences</Button>
                </div>
              </div>
            </div>
          )}

          {/* USER MANAGEMENT */}
          {activeTab === "users" && isCSuiteOrAbove && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-olive-100 flex justify-between items-center bg-olive-50/50">
                <div>
                  <h3 className="font-bold text-lg text-olive-900">Team Accounts</h3>
                  <p className="text-sm text-olive-600">Manage roles and access for all staff.</p>
                </div>
                <Link href="/dashboard/hr/new" className="inline-flex items-center justify-center rounded-lg text-sm font-bold h-10 px-4 py-2 bg-olive-600 hover:bg-olive-700 text-white shadow-md transition-colors">
                  <Plus className="mr-2 h-4 w-4" /> Create Account
                </Link>
              </div>
              <div className="overflow-x-auto p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-olive-100/50 text-olive-700 text-xs uppercase font-bold border-b border-olive-200">
                    <tr>
                      <th className="px-6 py-4">Employee Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Current Role</th>
                      <th className="px-6 py-4">Last Login IP</th>
                      <th className="px-6 py-4 text-center">Active Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-olive-100">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-olive-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-olive-900">{emp.fullName}</td>
                        <td className="px-6 py-4 text-olive-600 font-medium">{emp.email}</td>
                        <td className="px-6 py-4">
                          <Select 
                            defaultValue={emp.role} 
                            onValueChange={(val) => handleRoleChange(emp.id, val)}
                            disabled={emp.id === user?.uid}
                          >
                            <SelectTrigger className="w-[180px] h-9 bg-white border-olive-200 focus:ring-olive-500 text-olive-950 font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white text-olive-950 font-semibold border-olive-150">
                              {Object.entries(ROLE_META).map(([key, meta]) => (
                                <SelectItem key={key} value={key} className="focus:bg-olive-50 hover:bg-olive-50 cursor-pointer">{meta.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500 font-semibold">{emp.lastLoginIP || "N/A"}</td>
                        <td className="px-6 py-4 text-center">
                          <Switch 
                            checked={emp.isActive} 
                            onCheckedChange={() => toggleEmployeeStatus(emp.id, emp.isActive)}
                            disabled={emp.id === user?.uid}
                            className="data-[state=checked]:bg-green-500"
                          />
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
            <div className="flex flex-col h-full bg-[#fafdfa]">
              <div className="p-6 border-b border-olive-100 bg-olive-50/50">
                <h3 className="font-bold text-lg text-olive-900">Roles & Permissions Matrix</h3>
                <p className="text-sm text-olive-600">Audit system roles, view which employees are assigned to each role, and inspect their active permission scopes.</p>
              </div>
              <div className="p-8 flex flex-col lg:flex-row gap-8 items-start">
                
                {/* Left panel: list of roles */}
                <div className="w-full lg:w-80 shrink-0 space-y-3">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-olive-700">Select System Role</h4>
                  <div className="space-y-2">
                    {Object.entries(ROLE_META).map(([key, meta]) => {
                      const count = getEmployeesWithRole(key).length;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedRole(key)}
                          className={cn("w-full flex items-center justify-between p-4 rounded-xl text-left border transition-all",
                            selectedRole === key
                              ? "bg-blue-600/10 border-blue-500/25 text-blue-950 font-bold shadow-sm"
                              : "border-olive-200 hover:bg-olive-50/50 text-olive-800"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", 
                              key === "founder" ? "bg-blue-500" :
                              key === "c_suite" ? "bg-purple-500" :
                              key === "manager" ? "bg-indigo-500" :
                              key === "senior_employee" ? "bg-cyan-500" :
                              key === "employee" ? "bg-emerald-500" : "bg-slate-400"
                            )} />
                            <span>{meta.label}</span>
                          </div>
                          <span className="text-xs font-bold bg-white border border-olive-200 text-olive-700 px-2 py-0.5 rounded-full shadow-sm">
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
                  <div className="border border-olive-200 rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="p-5 bg-olive-50 border-b border-olive-200 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-olive-955 flex items-center gap-2">
                          <Shield className="h-4.5 w-4.5 text-blue-600" />
                          Permission Scope: {ROLE_META[selectedRole]?.label || selectedRole}
                        </h4>
                        <p className="text-xs text-olive-600 mt-0.5">Permissions defined inside system security models.</p>
                      </div>
                      <Badge className={cn("text-xs font-bold px-3 py-1 uppercase rounded-full shadow-sm border", ROLE_META[selectedRole]?.color || "bg-olive-100 text-olive-800")}>
                        {selectedRole}
                      </Badge>
                    </div>

                    <div className="divide-y divide-olive-100">
                      {Object.entries(PERMISSION_LABELS).map(([permKey, permLabel]) => {
                        // Check if the selected role has this permission
                        const hasAccess = (PERMISSIONS[permKey as keyof typeof PERMISSIONS] as readonly string[]).includes(selectedRole);
                        return (
                          <div key={permKey} className="flex items-center justify-between p-4 hover:bg-olive-50/20 transition-colors">
                            <div>
                              <p className="text-sm font-semibold text-olive-900">{permLabel}</p>
                              <p className="text-[11px] font-mono text-olive-500 uppercase">{permKey}</p>
                            </div>
                            <div>
                              {hasAccess ? (
                                <Badge className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border border-emerald-500/20 font-bold text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
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
                  <div className="border border-olive-200 rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="p-5 bg-olive-50 border-b border-olive-200">
                      <h4 className="font-bold text-olive-950">
                        Assigned Team Members ({getEmployeesWithRole(selectedRole).length})
                      </h4>
                      <p className="text-xs text-olive-600 mt-0.5">Staff members currently holding {ROLE_META[selectedRole]?.label || selectedRole} authority.</p>
                    </div>

                    <div className="divide-y divide-olive-100">
                      {getEmployeesWithRole(selectedRole).length === 0 ? (
                        <div className="p-8 text-center text-olive-500 font-medium italic bg-white">
                          No team members are currently assigned to the {ROLE_META[selectedRole]?.label || selectedRole} role.
                        </div>
                      ) : (
                        getEmployeesWithRole(selectedRole).map((emp) => (
                          <div key={emp.id} className="p-4 flex items-center justify-between hover:bg-olive-50/20 transition-colors bg-white">
                            <div>
                              <p className="text-sm font-bold text-olive-900">{emp.fullName}</p>
                              <p className="text-xs text-olive-500 font-medium mt-0.5">{emp.email}</p>
                              {emp.lastLoginIP && (
                                <p className="text-[10px] text-slate-450 font-mono mt-1 font-semibold">IP Address: {emp.lastLoginIP}</p>
                              )}
                            </div>
                            <Badge className="bg-olive-100 text-olive-800 font-bold text-[10px] uppercase border border-olive-200 shadow-sm">
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
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-olive-100 bg-olive-50/50">
                <h3 className="font-bold text-lg text-olive-900">Company Profile</h3>
                <p className="text-sm text-olive-600">Details used across the ERP, including generated PDFs and Invoices.</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="flex items-center gap-6 pb-8 border-b border-olive-100">
                  <div className="w-24 h-24 bg-olive-50 rounded-xl flex items-center justify-center border-2 border-dashed border-olive-300">
                    {companySettings.logoURL ? (
                      <img src={companySettings.logoURL} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Building2 className="h-8 w-8 text-olive-400 opacity-50" />
                    )}
                  </div>
                  <div>
                    <Button variant="outline" className="mb-2 border-olive-200 text-olive-700 hover:bg-olive-50 shadow-sm"><UploadCloud className="mr-2 h-4 w-4" /> Upload New Logo</Button>
                    <p className="text-xs text-olive-500 font-medium">Recommended size: 256x256px. Max 2MB.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-olive-900 font-bold">Company Name</Label>
                    <Input value={compName} onChange={e => setCompName(e.target.value)} className="border-olive-200 focus-visible:ring-olive-500 bg-olive-50/50 text-olive-950 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-olive-900 font-bold">VAT / Tax Number</Label>
                    <Input value={compVat} onChange={e => setCompVat(e.target.value)} className="border-olive-200 focus-visible:ring-olive-500 bg-olive-50/50 text-olive-950 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-olive-900 font-bold">Default Currency</Label>
                    <Select value={compCurrency} onValueChange={(val) => setCompCurrency(val || "AED")}>
                      <SelectTrigger className="border-olive-200 focus:ring-olive-500 bg-olive-50/50 text-olive-950 font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white text-olive-950 font-semibold">
                        <SelectItem value="AED">AED - Global Currency</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-olive-900 font-bold">Headquarters Address</Label>
                    <Input value={compAddress} onChange={e => setCompAddress(e.target.value)} className="border-olive-200 focus-visible:ring-olive-500 bg-olive-50/50 text-olive-950 font-bold" />
                  </div>
                </div>

                <div className="pt-6 flex justify-end">
                  <Button onClick={handleSaveCompanySettings} disabled={savingCompany} className="bg-olive-600 hover:bg-olive-700 text-white shadow-md px-8 font-bold rounded-xl h-11">
                    {savingCompany ? "Saving Changes..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* HOLIDAYS */}
          {activeTab === "holidays" && isCSuiteOrAbove && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-olive-100 bg-olive-50/50">
                <h3 className="font-bold text-lg text-olive-900">Public Holidays</h3>
                <p className="text-sm text-olive-600">These dates are automatically excluded when calculating working days for Leave Requests.</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="flex flex-col sm:flex-row gap-4 items-end bg-olive-50/50 p-6 rounded-xl border border-olive-200 shadow-sm">
                  <div className="space-y-2 flex-1">
                    <Label className="text-olive-900 font-bold">Holiday Name</Label>
                    <Input 
                      placeholder="e.g. Eid Al Fitr" 
                      value={newHoliday.name}
                      onChange={e => setNewHoliday({...newHoliday, name: e.target.value})}
                      className="bg-white text-olive-950 font-bold"
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-olive-900 font-bold">Date</Label>
                    <Input 
                      type="date" 
                      value={newHoliday.date}
                      onChange={e => setNewHoliday({...newHoliday, date: e.target.value})}
                      className="bg-white text-olive-950 font-bold"
                    />
                  </div>
                  <Button className="bg-olive-600 hover:bg-olive-700 text-white shadow-md font-bold rounded-xl h-11 px-6" onClick={handleAddHoliday} disabled={!newHoliday.name || !newHoliday.date}>
                    <Plus className="h-4 w-4 mr-2" /> Add Date
                  </Button>
                </div>

                <div className="border border-olive-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-olive-100/50 text-olive-700 text-xs uppercase font-bold border-b border-olive-200">
                      <tr>
                        <th className="px-6 py-4">Holiday Date</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-olive-100">
                      {!companySettings.holidays || companySettings.holidays.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-olive-500 font-medium italic bg-olive-50/30">
                            No holidays configured.
                          </td>
                        </tr>
                      ) : (
                        companySettings.holidays.map((h: any, i: number) => (
                          <tr key={i} className="hover:bg-olive-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-olive-900">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            <td className="px-6 py-4 text-olive-600 font-medium">{h.name}</td>
                            <td className="px-6 py-4 text-right">
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteHoliday(i)}>
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

          {/* AUDIT LOG */}
          {isFounder && activeTab === "audit" && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-olive-100 bg-olive-50/50">
                <h3 className="font-bold text-lg text-olive-900">System Audit Log</h3>
                <p className="text-sm text-olive-600">Read-only record of all critical database operations. Visible to Founders only.</p>
              </div>
              <div className="overflow-x-auto p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Actor UID</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Target Collection</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center text-slate-500">
                          <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <p className="font-medium">No audit logs found. System events will be recorded here.</p>
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 font-mono text-xs transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-700">{log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString() : 'N/A'}</td>
                          <td className="px-6 py-4 truncate max-w-[150px] text-slate-600">{log.actorId}</td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className="bg-white border-slate-300 text-slate-700 shadow-none font-bold">
                              {log.action}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-500">{log.targetCollection} : {log.targetId}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
