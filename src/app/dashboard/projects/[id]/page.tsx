"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, deleteDoc, updateDoc, collection, query, getDocs, arrayUnion, arrayRemove, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Users, FileText, CheckSquare, MessageSquare, AlertCircle, Play, MoreVertical, Check, Plus, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canAccess } from "@/lib/permissions";

// Helper component for circular progress
const ProgressRing = ({ progress, size = 120, strokeWidth = 8, colorClass = "text-blue-400" }: any) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        {/* Background circle */}
        <circle
          className="text-white/10"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <motion.circle
          className={colorClass}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{progress}%</span>
      </div>
    </div>
  );
};

export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user, role, simulatedRole } = useAuth();
  const currentRole = simulatedRole || role;
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [compCurrency, setCompCurrency] = useState("USD");
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchEmp, setSearchEmp] = useState("");

  // Milestone management state
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");

  // Project Task states
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "tasks"), where("projectId", "==", id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProjectTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [id]);

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim()) return;
    const newM = {
      id: Math.random().toString(36).substring(2, 9),
      title: newMilestoneTitle.trim(),
      completed: false,
      dueDate: newMilestoneDate || null
    };
    await updateDoc(doc(db, "projects", id as string), {
      milestones: arrayUnion(newM)
    });
    setNewMilestoneTitle("");
    setNewMilestoneDate("");
  };

  const handleToggleMilestone = async (milestoneId: string, currentVal: boolean) => {
    const updatedMilestones = (project?.milestones || []).map((m: any) => 
      m.id === milestoneId ? { ...m, completed: !currentVal } : m
    );
    await updateDoc(doc(db, "projects", id as string), {
      milestones: updatedMilestones
    });
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    const updatedMilestones = (project?.milestones || []).filter((m: any) => m.id !== milestoneId);
    await updateDoc(doc(db, "projects", id as string), {
      milestones: updatedMilestones
    });
  };

  const handleAddProjectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    await addDoc(collection(db, "tasks"), {
      title: newTaskTitle.trim(),
      projectId: id,
      projectName: project.name,
      assignedTo: user?.uid || "unassigned",
      status: "backlog",
      priority: newTaskPriority,
      createdAt: serverTimestamp ? serverTimestamp() : new Date(),
      blocked: false
    });
    setNewTaskTitle("");
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "done" ? "in_progress" : "done";
    await updateDoc(doc(db, "tasks", taskId), {
      status: nextStatus
    });
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      const q = query(collection(db, "employees"));
      const snap = await getDocs(q);
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchEmployees();
  }, []);

  const handleToggleMember = async (empId: string) => {
    const isMember = project.memberIds?.includes(empId);
    await updateDoc(doc(db, "projects", id as string), {
      memberIds: isMember ? arrayRemove(empId) : arrayUnion(empId)
    });
  };

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        setCompCurrency(docSnap.data().currency || "USD");
      }
    });
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    if (!id) return;
    
    const unsubscribe = onSnapshot(doc(db, "projects", id as string), (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() });
      } else {
        setProject(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-olive-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center bg-white rounded-xl border border-olive-200 shadow-card">
        <div className="h-16 w-16 rounded-full bg-olive-50 flex items-center justify-center mb-4 border border-olive-100">
          <FileText className="h-8 w-8 text-olive-400" />
        </div>
        <h2 className="text-xl font-bold text-olive-900">Project Not Found</h2>
        <p className="text-olive-500 mt-2">The requested project does not exist or you don't have access.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pitch: "bg-blue-100 text-blue-700 border-blue-200",
    active: "bg-green-100 text-green-700 border-green-200",
    on_hold: "bg-yellow-100 text-yellow-700 border-yellow-200",
    completed: "bg-olive-100 text-olive-700 border-olive-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
  };

  const milestones = project?.milestones || [];
  const progress = milestones.length > 0 
    ? Math.round((milestones.filter((m: any) => m.completed).length / milestones.length) * 100) 
    : 0;

  const handleDeleteProject = async () => {
    if (confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "projects", id as string));
        router.push("/dashboard/projects");
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Profile Card */}
      <Card className="overflow-hidden border-white/10 shadow-lg">
        <div className="h-3 bg-gradient-to-r from-blue-500 to-blue-700 animate-pulse-glow"></div>
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="text-xs uppercase tracking-wider font-bold bg-white/5 text-white/60 border-white/10">
                  {project.serviceType || "General"}
                </Badge>
                <Select 
                  value={project.status || "pitch"} 
                  onValueChange={async (val) => {
                    await updateDoc(doc(db, "projects", id as string), { status: val });
                  }}
                  disabled={!canAccess(currentRole || "employee", "CREATE_PROJECT")}
                >
                  <SelectTrigger className={`h-7 w-32 text-xs uppercase tracking-wider font-bold shadow-none border-transparent rounded-full px-3 ${statusColors[project.status] || statusColors.pitch}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1f3c] border-white/10 text-white">
                    <SelectItem value="pitch">Pitch</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">{project.name}</h1>
              <p className="text-lg text-white/60 max-w-2xl">{project.description || "No description provided for this project."}</p>
              
              <div className="flex flex-wrap gap-6 text-sm text-white/40 mt-6 pt-6 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span>Started: {project.startDate ? new Date(project.startDate).toLocaleDateString() : 'N/A'}</span>
                </div>
                {project.endDate && (
                  <div className="flex items-center gap-2 text-blue-300 font-medium">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <span>Deadline: {new Date(project.endDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Progress Ring and Actions */}
            <div className="shrink-0 flex flex-col items-center justify-center gap-4">
              <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/[0.06] min-w-[200px] flex flex-col items-center">
                <ProgressRing progress={progress} />
                <p className="text-xs font-bold text-white/40 uppercase tracking-wider mt-4">Project Health</p>
              </div>
              
              {currentRole === "founder" && (
                <button 
                  onClick={handleDeleteProject}
                  className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-red-500/20 transition-colors"
                >
                  Delete Project
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-white/5 border border-white/10 w-full justify-start h-auto p-1 overflow-x-auto flex-wrap shadow-sm rounded-xl mb-6">
              <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 rounded-lg">Overview</TabsTrigger>
              <TabsTrigger value="tasks" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 rounded-lg">Tasks</TabsTrigger>
              <TabsTrigger value="files" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 rounded-lg">Files</TabsTrigger>
              <TabsTrigger value="notes" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 rounded-lg">Internal Notes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-6 m-0">
              <Card className="border-white/10 bg-white/[0.02] shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg text-white">Milestone Timeline & Stages</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Timeline representation */}
                  <div className="relative border-l border-white/10 ml-4 pl-6 space-y-6">
                    {milestones.length === 0 ? (
                      <p className="text-xs text-white/40 italic">No milestones defined yet. Use the tool below to map project stages.</p>
                    ) : (
                      milestones.map((m: any) => (
                        <div key={m.id} className="relative group">
                          {/* Dot status */}
                          <div className={cn(
                            "absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                            m.completed 
                              ? "bg-emerald-500 border-emerald-400 text-white" 
                              : "bg-[#0d1f3c] border-white/20 text-transparent"
                          )}>
                            {m.completed && <Check className="h-2.5 w-2.5" />}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => handleToggleMilestone(m.id, m.completed)}
                                className={cn(
                                  "text-sm font-bold transition-all text-left",
                                  m.completed ? "text-white/40 line-through" : "text-white hover:text-blue-400"
                                )}
                              >
                                {m.title}
                              </button>
                              {m.dueDate && (
                                <span className="text-[10px] text-white/40 font-semibold font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                                  Due: {new Date(m.dueDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            {/* Delete Milestones (Managers and above) */}
                            {canAccess(currentRole || "employee", "CREATE_PROJECT") && (
                              <button 
                                onClick={() => handleDeleteMilestone(m.id)}
                                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                title="Remove Milestone"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Milestone Inline Form (Manager and above) */}
                  {canAccess(currentRole || "employee", "CREATE_PROJECT") && (
                    <form onSubmit={handleAddMilestone} className="pt-4 border-t border-white/5 flex flex-wrap md:flex-nowrap gap-3 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">New Stage/Milestone</Label>
                        <Input 
                          placeholder="e.g. Design Handover & Client Approval" 
                          value={newMilestoneTitle}
                          onChange={e => setNewMilestoneTitle(e.target.value)}
                          className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/20 text-xs h-9"
                        />
                      </div>
                      <div className="w-full md:w-44 space-y-1">
                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Target Date</Label>
                        <Input 
                          type="date"
                          value={newMilestoneDate}
                          onChange={e => setNewMilestoneDate(e.target.value)}
                          className="bg-white/[0.03] border-white/10 text-white text-xs h-9 animate-none"
                        />
                      </div>
                      <Button type="submit" className="h-9 px-4 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-bold border border-blue-500/20 text-xs shrink-0 cursor-pointer">
                        Add Milestone
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>

              {["founder", "c_suite", "manager"].includes(role || "") && project.budget && (
                <Card className="border-white/10 shadow-sm bg-white/[0.02]">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Budget Tracking</h3>
                      <span className="text-sm font-bold text-white">{parseInt(project.budget).toLocaleString()} {compCurrency}</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: "45%" }}></div>
                    </div>
                    <p className="text-xs text-white/40 text-right">45% Consumed</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="tasks" className="m-0 space-y-6">
              <Card className="border-white/10 shadow-sm bg-white/[0.02]">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-indigo-500" />
                      Project Deliverables & Tasks
                    </h3>
                    <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/20 font-bold px-2.5 py-0.5 rounded-full">
                      {projectTasks.length} Total Tasks
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {projectTasks.length === 0 ? (
                      <p className="text-xs text-white/40 italic p-6 text-center">No tasks linked to this project yet.</p>
                    ) : (
                      projectTasks.map((t: any) => {
                        const isTaskDone = t.status === "done";
                        return (
                          <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => handleToggleTaskStatus(t.id, t.status)}
                                className={cn(
                                  "w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                                  isTaskDone 
                                    ? "bg-indigo-600 border-indigo-500 text-white" 
                                    : "border-white/20 bg-transparent text-transparent"
                                )}
                              >
                                {isTaskDone && <Check className="h-3.5 w-3.5" />}
                              </button>
                              <div>
                                <span className={cn(
                                  "text-xs font-bold block",
                                  isTaskDone ? "text-white/40 line-through" : "text-white"
                                )}>
                                  {t.title}
                                </span>
                                {t.dueDate && (
                                  <span className="text-[10px] text-white/40 font-mono">Due: {new Date(t.dueDate).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={cn(
                                "text-[9px] uppercase tracking-wider px-2 py-0.5 font-bold rounded-full shadow-none border",
                                t.status === "done" 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : t.status === "in_progress"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : "bg-white/5 text-white/60 border-white/10"
                              )}>
                                {t.status === "in_progress" ? "In Progress" : t.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Inline Task Form */}
                  <form onSubmit={handleAddProjectTask} className="pt-4 border-t border-white/5 flex gap-3 items-end">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Fast-Create Connected Task</Label>
                      <Input 
                        placeholder="e.g. Design Wireframes for Checkout" 
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/20 text-xs h-9"
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Priority</Label>
                      <select 
                        value={newTaskPriority}
                        onChange={e => setNewTaskPriority(e.target.value as any)}
                        className="w-full h-9 border border-white/10 rounded-xl px-2 text-xs bg-[#0d1f3c] text-white font-semibold focus:border-indigo-500/60 focus:ring-0"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <Button type="submit" className="h-9 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/20 text-xs shrink-0 cursor-pointer">
                      Add Task
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="files" className="m-0">
              <Card className="border-white/10 shadow-sm">
                <CardContent className="py-12 flex flex-col items-center text-center">
                   <div className="h-16 w-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                     <FileText className="h-8 w-8 text-white/30" />
                   </div>
                   <h3 className="font-bold text-white text-lg">Document Vault</h3>
                   <p className="text-white/40 mt-1 max-w-sm">Files and assets related to this project will appear here.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Rail */}
        <div className="space-y-6">
          {/* Team Stack */}
          <Card className="border-white/10 shadow-sm">
            <CardHeader className="pb-3 border-b border-white/5">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base text-white">Project Team</CardTitle>
                <span className="text-xs font-bold text-white/40 bg-white/5 px-2 py-1 rounded-md">{project.memberIds?.length || 0}</span>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Manager */}
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Lead</p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-white/10 shadow-sm">
                    <AvatarImage src={employees.find(e => e.id === project.managerId)?.profilePhotoURL || ""} />
                    <AvatarFallback className="bg-white/5 text-white/60 text-xs">
                      {employees.find(e => e.id === project.managerId)?.fullName?.charAt(0) || "M"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-bold text-white/80">
                      {employees.find(e => e.id === project.managerId)?.fullName || "Unassigned"}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Members */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Members</p>
                  
                  {canAccess(currentRole || "employee", "CREATE_PROJECT") && (
                    <Dialog>
                      <DialogTrigger className="text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider flex items-center gap-1 transition-colors">
                        <Plus className="h-3 w-3" /> Assign
                      </DialogTrigger>
                      <DialogContent className="bg-[#0d1f3c] border-white/10 text-white sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle className="text-white">Assign Team Members</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                            <Input 
                              placeholder="Search employees..." 
                              value={searchEmp}
                              onChange={(e) => setSearchEmp(e.target.value)}
                              className="pl-9 bg-white/[0.03] border-white/10 text-white placeholder:text-white/40" 
                            />
                          </div>
                          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                            {employees.filter(e => e.fullName?.toLowerCase().includes(searchEmp.toLowerCase())).map(emp => {
                              const isAssigned = project.memberIds?.includes(emp.id);
                              return (
                                <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="bg-blue-800 text-blue-200 text-xs">{emp.fullName?.charAt(0) || "U"}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-bold text-white">{emp.fullName}</p>
                                      <p className="text-[10px] text-white/40 uppercase tracking-wider">{emp.role}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleToggleMember(emp.id)}
                                    className={cn(
                                      "px-3 py-1 rounded-md text-xs font-bold transition-colors",
                                      isAssigned ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                                    )}
                                  >
                                    {isAssigned ? "Remove" : "Add"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                
                <div className="flex -space-x-2 overflow-hidden">
                  {project.memberIds?.length > 0 ? (
                    project.memberIds.slice(0, 4).map((id: string) => {
                      const emp = employees.find(e => e.id === id);
                      return (
                        <Avatar key={id} className="inline-block border-2 border-[#0d1f3c] h-8 w-8 shadow-sm" title={emp?.fullName || "User"}>
                          <AvatarFallback className="bg-blue-600 text-blue-100 text-xs font-bold">
                            {emp?.fullName?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                      );
                    })
                  ) : (
                    <p className="text-xs text-white/40 italic mt-1">No members assigned.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card className="border-white/10 shadow-sm">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-base text-white">Activity Feed</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-white/5">
                <div className="p-6 text-center text-xs text-white/40 italic">
                  No recent activity logged.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
