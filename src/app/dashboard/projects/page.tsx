"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Search, Kanban, List as ListIcon, Clock, CalendarIcon, Briefcase } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pitch: "bg-blue-600/15 text-blue-300 border-blue-500/20",
  active: "bg-emerald-600/15 text-emerald-300 border-emerald-500/20",
  on_hold: "bg-amber-600/15 text-amber-300 border-amber-500/20",
  completed: "bg-cyan-600/15 text-cyan-300 border-cyan-500/20",
  cancelled: "bg-rose-600/15 text-rose-300 border-rose-500/20",
};

const SERVICE_COLORS: Record<string, string> = {
  "SEO": "bg-blue-500",
  "Development": "bg-cyan-500",
  "Design": "bg-violet-500",
  "Marketing": "bg-orange-500",
  "Consulting": "bg-emerald-500"
};

export default function ProjectsList() {
  const { user, role } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "table" | "timeline">("kanban");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!user || !role) return;

    // 1. Fetch clients mapping
    const unsubClients = onSnapshot(collection(db, "clients"), (snapshot) => {
      const clsMap: Record<string, string> = {};
      snapshot.docs.forEach(docSnap => {
        clsMap[docSnap.id] = docSnap.data().companyName || "Mints Client";
      });
      setClients(clsMap);
    }, (error) => {
      console.error("Error subscribing to clients mapping:", error);
    });

    // 2. Fetch projects
    let q;
    if (canAccess(role, "VIEW_ALL_FINANCE")) { 
      q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    } else {
      q = query(
        collection(db, "projects"), 
        where("memberIds", "array-contains", user.uid),
        orderBy("createdAt", "desc")
      );
    }

    const unsubProjects = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projs);
      setLoading(false);
    });

    return () => {
      unsubClients();
      unsubProjects();
    };
  }, [user, role]);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ["pitch", "active", "on_hold", "completed"];

  return (
    <div className="space-y-6 pb-12 h-full flex flex-col text-white pl-4 lg:pl-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-500" /> Projects
          </h1>
          <p className="text-xs text-white/40 mt-1">Manage client projects, pipelines, and timelines.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.08] shadow-inner hidden md:flex">
            <button 
              onClick={() => setView("kanban")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                view === "kanban" 
                  ? "bg-blue-600 text-white shadow-glow-blue" 
                  : "text-white/40 hover:text-white/80"
              )}
            >
              <Kanban className="w-3.5 h-3.5 mr-1.5" /> Board
            </button>
            <button 
              onClick={() => setView("table")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                view === "table" 
                  ? "bg-blue-600 text-white shadow-glow-blue" 
                  : "text-white/40 hover:text-white/80"
              )}
            >
              <ListIcon className="w-3.5 h-3.5 mr-1.5" /> List
            </button>
            <button 
              onClick={() => setView("timeline")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                view === "timeline" 
                  ? "bg-blue-600 text-white shadow-glow-blue" 
                  : "text-white/40 hover:text-white/80"
              )}
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" /> Timeline
            </button>
          </div>
          
          <RoleGuard permission="CREATE_PROJECT">
            <Link href="/dashboard/projects/new" className="cursor-pointer">
              <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center">
                <Plus className="mr-1.5 h-4 w-4" /> New Project
              </button>
            </Link>
          </RoleGuard>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.06] backdrop-blur-[24px] shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
          <Input
            placeholder="Search projects..."
            className="glass-input h-9 text-xs pl-10 border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {view !== "kanban" && (
          <div className="flex gap-4 md:w-auto">
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || "all")}>
              <SelectTrigger className="w-[180px] bg-white/[0.03] border-white/10 text-white placeholder:text-white/20 focus:ring-blue-500/60 h-9 text-xs rounded-xl">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1f3c] border-white/[0.08] text-white">
                <SelectItem value="all" className="text-xs hover:bg-white/5 focus:bg-white/5">All Statuses</SelectItem>
                <SelectItem value="pitch" className="text-xs hover:bg-white/5 focus:bg-white/5">Pitch</SelectItem>
                <SelectItem value="active" className="text-xs hover:bg-white/5 focus:bg-white/5">Active</SelectItem>
                <SelectItem value="on_hold" className="text-xs hover:bg-white/5 focus:bg-white/5">On Hold</SelectItem>
                <SelectItem value="completed" className="text-xs hover:bg-white/5 focus:bg-white/5">Completed</SelectItem>
                <SelectItem value="cancelled" className="text-xs hover:bg-white/5 focus:bg-white/5">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Clock className="h-6 w-6 text-blue-500 animate-spin" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white/[0.01] rounded-2xl border border-white/[0.05] border-dashed">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">No projects found</h3>
          <p className="text-xs text-white/30 mt-1">Create a new project or adjust your filters.</p>
        </div>
      ) : view === "kanban" ? (
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-6 min-w-max h-full">
            {statuses.map(status => {
              const columnProjects = filteredProjects.filter(p => p.status === status);
              return (
                <div key={status} className="w-80 flex flex-col bg-white/[0.02] rounded-2xl border border-white/[0.06] p-4 shrink-0 h-[600px] overflow-hidden">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="font-bold text-white uppercase tracking-[0.12em] text-xs flex items-center">
                      <span className={cn("w-2 h-2 rounded-full mr-2", 
                        status === "active" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : 
                        status === "pitch" ? "bg-blue-500 shadow-[0_0_6px_rgba(37,99,235,0.7)]" : 
                        status === "completed" ? "bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.7)]" : "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]"
                      )} />
                      {status.replace("_", " ")}
                    </h3>
                    <Badge className="bg-white/5 border border-white/10 text-white/60 font-mono text-[10px]">{columnProjects.length}</Badge>
                  </div>
                  
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    <AnimatePresence>
                      {columnProjects.map(project => {
                        const serviceColor = SERVICE_COLORS[project.serviceType] || "bg-blue-500";
                        return (
                          <motion.div
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={project.id}
                          >
                            <Link href={`/dashboard/projects/${project.id}`}>
                              <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] relative group cursor-pointer mb-3">
                                {/* Left Service Color Strip */}
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1", serviceColor)} />
                                
                                <CardContent className="p-4 pl-5">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="badge bg-white/5 border border-white/10 text-white/50 text-[9px] uppercase tracking-wider font-bold py-0.5">
                                      {project.serviceType || "General"}
                                    </span>
                                    <div className={cn("w-2 h-2 rounded-full", 
                                      status === "active" ? "bg-emerald-500" : "bg-white/20"
                                    )} title="Project Health" />
                                  </div>
                                  
                                  <p className="text-[9px] uppercase font-bold text-blue-400/80 mb-1 truncate tracking-wider">
                                    {clients[project.clientId] || "Mints Global Client"}
                                  </p>
                                  
                                  <h4 className="font-bold text-white text-xs line-clamp-2 leading-snug mb-3 group-hover:text-blue-400 transition-colors">
                                    {project.name}
                                  </h4>
                                  
                                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-semibold uppercase tracking-wider">
                                      <CalendarIcon className="h-3.5 w-3.5 text-white/20" />
                                      {project.endDate ? new Date(project.endDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'No date'}
                                    </div>
                                    <Avatar className="h-5 w-5 border border-white/10">
                                      <AvatarFallback className="bg-blue-800 text-blue-200 text-[9px] font-bold">M</AvatarFallback>
                                    </Avatar>
                                  </div>
                                </CardContent>
                              </Card>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {columnProjects.length === 0 && (
                      <div className="h-24 rounded-2xl border border-white/[0.06] border-dashed flex items-center justify-center text-xs text-white/20 italic">
                        Empty Section
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "table" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/[0.02] rounded-2xl border border-white/[0.06] backdrop-blur-[24px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Service</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-white/[0.02] cursor-pointer transition-colors" 
                      onClick={() => window.location.href = `/dashboard/projects/${project.id}`}>
                    <td className="font-bold text-white">
                      <div className="flex items-center">
                        <div className={cn("w-2 h-2 rounded-full mr-3", SERVICE_COLORS[project.serviceType] || "bg-blue-500")} />
                        {project.name}
                      </div>
                    </td>
                    <td className="text-white/60 font-semibold">{clients[project.clientId] || "Mints Global Client"}</td>
                    <td>
                      <Badge variant="outline" className={cn("font-bold text-[9px] py-0.5 tracking-wider uppercase shadow-none", STATUS_COLORS[project.status] || STATUS_COLORS.pitch)}>
                        {project.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </td>
                    <td className="text-white/60 font-semibold">{project.serviceType}</td>
                    <td className="text-white/40 font-mono text-xs">
                      {project.endDate ? new Date(project.endDate).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        /* Timeline / Gantt View */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/[0.02] rounded-2xl border border-white/[0.06] backdrop-blur-[24px] p-6 overflow-x-auto flex-1">
          <div className="min-w-[800px]">
            {/* Timeline Header - Months */}
            <div className="flex border-b border-white/[0.06] pb-2 mb-6 ml-48">
              {['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map(m => (
                <div key={m} className="flex-1 text-[9px] font-bold text-white/30 uppercase tracking-widest pl-2">{m}</div>
              ))}
            </div>
            
            {/* Project Rows */}
            <div className="space-y-6">
              {filteredProjects.slice(0, 10).map((project, idx) => {
                const serviceColor = SERVICE_COLORS[project.serviceType] || "bg-blue-500";
                const startMargin = "0%";
                const width = "10%";
                
                return (
                  <div key={project.id} className="flex items-center group cursor-pointer" onClick={() => window.location.href = `/dashboard/projects/${project.id}`}>
                    <div className="w-48 shrink-0 pr-4">
                      <p className="text-xs font-bold text-white truncate group-hover:text-blue-400 transition-colors">{project.name}</p>
                      <p className="text-[10px] text-white/40 font-semibold mt-0.5 truncate">{project.serviceType}</p>
                    </div>
                    <div className="flex-1 relative h-7 bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden">
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="flex-1 border-l border-white/[0.04]" />)}
                      </div>
                      {/* The bar */}
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width }}
                        className={cn("absolute top-1 bottom-1 rounded-full shadow-glow-blue flex items-center px-3 border border-white/10", serviceColor)}
                        style={{ left: startMargin }}
                      >
                        <span className="text-[9px] text-white font-bold truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {project.status === "completed" ? "100%" : "0%"}
                        </span>
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
