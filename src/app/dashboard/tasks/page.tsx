"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, MessageSquare, CheckSquare, Target, Lock, Play, Kanban as KanbanIcon, Trash2, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { downloadCSV } from "@/lib/exportUtils";

type TaskStatus = "backlog" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "normal" | "high" | "urgent";

interface TaskRemark {
  id: string;
  text: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  projectId: string;
  projectName?: string;
  assignedTo: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  createdAt: any;
  blocked?: boolean;
  remarks?: TaskRemark[];
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "in_progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
  high: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]",
  normal: "bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]",
  low: "",
};

export default function TaskBoard() {
  const { user, role } = useAuth();
  const [tasks, setTasks] = useState<Record<TaskStatus, Task[]>>({
    backlog: [],
    in_progress: [],
    review: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  const [myTasksOnly, setMyTasksOnly] = useState(role === "intern");
  const [focusMode, setFocusMode] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", priority: "normal" as TaskPriority, dueDate: "", assignedTo: "" });
  const [employeesByDept, setEmployeesByDept] = useState<Record<string, any[]>>({});
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus>("backlog");
  
  // Selected Task details & Remarks state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [newRemark, setNewRemark] = useState("");
  const [isSubmittingRemark, setIsSubmittingRemark] = useState(false);

  // Reactive lookup of active task to keep remarks modal real-time responsive
  const activeTask = selectedTask ? 
    Object.values(tasks).flat().find(t => t.id === selectedTask.id) : 
    null;

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeTask || !newRemark.trim()) return;

    setIsSubmittingRemark(true);
    try {
      const docRef = doc(db, "tasks", activeTask.id);
      const updatedRemarks = [...(activeTask.remarks || []), {
        id: Math.random().toString(36).substring(2, 9),
        text: newRemark.trim(),
        authorId: user.uid,
        authorName: user.fullName || user.displayName || "Mints Member",
        createdAt: new Date().toISOString()
      }];
      
      await updateDoc(docRef, { remarks: updatedRemarks });
      setNewRemark("");
    } catch (err) {
      console.error("Error adding remark:", err);
    } finally {
      setIsSubmittingRemark(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTask.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      const assigneeId = newTask.assignedTo || user.uid;
      const assigneeEmp = employeesList.find(emp => emp.id === assigneeId) || {
        fullName: user.fullName || user.displayName || "Employee",
        email: user.email || ""
      };
      
      await addDoc(collection(db, "tasks"), {
        title: newTask.title.trim(),
        projectId: "general", // Default or fetch from somewhere
        projectName: "General",
        assignedTo: assigneeId,
        status: addingToStatus,
        priority: newTask.priority,
        dueDate: newTask.dueDate || null,
        createdAt: serverTimestamp(),
        blocked: false,
      });

      // Internal secure mail notification
      await addDoc(collection(db, "internal_mails"), {
        senderId: user.uid,
        senderName: user.fullName || user.displayName || "Mints Task Manager",
        senderEmail: user.email || "system@mintsglobal.com",
        receiverId: assigneeId,
        receiverName: assigneeEmp.fullName || "Employee",
        receiverEmail: assigneeEmp.email || "",
        subject: `📋 Task Assigned: ${newTask.title.trim()}`,
        body: `Hello ${assigneeEmp.fullName || "Team Member"},\n\nYou have been assigned a new task on the Mints Global ERP:\n\nTask: ${newTask.title.trim()}\nPriority: ${newTask.priority.toUpperCase()}\nDue Date: ${newTask.dueDate || "No due date set"}\n\nPlease head to your Tasks Kanban Board to manage this task.\n\nBest regards,\n${user.fullName || user.displayName || "Mints Project Management"}`,
        priority: newTask.priority === "urgent" || newTask.priority === "high" ? "urgent" : "normal",
        readStatus: false,
        isStarredByReceiver: false,
        isStarredBySender: false,
        isDeletedBySender: false,
        isDeletedByReceiver: false,
        createdAt: serverTimestamp()
      });

      if (assigneeId !== user.uid) {
        await addDoc(collection(db, "notifications"), {
          userId: assigneeId,
          title: "New Task Assigned",
          message: `You have been assigned a new task: ${newTask.title.trim()}`,
          read: false,
          createdAt: serverTimestamp()
        });

        fetch('/api/discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `📋 **New Task Assigned**\n**Task:** ${newTask.title.trim()}\n**Assigned To ID:** ${assigneeId}`
          })
        }).catch(err => console.error("Discord error:", err));
      }

      setIsAddOpen(false);
      setNewTask({ title: "", priority: "normal", dueDate: "", assignedTo: "" });
    } catch (error) {
      console.error("Error adding task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      const snapshot = await getDocs(collection(db, "employees"));
      const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployeesList(emps);
      const grouped = emps.reduce((acc, emp: any) => {
        const depts = emp.departments || (emp.department ? [emp.department] : ["Unassigned"]);
        depts.forEach((dept: string) => {
          if (!acc[dept]) acc[dept] = [];
          if (!acc[dept].find((e: any) => e.id === emp.id)) acc[dept].push(emp);
        });
        return acc;
      }, {} as Record<string, any[]>);
      setEmployeesByDept(grouped);
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribes: any[] = [];

    COLUMNS.forEach(col => {
      let q;
      if (myTasksOnly) {
        q = query(
          collection(db, "tasks"),
          where("status", "==", col.id),
          where("assignedTo", "==", user.uid)
        );
      } else {
        q = query(
          collection(db, "tasks"),
          where("status", "==", col.id)
        );
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const columnTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
        
        columnTasks.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        setTasks(prev => ({
          ...prev,
          [col.id]: columnTasks
        }));
        
        setLoading(false);
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, myTasksOnly]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;

    const sourceTasks = Array.from(tasks[sourceStatus]);
    const destTasks = sourceStatus === destStatus ? sourceTasks : Array.from(tasks[destStatus]);
    const [movedTask] = sourceTasks.splice(source.index, 1);
    
    movedTask.status = destStatus;
    destTasks.splice(destination.index, 0, movedTask);

    setTasks(prev => ({
      ...prev,
      [sourceStatus]: sourceTasks,
      [destStatus]: destTasks
    }));

    try {
      await updateDoc(doc(db, "tasks", draggableId), {
        status: destStatus
      });
      } catch (err) {
      console.error("Error updating task status:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "tasks", taskId));
      } catch (err) {
        console.error("Error deleting task:", err);
      }
    }
  };

  const isOverdue = (dateString?: string) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date(new Date().setHours(0,0,0,0));
  };

  const isToday = (dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const focusTasks = [
    ...tasks.backlog,
    ...tasks.in_progress,
    ...tasks.review
  ].filter(t => (isToday(t.dueDate) || isOverdue(t.dueDate) || t.priority === "urgent") && t.assignedTo === user?.uid)
   .sort((a, b) => {
     if (a.priority === "urgent" && b.priority !== "urgent") return -1;
     if (b.priority === "urgent" && a.priority !== "urgent") return 1;
     return 0;
   });

  const handleExportCSV = () => {
    const flatList = Object.values(tasks).flat();
    const employeesMap = new Map(employeesList.map(e => [e.id, e.fullName]));
    const formatted = flatList.map(t => ({
      ...t,
      assigneeName: employeesMap.get(t.assignedTo) || "Unassigned"
    }));
    downloadCSV(
      formatted,
      ["Task Title", "Project Name", "Assignee Name", "Priority", "Status", "Blocked", "Due Date"],
      ["title", "projectName", "assigneeName", "priority", "status", "blocked", "dueDate"],
      "Mints_Global_Tasks_Kanban.csv"
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] text-foreground">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <KanbanIcon className="h-5 w-5 text-primary" /> Tasks
          </h1>
          <p className="text-xs text-foreground/40 mt-1">Manage tasks across active projects.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => {
              setFocusMode(!focusMode);
              if (!focusMode && !myTasksOnly) setMyTasksOnly(true);
            }}
            className={cn("px-4 h-9 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-1.5 cursor-pointer border", 
              focusMode 
                ? "bg-primary border-primary text-foreground shadow-sm" 
                : " border-border text-foreground/60 hover:bg-muted/80"
            )}
          >
            <Target className={cn("h-4 w-4", focusMode && "animate-pulse")} />
            {focusMode ? "Exit Focus" : "Focus Mode"}
          </button>

          {!focusMode && (
            <div className="flex items-center space-x-2 px-3.5 h-9 rounded-xl border border-border text-xs">
              <span className={myTasksOnly ? "text-foreground/40 font-bold" : "font-bold text-foreground"}>Team</span>
              <button 
                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${myTasksOnly ? 'bg-primary shadow-sm' : 'bg-muted/80'}`}
                onClick={() => {
                  if (role !== "intern") setMyTasksOnly(!myTasksOnly);
                }}
                disabled={role === "intern"}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 shadow-sm transition-all ${myTasksOnly ? 'left-5' : 'left-0.5'}`} />
              </button>
              <span className={myTasksOnly ? "font-bold text-foreground" : "text-foreground/40 font-bold"}>Mine</span>
            </div>
          )}

          <button 
            onClick={handleExportCSV}
            className="px-4 h-9 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-1.5 cursor-pointer border border-border text-foreground/60 hover:bg-muted/80 hover:text-foreground"
          >
            <Download className="h-4 w-4 text-accent" />
            Export CSV
          </button>

          <button 
            onClick={() => {
              setAddingToStatus("backlog");
              setIsAddOpen(true);
            }}
            className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Task
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <Clock className="h-6 w-6 text-primary animate-spin" />
        </div>
      ) : focusMode ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 border border-border rounded-2xl p-6 flex flex-col items-center overflow-y-auto"
        >
          <div className="max-w-2xl w-full">
            <div className="text-center mb-8">
              <h2 className="text-base font-bold text-foreground">Your Focus for Today</h2>
              <p className="text-xs text-foreground/40 mt-1">Complete these {focusTasks.length} high-priority items.</p>
            </div>

            <div className="space-y-4">
              <AnimatePresence>
                {focusTasks.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 border border-border border-dashed rounded-2xl">
                    <CheckSquare className="h-10 w-10 text-foreground/20 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-foreground/50 uppercase tracking-wider">All caught up!</h3>
                    <p className="text-xs text-foreground/30 mt-1">You have no urgent tasks due today.</p>
                  </motion.div>
                ) : (
                  focusTasks.map((task) => (
                    <motion.div 
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <Card 
                        onClick={() => {
                          setSelectedTask(task);
                          setIsDetailsOpen(true);
                        }}
                        className={cn("bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border relative group cursor-pointer hover:border-primary/30 transition-all", 
                          task.priority === "urgent" ? "border-rose-500/30" : "",
                          task.blocked ? "opacity-60" : ""
                        )}
                      >
                        {task.priority === "urgent" && !task.blocked && (
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                        )}
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            <button className="mt-1 w-5 h-5 rounded border-2 border-border/80 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors shrink-0 cursor-pointer">
                            </button>
                            <div className="flex-1">
                               <div className="flex items-center justify-between mb-1.5">
                                 <div className="flex items-center gap-2">
                                   <span className="badge border border-border text-foreground/50 text-xs font-bold py-0.5 uppercase tracking-wider">
                                     {task.projectName || "Project"}
                                   </span>
                                   {task.priority === "urgent" && <span className="badge status-critical font-bold text-xs py-0.5 uppercase tracking-wider">Urgent</span>}
                                   {task.blocked && <span className="badge status-draft font-bold text-xs py-0.5 uppercase tracking-wider flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Blocked</span>}
                                 </div>
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     handleDeleteTask(task.id);
                                   }} 
                                   className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 text-rose-400 rounded cursor-pointer"
                                 >
                                   <Trash2 className="w-3 h-3" />
                                 </button>
                               </div>
                              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-snug">{task.title}</h3>
                              
                              <div className="flex items-center gap-4 mt-4 text-xs font-bold uppercase tracking-wider">
                                {task.dueDate && (
                                  <div className={cn("flex items-center gap-1 px-2.5 h-6 rounded-lg text-xs font-bold uppercase", 
                                    isOverdue(task.dueDate) ? "bg-rose-950/40 border border-rose-500/20 text-rose-300" : "bg-amber-950/40 border border-amber-500/20 text-amber-300"
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    {isOverdue(task.dueDate) ? "Overdue" : "Due Today"}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-foreground/30 text-xs font-bold">
                                  <CheckSquare className="w-3 h-3 text-primary/80" /> 2/5 Subtasks
                                </div>
                                <button className="ml-auto btn-ghost py-1 px-3 h-7 text-xs font-bold flex items-center gap-1 border-border text-foreground/70 hover:text-foreground cursor-pointer">
                                  <Play className="w-2.5 h-2.5 fill-current text-accent" /> Start
                                </button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Standard Kanban Board */
        <div className="flex-1 overflow-x-auto pb-4">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full gap-6 min-w-max items-start">
              {COLUMNS.map(column => (
                <div key={column.id} className="flex flex-col w-[300px] max-h-full rounded-2xl border border-border shadow-sm shrink-0">
                  <div className="p-3 border-b border-border rounded-t-2xl flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">{column.title}</h3>
                    <Badge className="border border-border text-foreground/60 font-mono text-xs">{tasks[column.id].length}</Badge>
                  </div>
                  
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div 
                        {...provided.droppableProps} 
                        ref={provided.innerRef}
                        className={cn("flex-1 p-3 overflow-y-auto min-h-[400px] transition-colors rounded-b-2xl max-h-[500px]", 
                          snapshot.isDraggingOver ? "bg-primary/5 ring-1 ring-primary/10" : ""
                        )}
                      >
                        {tasks[column.id].map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <Card 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsDetailsOpen(true);
                                }}
                                className={cn("mb-3 cursor-pointer border-border bg-card/80 hover:bg-card transition-all relative overflow-hidden group hover:border-primary/30", 
                                  snapshot.isDragging ? 'shadow-xl ring-1 ring-primary/30 rotate-1 bg-blue-950/90' : 'shadow-sm',
                                  task.priority === "urgent" && "border-rose-500/20"
                                )}
                              >
                                {task.priority === "urgent" && (
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                                )}
                                <CardContent className="p-3 pl-4">
                                  <div className="flex justify-between items-start mb-2 gap-2">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[task.priority]}`} title={`${task.priority} priority`} />
                                      <Badge variant="outline" className="text-xs uppercase font-bold py-0 px-1.5 h-4 text-foreground/50 border-border">
                                        {task.projectName || "Project"}
                                      </Badge>
                                      {task.blocked && <span title="Blocked"><Lock className="w-3 h-3 text-foreground/30" /></span>}
                                    </div>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTask(task.id);
                                      }} 
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 text-rose-400 rounded cursor-pointer shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  
                                  <p className="text-xs font-bold text-foreground mb-3 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                                    {task.title}
                                  </p>
                                  
                                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                                    <div className="flex gap-2 text-foreground/40 text-xs font-bold">
                                      <div className="flex items-center gap-1 hover:text-foreground/70 transition-colors">
                                        <CheckSquare className="w-3 h-3 text-primary" /> {task.status === "done" ? "1/1" : "0/1"}
                                      </div>
                                      <div className="flex items-center gap-1 hover:text-foreground/70 transition-colors">
                                        <MessageSquare className="w-3 h-3 text-primary" /> {task.remarks?.length || 0}
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      {task.dueDate && (
                                        <div className={cn("flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-bold uppercase", 
                                          isOverdue(task.dueDate) ? 'bg-rose-950/40 border border-rose-500/20 text-rose-300' : 
                                          isToday(task.dueDate) ? 'bg-amber-950/40 border border-amber-500/20 text-amber-300' : 
                                          ' text-foreground/50 border border-border'
                                        )}>
                                          <Clock className="w-2.5 h-2.5" />
                                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                      )}
                                      <Avatar className="w-5 h-5 border border-border shadow-sm" title={employeesList.find(e => e.id === task.assignedTo)?.fullName || "Unassigned"}>
                                        <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary/70">
                                          {(() => {
                                            const emp = employeesList.find(e => e.id === task.assignedTo);
                                            if (!emp?.fullName) return "?";
                                            return emp.fullName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
                                          })()}
                                        </AvatarFallback>
                                      </Avatar>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        
                        <button 
                          onClick={() => {
                            setAddingToStatus(column.id as TaskStatus);
                            setIsAddOpen(true);
                          }}
                          className="w-full text-foreground/30 hover:text-foreground justify-start h-8 px-2 text-xs mt-1 hover: rounded-xl transition-all font-bold border border-dashed border-border/30 hover:border-border flex items-center cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a task
                        </button>
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Task Title</label>
              <Input
                required
                placeholder="What needs to be done?"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="border-border text-foreground placeholder:text-foreground/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Assign To</label>
              <Select 
                value={newTask.assignedTo || user?.uid || ""} 
                onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val as string })}
                items={[
                  { value: user?.uid || "", label: "Assign to me" },
                  ...Object.values(employeesByDept).flat().map(emp => ({
                    value: emp.id,
                    label: `${emp.fullName} ${emp.jobTitle ? `- ${emp.jobTitle}` : ""}`
                  }))
                ]}
              >
                <SelectTrigger className="w-full border-border text-foreground h-9">
                  <SelectValue placeholder="Assign task" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                  <SelectItem value={user?.uid || ""}>Assign to me</SelectItem>
                  {Object.entries(employeesByDept).map(([dept, emps]) => (
                    <SelectGroup key={dept}>
                      <SelectLabel className="font-bold text-primary">{dept}</SelectLabel>
                      {emps.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.fullName} {emp.jobTitle ? `- ${emp.jobTitle}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Priority</label>
                <Select 
                  value={newTask.priority} 
                  onValueChange={(val) => setNewTask({ ...newTask, priority: val as TaskPriority })}
                  items={{ low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }}
                >
                  <SelectTrigger className="w-full border-border text-foreground h-9">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Due Date</label>
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="border-border text-foreground placeholder:text-foreground/30"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            </div>
            <DialogFooter className="mt-6 border-t-0 pt-4">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary text-foreground rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
              >
                {isSubmitting ? "Adding..." : "Add Task"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Task Details & Remarks Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge border border-border text-foreground/50 text-xs font-bold py-0.5 uppercase tracking-wider">
                {activeTask?.projectName || "General"}
              </span>
              <div className={`w-1.5 h-1.5 rounded-full ${activeTask ? PRIORITY_COLORS[activeTask.priority] : ''}`} />
              <span className="text-xs font-bold uppercase text-foreground/40">{activeTask?.priority} Priority</span>
            </div>
            <DialogTitle className="text-base font-extrabold text-foreground leading-tight">
              {activeTask?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Task Meta Details */}
            <div className="grid grid-cols-2 gap-4 border border-border p-3 rounded-xl text-xs">
              <div>
                <span className="text-foreground/40 block mb-0.5">Assigned To:</span>
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Avatar className="w-4 h-4 border border-border">
                    <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary/70">
                      {activeTask ? (employeesList.find(e => e.id === activeTask.assignedTo)?.fullName?.substring(0,2).toUpperCase() || "UN") : "UN"}
                    </AvatarFallback>
                  </Avatar>
                  {activeTask ? (employeesList.find(e => e.id === activeTask.assignedTo)?.fullName || "Unassigned") : "Unassigned"}
                </span>
              </div>
              <div>
                <span className="text-foreground/40 block mb-0.5">Due Date:</span>
                <span className="font-bold text-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3 text-primary" />
                  {activeTask?.dueDate ? new Date(activeTask.dueDate).toLocaleDateString() : "No deadline set"}
                </span>
              </div>
            </div>

            {/* Remarks Log */}
            <div>
              <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" /> Remarks & Progress Logs ({activeTask?.remarks?.length || 0})
              </h3>
              
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                {!activeTask?.remarks || activeTask.remarks.length === 0 ? (
                  <div className="text-center py-6 text-foreground/20 text-xs font-medium border border-border border-dashed rounded-xl">
                    No remarks logged yet.
                  </div>
                ) : (
                  activeTask.remarks.map((remark) => (
                    <div key={remark.id} className="border border-border p-3 rounded-xl">
                      <div className="flex justify-between items-center mb-1 text-xs font-bold uppercase">
                        <span className="text-primary">{remark.authorName}</span>
                        <span className="text-foreground/30">{new Date(remark.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                        {remark.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Remark Form */}
            <form onSubmit={handleAddRemark} className="space-y-2 border-t border-border pt-4">
              <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider block">Add Progress Remark</label>
              <div className="flex gap-2">
                <input
                  required
                  placeholder={
                    activeTask?.assignedTo === user?.uid 
                      ? "Describe your progress, blockers, or update..."
                      : "Write a manager note or remark..."
                  }
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  className="flex-grow h-9 rounded-lg border border-border px-3 py-1 text-xs text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <button
                  type="submit"
                  disabled={isSubmittingRemark || !newRemark.trim()}
                  className="px-3 h-9 bg-primary hover:bg-primary disabled:opacity-50 text-foreground rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
                >
                  {isSubmittingRemark ? "..." : "Log"}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
