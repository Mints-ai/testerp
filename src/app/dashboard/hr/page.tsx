"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { ROLE_META, canAccess } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Building2, LayoutGrid, Network, Mail, MessageSquare, Calendar, Briefcase, Zap, Users, Trash2, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { cn } from "@/lib/utils";

export default function EmployeeDirectory() {
  const { role } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "tree">("grid");
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const selectedEmployeeIsOnline = selectedEmployee?.lastSeenAt && (Date.now() - new Date(selectedEmployee.lastSeenAt).getTime() < 5 * 60 * 1000);

  useEffect(() => {
    const q = query(
      collection(db, "employees"),
      where("isActive", "==", true),
      orderBy("fullName")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.jobTitle?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = deptFilter === "all" || emp.department === deptFilter;
    const matchesRole = roleFilter === "all" || emp.role === roleFilter;
    
    return matchesSearch && matchesDept && matchesRole;
  });

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const founders = filteredEmployees.filter(e => e.role === "founder" || e.role === "c_suite");
  const others = filteredEmployees.filter(e => e.role !== "founder" && e.role !== "c_suite");

  return (
    <div className="space-y-6 pb-12 text-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" /> Directory
          </h1>
          <p className="text-xs text-white/40 mt-1">Manage and view organizational intelligence.</p>
        </div>
        
        <RoleGuard permission="VIEW_ALL_EMPLOYEES">
          <div className="flex items-center gap-4">
            <div className="flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.08] shadow-inner hidden md:flex">
              <button 
                onClick={() => setViewMode("grid")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                  viewMode === "grid" 
                    ? "bg-blue-600 text-white shadow-glow-blue" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5 mr-1.5" /> Grid
              </button>
              <button 
                onClick={() => setViewMode("tree")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                  viewMode === "tree" 
                    ? "bg-blue-600 text-white shadow-glow-blue" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <Network className="w-3.5 h-3.5 mr-1.5" /> Org Chart
              </button>
            </div>
            
            <RoleGuard permission="MANAGE_USERS">
              <Link href="/dashboard/hr/new" className="cursor-pointer">
                <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center">
                  <Plus className="mr-1.5 h-4 w-4" /> Add Person
                </button>
              </Link>
            </RoleGuard>
          </div>
        </RoleGuard>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.06] backdrop-blur-[24px]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
          <Input
            placeholder="Search by name or title..."
            className="glass-input h-9 text-xs pl-10 border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-4 md:w-1/2">
          <Select value={deptFilter} onValueChange={(val) => setDeptFilter(val || "all")}>
            <SelectTrigger className="flex-1 bg-white/[0.03] border-white/10 text-white placeholder:text-white/20 focus:ring-blue-500/60 h-9 text-xs rounded-xl">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1f3c] border-white/[0.08] text-white">
              <SelectItem value="all" className="text-xs hover:bg-white/5 focus:bg-white/5">All Departments</SelectItem>
              {departments.map((dept: any) => (
                <SelectItem key={dept} value={dept} className="text-xs hover:bg-white/5 focus:bg-white/5">{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={(val) => setRoleFilter(val || "all")}>
            <SelectTrigger className="flex-1 bg-white/[0.03] border-white/10 text-white placeholder:text-white/20 focus:ring-blue-500/60 h-9 text-xs rounded-xl">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1f3c] border-white/[0.08] text-white">
              <SelectItem value="all" className="text-xs hover:bg-white/5 focus:bg-white/5">All Roles</SelectItem>
              {Object.entries(ROLE_META).map(([key, meta]) => (
                <SelectItem key={key} value={key} className="text-xs hover:bg-white/5 focus:bg-white/5">{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex justify-center p-12">
          <Zap className="h-6 w-6 text-blue-500 animate-spin" />
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white/[0.01] rounded-2xl border border-white/[0.05] border-dashed">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">No people found</h3>
          <p className="text-xs text-white/30 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : viewMode === "grid" ? (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {filteredEmployees.map((emp) => {
              const roleMeta = ROLE_META[emp.role] || { label: "Employee", color: "bg-white/5 text-white border-white/10" };
              const isOnline = emp.lastSeenAt && (Date.now() - new Date(emp.lastSeenAt).getTime() < 5 * 60 * 1000);
              
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp)}
                  className="group"
                >
                  <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] h-full relative p-0 cursor-pointer">
                    {/* Header banner glow */}
                    <div className="h-16 bg-gradient-to-r from-blue-900/60 to-blue-800/40 border-b border-white/[0.04] relative overflow-hidden">
                      <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    
                    <CardContent className="px-4 pb-4 pt-0 text-center relative">
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full p-1 bg-[#0a1628] shadow-sm">
                        <div className="relative">
                          <Avatar className="h-16 w-16 border-2 border-white/10 shadow-sm bg-blue-950">
                            <AvatarImage src={emp.profilePhotoURL} alt={emp.fullName} />
                            <AvatarFallback className="bg-blue-800 text-blue-200 text-base font-bold">
                              {getInitials(emp.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          {/* Status Dot */}
                          <div className={cn("absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0a1628]", 
                            isOnline ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" : "bg-white/20"
                          )} title={isOnline ? "Active now" : emp.lastSeenAt ? `Last active ${new Date(emp.lastSeenAt).toLocaleString()}` : "Offline"} />
                        </div>
                      </div>
                      
                      <div className="mt-10 space-y-3">
                        <div>
                          <h3 className="font-bold text-sm text-white line-clamp-1 group-hover:text-blue-400 transition-colors" title={emp.fullName}>
                            {emp.fullName}
                          </h3>
                          <p className="text-[10px] text-white/40 line-clamp-1 font-semibold mt-0.5" title={emp.jobTitle}>
                            {emp.jobTitle || "No Title"}
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-1.5 w-full">
                          {(emp.departments || (emp.department ? [emp.department] : [])).map((dept: string, i: number) => (
                            <span key={i} className="badge bg-white/5 border border-white/10 text-white/60 font-semibold text-[9px] py-0.5 uppercase tracking-wider">
                              <Building2 className="w-2.5 h-2.5 mr-1 text-blue-400" />
                              {dept}
                            </span>
                          ))}
                          {emp.subRoles && emp.subRoles.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-1 max-w-full">
                              {emp.subRoles.slice(0, 3).map((sub: string, i: number) => (
                                <span key={i} className="badge bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold text-[8px] px-1.5 py-0.5 uppercase tracking-wider whitespace-nowrap">
                                  {sub}
                                </span>
                              ))}
                              {emp.subRoles.length > 3 && (
                                <span className="badge bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold text-[8px] px-1.5 py-0.5 uppercase tracking-wider">
                                  +{emp.subRoles.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          <Badge variant="outline" className={cn("font-bold shadow-none text-[9px] py-0.5 uppercase tracking-wider", roleMeta.color)}>
                            {roleMeta.label}
                          </Badge>
                        </div>
                        
                        {emp.role === "intern" && (
                          <div className="mt-3 pt-3 border-t border-white/[0.04] w-full text-left">
                            <div className="flex justify-between text-[9px] text-white/40 font-bold mb-1 uppercase tracking-wider">
                              <span>Intern Progress</span>
                              <span>65%</span>
                            </div>
                            <div className="glass-progress w-full">
                              <div className="glass-progress-fill" style={{ width: "65%" }}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        /* Org Chart View */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/[0.02] rounded-2xl border border-white/[0.06] backdrop-blur-[24px] shadow-card p-12 overflow-x-auto min-h-[500px] flex justify-center">
          <div className="flex flex-col items-center">
            {/* Top Level */}
            <div className="flex gap-16 mb-16 relative">
              {founders.length > 0 ? founders.map(emp => (
                <div key={emp.id} className="flex flex-col items-center cursor-pointer hover:-translate-y-1 transition-transform" onClick={() => setSelectedEmployee(emp)}>
                  <Avatar className="h-16 w-16 border-2 border-blue-500 shadow-glow-blue z-10 bg-blue-950">
                    <AvatarImage src={emp.profilePhotoURL} />
                    <AvatarFallback className="text-base font-bold bg-blue-800 text-blue-200">{getInitials(emp.fullName)}</AvatarFallback>
                  </Avatar>
                  <p className="font-bold text-xs text-white mt-3">{emp.fullName}</p>
                  <p className="text-[10px] text-blue-400 font-semibold mt-0.5">{ROLE_META[emp.role]?.label || "Executive"}</p>
                </div>
              )) : (
                <div className="text-white/20 italic text-xs">No executives defined</div>
              )}
              {/* Connector line down */}
              {founders.length > 0 && others.length > 0 && (
                <div className="absolute top-full left-1/2 -ml-px w-0.5 h-16 bg-blue-500/25"></div>
              )}
            </div>

            {/* Second Level */}
            {others.length > 0 && (
              <div className="relative pt-6 w-full flex justify-center">
                {/* Horizontal connector line */}
                <div className="absolute top-0 left-12 right-12 h-0.5 bg-blue-500/25"></div>
                <div className="flex gap-6 justify-center flex-wrap max-w-6xl">
                  {others.map(emp => {
                    const roleMeta = ROLE_META[emp.role] || { label: "Employee", color: "bg-white/5 text-white border-white/10" };
                    return (
                      <div key={emp.id} className="flex flex-col items-center relative cursor-pointer hover:-translate-y-1 transition-transform bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] shadow-sm w-36" onClick={() => setSelectedEmployee(emp)}>
                        {/* Vertical connector line up */}
                        <div className="absolute -top-6 left-1/2 -ml-px w-0.5 h-6 bg-blue-500/25"></div>
                        <Avatar className={cn("h-12 w-12 shadow-sm z-10 bg-blue-950 border-2", 
                          emp.role === "manager" || emp.role === "director" ? "border-blue-500" : "border-white/10"
                        )}>
                          <AvatarImage src={emp.profilePhotoURL} />
                          <AvatarFallback className="bg-blue-800 text-blue-200 font-bold text-xs">{getInitials(emp.fullName)}</AvatarFallback>
                        </Avatar>
                        <p className="font-bold text-white mt-3 text-xs truncate w-full text-center" title={emp.fullName}>{emp.fullName}</p>
                        <p className="text-[9px] text-white/40 text-center truncate w-full font-bold uppercase mt-0.5">{roleMeta.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Detail Drawer */}
      <Sheet open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <SheetContent className="w-[400px] sm:w-[520px] overflow-y-auto border-l border-white/[0.08] bg-[#0d1f3c] text-white flex flex-col p-6">
          {selectedEmployee && (
            <div className="space-y-6 pb-12 mt-6">
              <SheetHeader className="text-left flex flex-row items-center gap-4 border-b border-white/[0.06] pb-6 shrink-0">
                <Avatar className="h-16 w-16 border border-white/10 ring-2 ring-blue-500/20 shrink-0 bg-blue-950">
                  <AvatarImage src={selectedEmployee.profilePhotoURL} />
                  <AvatarFallback className="text-base font-bold text-blue-200 bg-blue-800">{getInitials(selectedEmployee.fullName)}</AvatarFallback>
                </Avatar>
                <div>
                  <SheetTitle className="text-base font-bold text-white leading-tight">{selectedEmployee.fullName}</SheetTitle>
                  <SheetDescription className="text-blue-400 font-semibold text-xs mt-0.5 leading-none">
                    {selectedEmployee.jobTitle || "No Title"}
                  </SheetDescription>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <Badge variant="outline" className="border-white/10 text-white/60 bg-white/5 text-[9px] uppercase tracking-wider font-bold shadow-none whitespace-nowrap shrink-0">
                      {ROLE_META[selectedEmployee.role]?.label || "Employee"}
                    </Badge>
                    {(selectedEmployee.departments || (selectedEmployee.department ? [selectedEmployee.department] : [])).map((dept: string, i: number) => (
                      <Badge key={i} variant="outline" className="border-white/10 text-white/60 bg-white/5 text-[9px] uppercase tracking-wider font-bold shadow-none whitespace-nowrap shrink-0">
                        {dept}
                      </Badge>
                    ))}
                    {(selectedEmployee.subRoles || []).map((subRole: string, i: number) => (
                      <Badge key={`sub-${i}`} variant="outline" className="border-indigo-500/20 text-indigo-300 bg-indigo-500/10 text-[9px] uppercase tracking-wider font-bold shadow-none whitespace-nowrap shrink-0 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                        {subRole}
                      </Badge>
                    ))}
                  </div>
                </div>
              </SheetHeader>

              <div className="flex flex-wrap sm:flex-nowrap gap-3">
                <button className="flex-1 min-w-[80px] whitespace-nowrap btn-primary h-9 text-xs font-bold flex items-center justify-center cursor-pointer px-2">
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5 shrink-0" /> Message
                </button>
                <button className="flex-1 min-w-[80px] whitespace-nowrap btn-ghost h-9 text-xs font-semibold flex items-center justify-center border-white/10 text-white/70 cursor-pointer px-2">
                  <Mail className="w-3.5 h-3.5 mr-1.5 shrink-0" /> Email
                </button>
                <Link href={`/dashboard/hr/${selectedEmployee.id}`} className="flex-1 min-w-[90px] flex cursor-pointer">
                  <button className="w-full whitespace-nowrap btn-ghost h-9 text-xs font-semibold flex items-center justify-center border-white/10 text-white/70 cursor-pointer px-2">
                    Full Profile
                  </button>
                </Link>
              </div>

              <div className="space-y-5">
                <div>
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.12em] mb-2.5">Current Status</h4>
                  <Card className="border-white/[0.06] bg-white/[0.01]">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-3 h-3 rounded-full", 
                          selectedEmployeeIsOnline ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" : "bg-white/20"
                        )}></div>
                        <div>
                          <p className="text-xs font-bold text-white">{selectedEmployeeIsOnline ? "Active Now" : "Offline"}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            {selectedEmployeeIsOnline ? "Active on Mints ERP" : selectedEmployee.lastSeenAt ? `Last active ${new Date(selectedEmployee.lastSeenAt).toLocaleString()}` : "Offline"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.12em] mb-2.5 flex justify-between items-center">
                    Leave Balance
                    <span className="text-[9px] text-white/40 normal-case font-bold">24 days total</span>
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/60">Used</span>
                      <span className="text-white">0 days</span>
                    </div>
                    <div className="glass-progress w-full">
                      <div className="glass-progress-fill" style={{ width: `0%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/30">Remaining</span>
                      <span className="text-blue-400">24 days</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.12em] mb-2.5">Active Projects</h4>
                  <div className="space-y-2">
                    <div className="p-4 text-center text-xs text-white/40 italic bg-white/[0.01] rounded-xl border border-white/[0.06]">
                      No active projects assigned.
                    </div>
                  </div>
                </div>
                {canAccess(role, "DELETE_DATA") && (
                  <div className="pt-4 border-t border-white/[0.06] mt-6">
                    <button 
                      onClick={async () => {
                        if (confirm(`WARNING: Are you absolutely sure you want to permanently delete the employee profile for "${selectedEmployee.fullName}"? This will disable their login credentials and wipe their HR record from all departments. This is a destructive action.`)) {
                          try {
                            const { deleteDoc, doc } = await import("firebase/firestore");
                            await deleteDoc(doc(db, "employees", selectedEmployee.id));
                            setSelectedEmployee(null);
                          } catch (err) {
                            console.error("Error deleting employee:", err);
                          }
                        }
                      }}
                      className="w-full py-2 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-300 hover:text-white text-xs font-bold rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Deprovision Employee Profile
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
