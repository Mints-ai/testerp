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
  pitch: "bg-primary/15 text-primary/80 border-primary/20",
  active: "bg-emerald-600/15 text-emerald-300 border-emerald-500/20",
  on_hold: "bg-amber-600/15 text-amber-300 border-amber-500/20",
  completed: "bg-cyan-600/15 text-cyan-300 border-cyan-500/20",
  cancelled: "bg-rose-600/15 text-rose-300 border-rose-500/20",
};

const SERVICE_COLORS: Record<string, string> = {
  "SEO": "bg-primary",
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

  const getGanttPosition = (startStr: string, endStr: string) => {
    const chartStart = new Date("2026-05-01").getTime();
    const chartEnd = new Date("2026-10-31").getTime();
    const totalDays = chartEnd - chartStart;

    const start = startStr ? new Date(startStr).getTime() : chartStart;
    const end = endStr ? new Date(endStr).getTime() : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).getTime();

    const startPct = Math.max(0, Math.min(100, ((start - chartStart) / totalDays) * 100));
    const endPct = Math.max(0, Math.min(100, ((end - chartStart) / totalDays) * 100));
    const widthPct = Math.max(8, endPct - startPct);
    
    return {
      left: `${startPct}%`,
      width: `${widthPct}%`
    };
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ["pitch", "active", "on_hold", "completed"];

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 h-full flex flex-col text-foreground">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" /> Projects
          </h1>
          <p className="text-xs text-foreground/40 mt-1">Manage client projects, pipelines, and timelines.</p>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
          <div className="flex gap-1 p-1 rounded-xl border border-border shadow-inner shrink-0">
            <button 
              onClick={() => setView("kanban")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                view === "kanban" 
                  ? "bg-primary text-foreground shadow-sm" 
                  : "text-foreground/40 hover:text-foreground/80"
              )}
            >
              <Kanban className="w-3.5 h-3.5 mr-1.5" /> Board
            </button>
            <button 
              onClick={() => setView("table")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                view === "table" 
                  ? "bg-primary text-foreground shadow-sm" 
                  : "text-foreground/40 hover:text-foreground/80"
              )}
            >
              <ListIcon className="w-3.5 h-3.5 mr-1.5" /> List
            </button>
            <button 
              onClick={() => setView("timeline")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all cursor-pointer", 
                view === "timeline" 
                  ? "bg-primary text-foreground shadow-sm" 
                  : "text-foreground/40 hover:text-foreground/80"
              )}
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" /> Timeline
            </button>
          </div>
          
          <RoleGuard permission="CREATE_PROJECT">
            <Link href="/dashboard/projects/new" className="cursor-pointer shrink-0">
              <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center whitespace-nowrap">
                <Plus className="mr-1.5 h-4 w-4" /> New Project
              </button>
            </Link>
          </RoleGuard>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 p-4 rounded-2xl border border-border bg-card shadow-sm shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
          <Input
            placeholder="Search projects..."
            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs pl-10 border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {view !== "kanban" && (
          <div className="flex gap-4 w-full md:w-auto mt-2 md:mt-0">
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || "all")}>
              <SelectTrigger className="w-full md:w-[180px] border-border text-foreground placeholder:text-foreground/20 focus:ring-primary/60 h-9 text-xs rounded-xl">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border text-foreground">
                <SelectItem value="all" className="text-xs hover: focus:">All Statuses</SelectItem>
                <SelectItem value="pitch" className="text-xs hover: focus:">Pitch</SelectItem>
                <SelectItem value="active" className="text-xs hover: focus:">Active</SelectItem>
                <SelectItem value="on_hold" className="text-xs hover: focus:">On Hold</SelectItem>
                <SelectItem value="completed" className="text-xs hover: focus:">Completed</SelectItem>
                <SelectItem value="cancelled" className="text-xs hover: focus:">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Clock className="h-6 w-6 text-primary animate-spin" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-border border-dashed">
          <h3 className="text-sm font-bold text-foreground/50 uppercase tracking-wider">No projects found</h3>
          <p className="text-xs text-foreground/30 mt-1">Create a new project or adjust your filters.</p>
        </div>
      ) : view === "kanban" ? (
        <div className="flex-1 overflow-x-auto pb-4 snap-x snap-mandatory">
          <div className="flex gap-4 md:gap-6 min-w-max h-full">
            {statuses.map(status => {
              const columnProjects = filteredProjects.filter(p => p.status === status);
              return (
                <div key={status} className="w-[85vw] max-w-[320px] md:w-80 flex flex-col rounded-2xl border border-border p-3 md:p-4 shrink-0 h-[65vh] md:h-[600px] overflow-hidden snap-center">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="font-bold text-foreground uppercase tracking-[0.12em] text-xs flex items-center">
                      <span className={cn("w-2 h-2 rounded-full mr-2", 
                        status === "active" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : 
                        status === "pitch" ? "bg-primary shadow-[0_0_6px_rgba(37,99,235,0.7)]" : 
                        status === "completed" ? "bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.7)]" : "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]"
                      )} />
                      {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                    </h3>
                    <Badge className="border border-border text-foreground/60 font-mono text-xs">{columnProjects.length}</Badge>
                  </div>
                  
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    <AnimatePresence>
                      {columnProjects.map(project => {
                        const serviceColor = SERVICE_COLORS[project.serviceType] || "bg-primary";
                        return (
                          <motion.div
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={project.id}
                          >
                            <Link href={`/dashboard/projects/${project.id}`}>
                              <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border relative group cursor-pointer mb-3">
                                {/* Left Service Color Strip */}
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1", serviceColor)} />
                                
                                <CardContent className="p-4 pl-5">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="badge border border-border text-foreground/50 text-xs uppercase tracking-wider font-bold py-0.5">
                                      {project.serviceType || "General"}
                                    </span>
                                    <div className={cn("w-2 h-2 rounded-full", 
                                      status === "active" ? "bg-emerald-500" : ""
                                    )} title="Project Health" />
                                  </div>
                                  
                                  <p className="text-xs uppercase font-bold text-primary/80 mb-1 truncate tracking-wider">
                                    {clients[project.clientId] || "Mints Global Client"}
                                  </p>
                                  
                                  <h4 className="font-bold text-foreground text-xs line-clamp-2 leading-snug mb-3 group-hover:text-primary transition-colors">
                                    {project.name}
                                  </h4>
                                  
                                  <div className="flex items-center justify-between pt-3 border-t border-border">
                                    <div className="flex items-center gap-1.5 text-xs text-foreground/40 font-semibold uppercase tracking-wider">
                                      <CalendarIcon className="h-3.5 w-3.5 text-foreground/20" />
                                      {project.endDate ? new Date(project.endDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'No date'}
                                    </div>
                                    <Avatar className="h-5 w-5 border border-border">
                                      <AvatarFallback className="bg-primary/20 text-primary/70 text-xs font-bold">M</AvatarFallback>
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
                      <div className="h-32 rounded-xl border-2 border-dashed border-border/50 bg-secondary/10 flex flex-col items-center justify-center gap-3 text-xs text-foreground/40 hover:border-primary/50 transition-colors">
                        <span>No projects here</span>
                        <Link href="/dashboard/projects/new">
                          <button className="px-3 py-1.5 bg-background border border-border rounded-md hover:bg-secondary text-foreground font-bold transition-all shadow-sm flex items-center gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Add Project
                          </button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "table" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
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
                  <tr key={project.id} className="hover: cursor-pointer transition-colors" 
                      onClick={() => window.location.href = `/dashboard/projects/${project.id}`}>
                    <td className="font-bold text-foreground">
                      <div className="flex items-center">
                        <div className={cn("w-2 h-2 rounded-full mr-3", SERVICE_COLORS[project.serviceType] || "bg-primary")} />
                        {project.name}
                      </div>
                    </td>
                    <td className="text-foreground/60 font-semibold">{clients[project.clientId] || "Mints Global Client"}</td>
                    <td>
                      <Badge variant="outline" className={cn("font-bold text-xs py-0.5 tracking-wider uppercase shadow-none", STATUS_COLORS[project.status] || STATUS_COLORS.pitch)}>
                        {project.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </td>
                    <td className="text-foreground/60 font-semibold">{project.serviceType}</td>
                    <td className="text-foreground/40 font-mono text-xs">
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
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border bg-card shadow-sm p-4 sm:p-6 overflow-x-auto flex-1">
          <div className="min-w-[600px] sm:min-w-[800px]">
            {/* Timeline Header - Months */}
            <div className="flex border-b border-border pb-2 mb-6 ml-24 sm:ml-48">
              {['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map(m => (
                <div key={m} className="flex-1 text-xs font-bold text-foreground/30 uppercase tracking-widest pl-2">{m}</div>
              ))}
            </div>
            
            {/* Project Rows */}
            <div className="space-y-6">
              {filteredProjects.slice(0, 10).map((project, idx) => {
                const serviceColor = SERVICE_COLORS[project.serviceType] || "bg-primary";
                const pos = getGanttPosition(project.startDate, project.endDate);
                
                return (
                  <div key={project.id} className="flex items-center group cursor-pointer" onClick={() => window.location.href = `/dashboard/projects/${project.id}`}>
                    <div className="w-24 sm:w-48 shrink-0 pr-2 sm:pr-4">
                      <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{project.name}</p>
                      <p className="text-xs text-foreground/40 font-semibold mt-0.5 truncate">{project.serviceType}</p>
                    </div>
                    <div className="flex-1 relative h-7 border border-border rounded-xl overflow-hidden">
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="flex-1 border-l border-border" />)}
                      </div>
                      {/* The bar */}
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: pos.width }}
                        className={cn("absolute top-1 bottom-1 rounded-full shadow-sm flex items-center px-3 border border-border", serviceColor)}
                        style={{ left: pos.left }}
                      >
                        <span className="text-xs text-foreground font-bold truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {project.progress || (project.status === "completed" ? "100%" : "30%")}%
                        </span>
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Resource Workload Capacity Heatmap */}
        <div className="mt-6 rounded-2xl border border-border bg-card shadow-sm p-5">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-foreground uppercase tracking-wider text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(99,102,241,0.7)]" />
                Team Resource Capacity Heatmap
              </h3>
              <p className="text-xs text-foreground/40 font-semibold mt-1">Track actual logged task hours vs. safe weekly workload allocations.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-xs font-bold text-foreground/50 border border-border/30 px-2.5 py-1 rounded-lg">Safe Limit: 40 hrs</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: "Anand M.", role: "Lead Systems Developer", hours: 44, color: "from-rose-500/20 to-rose-600/30 border-rose-500/30", text: "text-rose-300", badge: "Critical Over-load" },
              { name: "Jane Smith", role: "UI/UX Designer", hours: 32, color: "from-emerald-500/20 to-emerald-600/30 border-emerald-500/30", text: "text-emerald-300", badge: "Optimal" },
              { name: "David Chen", role: "Operations Specialist", hours: 15, color: "from-blue-500/20 to-blue-600/30 border-primary/30", text: "text-primary/80", badge: "Underutilized" }
            ].map(member => {
              const percentage = Math.min(100, (member.hours / 40) * 100);
              return (
                <div key={member.name} className={cn("p-4 rounded-xl border bg-gradient-to-br", member.color)}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-xs text-foreground">{member.name}</h4>
                      <p className="text-xs text-foreground/40 mt-0.5">{member.role}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-xs py-0 px-2 font-bold", member.text, "border-none ")}>{member.badge}</Badge>
                  </div>
                  <div className="space-y-1.5 mt-3">
                    <div className="flex justify-between text-xs font-semibold text-foreground/60">
                      <span>Workload: {member.hours} / 40 hrs</span>
                      <span>{percentage.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", member.hours > 40 ? "bg-rose-500" : "bg-primary")} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
