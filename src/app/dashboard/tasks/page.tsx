"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, MessageSquare, CheckSquare, Target, Lock, Play, Kanban as KanbanIcon, Trash2, Download, Send, Hourglass, CheckCircle2, RotateCcw, AlertTriangle, Paperclip } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  description?: string;
  projectId: string;
  projectName?: string;
  assignedTo: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  createdAt: any;
  blocked?: boolean;
  remarks?: TaskRemark[];
  /** ISO string set the moment the employee submits the task for review. */
  submittedAt?: string;
  /** Feedback provided by admin when sending back for recheck. */
  feedback?: string | null;
  timeSpent?: string;
  attachments?: string[];
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

const STATUS_META: Record<TaskStatus, { label: string; badgeClass: string; dotClass: string; icon: any }> = {
  backlog: {
    label: "Not Started",
    badgeClass: "bg-muted/60 border border-border text-foreground/50",
    dotClass: "bg-foreground/30",
    icon: null,
  },
  in_progress: {
    label: "In Progress",
    badgeClass: "bg-primary/10 border border-primary/20 text-primary",
    dotClass: "bg-primary",
    icon: null,
  },
  review: {
    label: "Under Review",
    badgeClass: "bg-amber-950/40 border border-amber-500/20 text-amber-300",
    dotClass: "bg-amber-500",
    icon: Hourglass,
  },
  done: {
    label: "Approved",
    badgeClass: "bg-emerald-950/40 border border-emerald-500/20 text-emerald-300",
    dotClass: "bg-emerald-500",
    icon: CheckCircle2,
  },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn("badge font-bold text-xs py-0.5 px-2 uppercase tracking-wider inline-flex items-center gap-1.5 rounded-lg", meta.badgeClass)}>
      {Icon ? <Icon className="w-3 h-3" /> : <span className={cn("w-1.5 h-1.5 rounded-full", meta.dotClass)} />}
      {meta.label}
    </span>
  );
}

export default function TaskBoard() {
  const { user, role } = useAuth();

  // Role Breakdown & Hierarchy Checks
  const userRole = (role || "").toLowerCase();
  const isCSuiteOrAdmin = ["admin", "founder", "c_suite", "system_admin"].includes(userRole);
  const isManagerOrSenior = ["senior_employee", "manager", "team_lead"].includes(userRole);

  // Dynamic Button Label based on Role
  const getAddTaskBtnLabel = () => {
    if (isCSuiteOrAdmin) return "Assign Task to Employees";
    if (isManagerOrSenior) return "Assign task to Myself / Juniors";
    return "Assign task to myself";
  };

  const [tasks, setTasks] = useState<Record<TaskStatus, Task[]>>({
    backlog: [],
    in_progress: [],
    review: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  
  // Team / Mine Toggle is available for ALL roles
  const [myTasksOnly, setMyTasksOnly] = useState(!isCSuiteOrAdmin);
  const [focusMode, setFocusMode] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  
  // Add Task Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "normal" as TaskPriority, dueDate: "", assignedTo: "" });
  const [employeesByDept, setEmployeesByDept] = useState<Record<string, any[]>>({});
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus>("backlog");

  // Selected Task details & Remarks state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [newRemark, setNewRemark] = useState("");
  const [isSubmittingRemark, setIsSubmittingRemark] = useState(false);

  // Submit-for-Review confirmation dialog (Employee)
  const [isSubmitReviewOpen, setIsSubmitReviewOpen] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Recheck Modal State (Admin)
  const [isRecheckOpen, setIsRecheckOpen] = useState(false);
  const [recheckFeedback, setRecheckFeedback] = useState("");
  const [recheckError, setRecheckError] = useState(false);
  const [isSubmittingRecheck, setIsSubmittingRecheck] = useState(false);

  // Reactive lookup of active task to keep remarks/details modal real-time responsive
  const activeTask = selectedTask ?
    Object.values(tasks).flat().find(t => t.id === selectedTask.id) :
    null;

  // Task locking: ALL drag-and-drop is locked for non-admins.
  // Employees MUST use the Start Task / Completed Task buttons to progress tasks.
  const isLocked = (t: Task) => !isCSuiteOrAdmin;
  const isOwner = (t: Task) => !!user && t.assignedTo === user.uid;

  // Filter juniors for Senior Employees / Managers
  const juniorEmployees = employeesList.filter(emp => {
    const r = (emp.role || "").toLowerCase();
    return r === "intern" || r === "employee" || !r;
  });

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeTask || !newRemark.trim()) return;
    if (isLocked(activeTask)) return;

    setIsSubmittingRemark(true);
    try {
      const docRef = doc(db, "tasks", activeTask.id);
      const updatedRemarks = [...(activeTask.remarks || []), {
        id: Math.random().toString(36).substring(2, 9),
        text: newRemark.trim(),
        authorId: user.uid,
        authorName: user.fullName || user.displayName || (isCSuiteOrAdmin ? "Admin" : "Employee"),
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
      let assigneeId = user.uid;
      if (isCSuiteOrAdmin) {
        assigneeId = newTask.assignedTo || user.uid;
      } else if (isManagerOrSenior) {
        assigneeId = newTask.assignedTo || user.uid;
      } else {
        assigneeId = user.uid;
      }

      const assigneeEmp = employeesList.find(emp => emp.id === assigneeId) || {
        fullName: user.fullName || user.displayName || "Employee",
        email: user.email || ""
      };

      await addDoc(collection(db, "tasks"), {
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        projectId: "general",
        projectName: "General",
        assignedTo: assigneeId,
        status: "backlog",
        priority: newTask.priority,
        dueDate: newTask.dueDate || null,
        createdAt: serverTimestamp(),
        blocked: false,
      });

      // EMAIL & NOTIFICATION MODULE
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
      setNewTask({ title: "", description: "", priority: "normal", dueDate: "", assignedTo: user.uid });
    } catch (error) {
      console.error("Error adding task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Backlog -> In Progress. Start Task action strictly moves task to in_progress */
  const handleStartTask = async (taskId: string) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: "in_progress" });
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error starting task:", err);
    }
  };

  /** Open Submit for Review modal */
  const openSubmitReviewConfirm = (task: Task) => {
    setSelectedTask(task);
    setIsSubmitReviewOpen(true);
  };

  /** In Progress -> Review. Submit completed task for review. */
  const handleConfirmSubmitForReview = async () => {
    if (!activeTask) return;
    setIsSubmittingReview(true);
    try {
      await updateDoc(doc(db, "tasks", activeTask.id), {
        status: "review",
        submittedAt: new Date().toISOString(),
      });
      setIsSubmitReviewOpen(false);
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error submitting task for review:", err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  /** ADMIN ACTION: Approve -> Done */
  const handleApproveTask = async (taskId: string) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), {
        status: "done",
        feedback: null
      });
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error approving task:", err);
    }
  };

  /** ADMIN ACTION: Open Recheck Modal */
  const openRecheckModal = (task: Task) => {
    setSelectedTask(task);
    setRecheckFeedback("");
    setRecheckError(false);
    setIsRecheckOpen(true);
  };

  /** ADMIN ACTION: Recheck -> Send back to In Progress with mandatory feedback */
  const handleConfirmRecheck = async () => {
    if (!activeTask) return;
    if (!recheckFeedback.trim()) {
      setRecheckError(true);
      return;
    }

    setIsSubmittingRecheck(true);
    try {
      const updatedRemarks = [...(activeTask.remarks || []), {
        id: Math.random().toString(36).substring(2, 9),
        text: `Recheck requested: ${recheckFeedback.trim()}`,
        authorId: user?.uid || "admin",
        authorName: user?.fullName || user?.displayName || "Admin",
        createdAt: new Date().toISOString()
      }];

      await updateDoc(doc(db, "tasks", activeTask.id), {
        status: "in_progress",
        feedback: recheckFeedback.trim(),
        remarks: updatedRemarks
      });

      setIsRecheckOpen(false);
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error sending task back for recheck:", err);
    } finally {
      setIsSubmittingRecheck(false);
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
        let columnTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];

        if (employeeFilter !== "all" && isCSuiteOrAdmin && !myTasksOnly) {
          columnTasks = columnTasks.filter(t => t.assignedTo === employeeFilter);
        }

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
  }, [user, myTasksOnly, employeeFilter, isCSuiteOrAdmin]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;

    // Drag-and-drop is fully disabled for non-admins — all task progression
    // must happen via the Start Task / Completed Task buttons.
    if (!isCSuiteOrAdmin) return;

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
      assigneeName: employeesMap.get(t.assignedTo) || "Unassigned",
      statusLabel: STATUS_META[t.status].label,
    }));
    downloadCSV(
      formatted,
      ["Task Title", "Project Name", "Assignee Name", "Priority", "Status", "Blocked", "Due Date"],
      ["title", "projectName", "assigneeName", "priority", "statusLabel", "blocked", "dueDate"],
      "Mints_Global_Tasks_Kanban.csv"
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] text-foreground">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <KanbanIcon className="h-5 w-5 text-primary" /> Tasks
          </h1>
          <p className="text-xs text-foreground/40 mt-1">Manage tasks across active projects.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          {/* TEAM / MINE TOGGLE BUTTON — AVAILABLE FOR ALL ROLES */}
          {!focusMode && (
            <div className="flex items-center space-x-2 px-3.5 h-9 rounded-xl border border-border text-xs">
              <span className={myTasksOnly ? "text-foreground/40 font-bold" : "font-bold text-foreground"}>Team</span>
              <button
                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${myTasksOnly ? 'bg-primary shadow-sm' : 'bg-muted/80'}`}
                onClick={() => setMyTasksOnly(!myTasksOnly)}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 shadow-sm transition-all ${myTasksOnly ? 'left-5' : 'left-0.5'}`} />
              </button>
              <span className={myTasksOnly ? "font-bold text-foreground" : "text-foreground/40 font-bold"}>Mine</span>
            </div>
          )}

          {/* ADMIN ONLY: All Employee Filter Dropdown near Export CSV */}
          {isCSuiteOrAdmin && !focusMode && !myTasksOnly && (
           <Select
  value={employeeFilter}
  onValueChange={(val) => setEmployeeFilter(val ?? "all")}
>
              <SelectTrigger className="h-9 w-44 border-border text-xs font-bold">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border text-foreground text-xs">
                <SelectItem value="all">All employees</SelectItem>
                {employeesList.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              setNewTask(prev => ({ ...prev, assignedTo: user?.uid || "" }));
              setIsAddOpen(true);
            }}
            className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer"
          >
            <Plus className="mr-1.5 h-4 w-4" /> {getAddTaskBtnLabel()}
          </button>
        </div>
      </div>

      {/* 4 STATS CARDS SECTION (C-Suite, Founder / Admin, System Admin) */}
      {isCSuiteOrAdmin && !focusMode && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-foreground/50 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Active Tasks
            </div>
            <div className="text-2xl font-extrabold text-foreground mt-2">
              {tasks.backlog.length + tasks.in_progress.length}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-foreground/50 uppercase tracking-wider">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Awaiting Review
            </div>
            <div className="text-2xl font-extrabold text-foreground mt-2">
              {tasks.review.length}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-foreground/50 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Overdue
            </div>
            <div className="text-2xl font-extrabold text-foreground mt-2">
              {[...tasks.backlog, ...tasks.in_progress].filter(t => isOverdue(t.dueDate)).length}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-foreground/50 uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Approved
            </div>
            <div className="text-2xl font-extrabold text-foreground mt-2">
              {tasks.done.length}
            </div>
          </div>
        </div>
      )}

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
                        className={cn("bg-card border border-border shadow-sm rounded-lg overflow-hidden relative group cursor-pointer hover:border-primary/30 transition-all",
                          task.priority === "urgent" ? "border-rose-500/30" : "",
                          task.blocked ? "opacity-60" : ""
                        )}
                      >
                        {task.priority === "urgent" && !task.blocked && (
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                        )}
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            <div className="flex-1">
                               <div className="flex items-center justify-between mb-1.5">
                                 <div className="flex items-center gap-2">
                                   <span className="badge border border-border text-foreground/50 text-xs font-bold py-0.5 uppercase tracking-wider">
                                     {task.projectName || "Project"}
                                   </span>
                                   {task.priority === "urgent" && <span className="badge status-critical font-bold text-xs py-0.5 uppercase tracking-wider">Urgent</span>}
                                   {task.blocked && <span className="badge status-draft font-bold text-xs py-0.5 uppercase tracking-wider flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Blocked</span>}
                                   {task.status === "review" && <StatusBadge status="review" />}
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
                                {task.status === "backlog" && isOwner(task) && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStartTask(task.id); }}
                                    className="ml-auto btn-ghost py-1 px-3 h-7 text-xs font-bold flex items-center gap-1 border-border text-foreground/70 hover:text-foreground cursor-pointer"
                                  >
                                    <Play className="w-2.5 h-2.5 fill-current text-accent" /> Start
                                  </button>
                                )}
                                {task.status === "in_progress" && isOwner(task) && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openSubmitReviewConfirm(task); }}
                                    className="ml-auto btn-primary py-1 px-3 h-7 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Send className="w-2.5 h-2.5" /> Completed Task
                                  </button>
                                )}
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
                        {/* BACKLOG ONLY: Add Task Button dynamically styled for the user role */}
                        {column.id === "backlog" && (
                          <button
                            onClick={() => {
                              setAddingToStatus("backlog");
                              setNewTask(prev => ({ ...prev, assignedTo: user?.uid || "" }));
                              setIsAddOpen(true);
                            }}
                            className="w-full text-foreground/50 hover:text-foreground justify-start h-8 px-2.5 text-xs mb-3 rounded-xl transition-all font-bold border border-dashed border-border/60 hover:border-primary/50 flex items-center cursor-pointer bg-card/40 hover:bg-card truncate"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1.5 text-primary shrink-0" />
                            <span className="truncate">{getAddTaskBtnLabel()}</span>
                          </button>
                        )}

                        {tasks[column.id].map((task, index) => {
                          const locked = isLocked(task);
                          const assigneeName = employeesList.find(e => e.id === task.assignedTo)?.fullName || "Unassigned";

                          return (
                          <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={locked}>
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
                                  task.priority === "urgent" && "border-rose-500/20",
                                  locked && "cursor-default"
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
                                    {(!locked || isCSuiteOrAdmin) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteTask(task.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 text-rose-400 rounded cursor-pointer shrink-0"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>

                                  <p className="text-xs font-bold text-foreground mb-2 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                                    {task.title}
                                  </p>

                                  {/* Feedback Alert for Employee if sent back for recheck */}
                                  {task.feedback && task.status === "in_progress" && (
                                    <div className="mb-2 p-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-1.5 font-medium">
                                      <AlertTriangle className="w-3 h-3 shrink-0 text-rose-400" />
                                      <span className="truncate">Recheck: {task.feedback}</span>
                                    </div>
                                  )}

                                  {(task.status === "review" || task.status === "done") && (
                                    <div className="mb-3"><StatusBadge status={task.status} /></div>
                                  )}

                                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                                    <div className="flex items-center gap-2 text-foreground/40 text-xs font-bold">
                                      <span className="text-[11px] text-foreground/60">{assigneeName}</span>
                                      {/* Hide remarks counter on backlog tasks */}
                                      {task.status !== "backlog" && task.remarks && task.remarks.length > 0 && (
                                        <div className="flex items-center gap-0.5 text-foreground/40">
                                          <MessageSquare className="w-3 h-3 text-primary" /> {task.remarks.length}
                                        </div>
                                      )}
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
                                      <Avatar className="w-5 h-5 border border-border shadow-sm" title={assigneeName}>
                                        <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary/70">
                                          {assigneeName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    </div>
                                  </div>

                                  {/* Employee Actions */}
                                  {task.status === "backlog" && isOwner(task) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleStartTask(task.id); }}
                                      className="btn-ghost w-full mt-3 h-8 text-xs font-bold flex items-center justify-center gap-1.5 border-border text-foreground/70 hover:text-foreground cursor-pointer"
                                    >
                                      <Play className="w-3 h-3 fill-current text-accent" /> Start Task
                                    </button>
                                  )}
                                  {task.status === "in_progress" && isOwner(task) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openSubmitReviewConfirm(task); }}
                                      className="btn-primary w-full mt-3 h-8 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                      <Send className="w-3 h-3" /> Completed Task
                                    </button>
                                  )}

                                  {/* ADMIN REVIEW ACTIONS (In Review Column) */}
                                  {task.status === "review" && isCSuiteOrAdmin && (
                                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-border/40">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleApproveTask(task.id); }}
                                        className="h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                      >
                                        <CheckCircle2 className="w-3 h-3" /> Approve
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openRecheckModal(task); }}
                                        className="h-7 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                      >
                                        <RotateCcw className="w-3 h-3" /> Recheck
                                      </button>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        </div>
      )}

      {/* ADD TASK MODAL */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl">
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
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Description</label>
              <Textarea
                placeholder="Short description or details..."
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                className="border-border text-foreground placeholder:text-foreground/30 min-h-[70px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Assign To</label>
              {isCSuiteOrAdmin ? (
                <Select
                  value={newTask.assignedTo || user?.uid || ""}
                 onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val ?? "" })}
                >
                  <SelectTrigger className="w-full border-border text-foreground h-9">
                    <SelectValue placeholder="Select Employee" />
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
              ) : isManagerOrSenior ? (
                <Select
                  value={newTask.assignedTo || user?.uid || ""}
                  onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val ?? "" })}
                >
                  <SelectTrigger className="w-full border-border text-foreground h-9">
                    <SelectValue placeholder="Select Myself or Junior" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                    <SelectItem value={user?.uid || ""}>Assign to me ({user?.fullName || "Me"})</SelectItem>
                    <SelectGroup>
                      <SelectLabel className="font-bold text-primary">Junior Team Members</SelectLabel>
                      {juniorEmployees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.fullName} {emp.jobTitle ? `- ${emp.jobTitle}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={user?.uid || ""}
                  disabled={true}
                  onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val as string })}
                >
                  <SelectTrigger className="w-full border-border text-foreground h-9 bg-muted/30 cursor-not-allowed">
                    <SelectValue placeholder="Assign to me" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value={user?.uid || ""}>
                      Assign to me ({user?.fullName || user?.displayName || "Me"})
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Priority</label>
                <Select
                  value={newTask.priority}
                  onValueChange={(val) => setNewTask({ ...newTask, priority: val as TaskPriority })}
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

      {/* TASK DETAILS & REMARKS DRAWER (WITH BLUR BACKDROP) */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-lg backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="badge border border-border text-foreground/50 text-xs font-bold py-0.5 uppercase tracking-wider">
                {activeTask?.projectName || "General"}
              </span>
              <div className={`w-1.5 h-1.5 rounded-full ${activeTask ? PRIORITY_COLORS[activeTask.priority] : ''}`} />
              <span className="text-xs font-bold uppercase text-foreground/40">{activeTask?.priority} Priority</span>
              {activeTask && <StatusBadge status={activeTask.status} />}
            </div>
            <DialogTitle className="text-base font-extrabold text-foreground leading-tight">
              {activeTask?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-3">
            {activeTask?.description && (
              <div className="p-3 border border-border/80 bg-background/50 rounded-xl text-xs text-foreground/80 leading-relaxed">
                {activeTask.description}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 border border-border p-3 rounded-xl text-xs">
              <div>
                <span className="text-foreground/40 block mb-0.5">Assigned To:</span>
                <span className="font-bold text-foreground flex items-center gap-1">
                  {activeTask ? (employeesList.find(e => e.id === activeTask.assignedTo)?.fullName || "Unassigned") : "Unassigned"}
                </span>
              </div>
              <div>
                <span className="text-foreground/40 block mb-0.5">Time Spent:</span>
                <span className="font-bold text-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3 text-primary" />
                  {activeTask?.timeSpent || "0h"}
                </span>
              </div>
              <div>
                <span className="text-foreground/40 block mb-0.5">Due Date:</span>
                <span className="font-bold text-foreground flex items-center gap-1">
                  {activeTask?.dueDate ? new Date(activeTask.dueDate).toLocaleDateString() : "No deadline"}
                </span>
              </div>
            </div>

            {activeTask?.feedback && (
              <div className="border border-rose-500/40 bg-rose-950/40 rounded-xl p-3 text-xs text-rose-300 font-medium space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-400">
                  <AlertTriangle className="w-4 h-4" /> Sent Back for Recheck:
                </div>
                <p className="leading-relaxed pl-5">{activeTask.feedback}</p>
              </div>
            )}

            {activeTask?.status === "review" && (
              <div className="border border-amber-500/20 bg-amber-950/20 rounded-xl p-3 text-xs text-amber-300 font-medium flex items-start gap-2">
                <Hourglass className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This task is waiting on admin review{activeTask.submittedAt ? ` (submitted ${new Date(activeTask.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})` : ""}.
              </div>
            )}
            {activeTask?.status === "done" && (
              <div className="border border-emerald-500/20 bg-emerald-950/20 rounded-xl p-3 text-xs text-emerald-300 font-medium flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This task has been approved by admin. Nice work!
              </div>
            )}

            {/* Attachments — HIDDEN for Backlog */}
            {activeTask?.status !== "backlog" && (
              <div>
                <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-primary" /> Attachments
                </h4>
                <div className="p-2.5 border border-border rounded-xl text-xs text-foreground/50">
                  {activeTask?.attachments && activeTask.attachments.length > 0 ? (
                    activeTask.attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 text-foreground/80 py-0.5">
                        <Paperclip className="w-3 h-3 text-primary" /> {att}
                      </div>
                    ))
                  ) : (
                    "No attachments uploaded."
                  )}
                </div>
              </div>
            )}

            {/* Remarks & Progress Log — HIDDEN for Backlog */}
            {activeTask?.status !== "backlog" && (
              <div>
                <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" /> Remarks & Progress Logs ({activeTask?.remarks?.length || 0})
                </h3>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {!activeTask?.remarks || activeTask.remarks.length === 0 ? (
                    <div className="text-center py-4 text-foreground/20 text-xs font-medium border border-border border-dashed rounded-xl">
                      No remarks logged yet.
                    </div>
                  ) : (
                    activeTask.remarks.map((remark) => (
                      <div key={remark.id} className="border border-border p-2.5 rounded-xl">
                        <div className="flex justify-between items-center mb-1 text-xs font-bold uppercase">
                          <span className="text-primary">{remark.authorName}</span>
                          <span className="text-foreground/30 text-[10px]">{new Date(remark.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed font-medium">{remark.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Add Remark Form — HIDDEN for Backlog & locked tasks */}
            {activeTask && activeTask.status !== "backlog" && !isLocked(activeTask) && (
              <form onSubmit={handleAddRemark} className="space-y-2 border-t border-border pt-3">
                <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider block">Add Progress Remark</label>
                <div className="flex gap-2">
                  <input
                    required
                    placeholder="Describe progress, blockers, or notes..."
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
            )}

            {/* Employee Actions in Drawer */}
            {activeTask?.status === "backlog" && isOwner(activeTask) && (
              <button
                onClick={() => handleStartTask(activeTask.id)}
                className="btn-primary w-full h-10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Play className="w-4 h-4 fill-current" /> Start Task
              </button>
            )}
            {activeTask?.status === "in_progress" && isOwner(activeTask) && (
              <button
                onClick={() => openSubmitReviewConfirm(activeTask)}
                className="btn-primary w-full h-10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Send className="w-4 h-4" /> Completed Task
              </button>
            )}

            {/* Admin Actions in Drawer */}
            {activeTask?.status === "review" && isCSuiteOrAdmin && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-2 border-t border-border">
                <button
                  onClick={() => handleApproveTask(activeTask.id)}
                  className="h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve Task
                </button>
                <button
                  onClick={() => openRecheckModal(activeTask)}
                  className="h-10 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Send for Recheck
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* SUBMIT FOR REVIEW CONFIRMATION DIALOG (Employee) */}
      <Dialog open={isSubmitReviewOpen} onOpenChange={setIsSubmitReviewOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-sm backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle>Complete & Submit Task</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
            Are you sure you want to mark <span className="font-bold text-foreground">{activeTask?.title}</span> as completed and submit it for admin review?
          </p>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button
              type="button"
              onClick={() => setIsSubmitReviewOpen(false)}
              className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors"
              disabled={isSubmittingReview}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmitForReview}
              disabled={isSubmittingReview}
              className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary text-foreground rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> {isSubmittingReview ? "Submitting..." : "Submit Task"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECHECK MODAL (Admin) */}
      <Dialog open={isRecheckOpen} onOpenChange={setIsRecheckOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Send Back for Recheck
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-foreground/60 leading-relaxed">
              Let the employee know exactly what needs to be modified before resubmitting.
            </p>
            <Textarea
              placeholder="Explain what needs to be changed or fixed..."
              value={recheckFeedback}
              onChange={(e) => {
                setRecheckFeedback(e.target.value);
                if (e.target.value.trim()) setRecheckError(false);
              }}
              className="border-border text-foreground placeholder:text-foreground/30 min-h-[100px] text-xs"
            />
            {recheckError && (
              <p className="text-xs text-rose-400 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Feedback is required — please describe what needs to change.
              </p>
            )}
          </div>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button
              type="button"
              onClick={() => setIsRecheckOpen(false)}
              className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors"
              disabled={isSubmittingRecheck}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRecheck}
              disabled={isSubmittingRecheck}
              className="px-4 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {isSubmittingRecheck ? "Sending..." : "Send Back"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}