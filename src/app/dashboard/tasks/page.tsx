
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, deleteDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, MessageSquare, CheckSquare, Target, Lock, Play, Kanban as KanbanIcon, Trash2, Download, Send, Hourglass, CheckCircle2, RotateCcw, AlertTriangle, Paperclip, Check, Pause, X, StickyNote, ListChecks, LogOut, Users, Crown, ShieldCheck, UserPlus, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { downloadCSV } from "@/lib/exportUtils";

const storage = getStorage();

type TaskStatus = "backlog" | "in_progress" | "review" | "done";
type TaskPriority = "Low" | "Normal" | "High" | "Urgent";

interface TaskRemark {
  id: string;
  text: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

interface TaskAttachment {
  name: string;
  url: string;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
}

interface FocusChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface FocusSession {
  startedBy: string;
  startedByName: string;
  startedAt: string;
  resumedAt: string;
  status: "running" | "paused";
  elapsedSeconds: number;
  checklist: FocusChecklistItem[];
  notes: string;
  breakCount: number;
  durationMinutes: number | null;
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
  submittedAt?: string;
  feedback?: string | null;
  timeSpent?: string;
  attachments?: Array<TaskAttachment | string>;
  focusSession?: FocusSession | null;
  isTeamTask?: boolean;
  teamMembers?: string[];
  teamHeads?: string[];
  teamLeaderId?: string;
  // Managers selected by Admin when the team task is created. They can monitor only.
  monitorManagerIds?: string[];
  parentTaskId?: string;
  parentTaskTitle?: string;
  assignedBy?: string;
  assignedByName?: string;
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "in_progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  Urgent: "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
  High: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]",
  Normal: "bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]",
  Low: "",
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

function getSessionElapsedSeconds(session: FocusSession, now: number) {
  if (session.status === "running") {
    const resumedAtMs = new Date(session.resumedAt).getTime();
    return session.elapsedSeconds + Math.max(0, Math.floor((now - resumedAtMs) / 1000));
  }
  return session.elapsedSeconds;
}

function formatFocusDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) return `${hours}h ${remMins}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.max(0, Math.floor(totalSeconds))}s`;
}

function formatFocusTimer(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

//captilizing each first letter (Low, Normal, High, Urgent)
function capitalizeWord(word: string) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default function TaskBoard() {
  const { user, role } = useAuth();

  const userRole = (role || "").toLowerCase();
  const isCSuiteOrAdmin = ["admin", "founder", "c_suite", "system_admin"].includes(userRole);
  const isManager = userRole === "manager";
  const isManagerOrSenior = ["senior_employee", "manager", "team_lead"].includes(userRole);

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

  const [myTasksOnly, setMyTasksOnly] = useState(!(isCSuiteOrAdmin || isManager));
  const [focusMode, setFocusMode] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "Normal" as TaskPriority, dueDate: "", assignedTo: "" });
  const [employeesByDept, setEmployeesByDept] = useState<Record<string, any[]>>({});
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus>("backlog");

  const [assignMode, setAssignMode] = useState<"individual" | "team">("individual");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [teamHeadIds, setTeamHeadIds] = useState<string[]>([]);
  const [teamLeaderId, setTeamLeaderId] = useState<string>("");
  const [monitorManagerIds, setMonitorManagerIds] = useState<string[]>([]);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [newRemark, setNewRemark] = useState("");
  const [isSubmittingRemark, setIsSubmittingRemark] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");

  const [isSubmitReviewOpen, setIsSubmitReviewOpen] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [isRecheckOpen, setIsRecheckOpen] = useState(false);
  //new
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState(false);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [recheckFeedback, setRecheckFeedback] = useState("");
  const [recheckError, setRecheckError] = useState(false);
  const [isSubmittingRecheck, setIsSubmittingRecheck] = useState(false);

  const [inspectTaskId, setInspectTaskId] = useState<string | null>(null);

  // ---- Add Subtask Modal State (Leader / Co-Leader only) -------------------
  const [isAddSubtaskOpen, setIsAddSubtaskOpen] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState({ title: "", description: "", priority: "Normal" as TaskPriority, dueDate: "", assignedTo: "" });
  const [isSubmittingSubtask, setIsSubmittingSubtask] = useState(false);
  // FIX 2: subtask date validation error state
  const [subtaskDateError, setSubtaskDateError] = useState("");

  const [selectedFocusTaskId, setSelectedFocusTaskId] = useState<string | null>(null);

  const [isStartFocusOpen, setIsStartFocusOpen] = useState(false);
  const [focusDurationChoice, setFocusDurationChoice] = useState<"25" | "50" | "none">("25");
  const [focusStartNotes, setFocusStartNotes] = useState("");
  const [isStartingFocus, setIsStartingFocus] = useState(false);

  const [focusWorkspaceTaskId, setFocusWorkspaceTaskId] = useState<string | null>(null);
  const [workspaceNotes, setWorkspaceNotes] = useState("");
  const [workspaceChecklist, setWorkspaceChecklist] = useState<FocusChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [exitFocusTarget, setExitFocusTarget] = useState<Task | null>(null);

  const [nowTick, setNowTick] = useState(() => Date.now());

  const activeTask = selectedTask ?
    Object.values(tasks).flat().find(t => t.id === selectedTask.id) :
    null;

  const [progressTasks, setProgressTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (!isDetailsOpen || !activeTask?.isTeamTask) {
      setProgressTasks([]);
      return;
    }
    const q = query(collection(db, "tasks"), where("parentTaskId", "==", activeTask.id));
    const unsub = onSnapshot(q, (snapshot) => {
      setProgressTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Task[]);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetailsOpen, activeTask?.id, activeTask?.isTeamTask]);

  const memberSubtaskStats = (employeeId: string) => {
    const mine = progressTasks.filter(t => t.assignedTo === employeeId);
    return { done: mine.filter(t => t.status === "done").length, total: mine.length };
  };

  const overallSubtaskStats = () => ({
    done: progressTasks.filter(t => t.status === "done").length,
    total: progressTasks.length,
  });

  const getProgressScope = (task: Task): "full" | "employees" | "overall" | null => {
    if (!task.isTeamTask) return null;
    if (isCSuiteOrAdmin || isTeamLeader(task) || isMonitoringManager(task)) return "full";
    if (isTeamHead(task)) return "employees";
    if (task.teamMembers?.includes(currentAssigneeId || "")) return "overall";
    return null;
  };

  const isLocked = (t: Task) => !isCSuiteOrAdmin;
  const normaliseRole = (value?: string) => (value || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  const authenticatedEmployee = employeesList.find(emp => emp.id === user?.uid);
  const simulatedUserId = (user as any)?.simulatedUserId || (user as any)?.simulationUserId;
  const selectedRoleEmployee = employeesList.find(emp => normaliseRole(emp.role || emp.userRole) === userRole)
    || (userRole === "senior_employee"
      ? employeesList.find(emp => !normaliseRole(emp.role || emp.userRole) && /\bsenior\b/i.test(emp.jobTitle || emp.designation || ""))
      : undefined);
  const currentAssigneeId = simulatedUserId
    ? simulatedUserId
    : isCSuiteOrAdmin
      ? (selectedRoleEmployee?.id || user?.uid)
      : (user?.uid);
  const isOwner = (t: Task) => !!currentAssigneeId && t.assignedTo === currentAssigneeId;

  const canAddRemark = (task: Task) => {
  if (isCSuiteOrAdmin) return true;
  // Main team task (no parentTaskId): only the Team Leader logs progress here,
  // so there's one shared trail everyone on the team can read.
  if (task.isTeamTask && !task.parentTaskId) return isTeamLeader(task);
  // Subtasks and individual tasks: only the assignee (employee, co-leader, or
  // self-assigning leader) can log progress on their own task.
  return task.assignedTo === currentAssigneeId;
};
  // isTeamHead: true for Leader AND Co-Leaders (anyone in teamHeads array)
  const isTeamHead = (t: Task) => !!t.isTeamTask && !!currentAssigneeId && !!t.teamHeads?.includes(currentAssigneeId);
  // isTeamLeader: true ONLY for the designated Leader (teamLeaderId match)
  const isTeamLeader = (t: Task) => !!t.isTeamTask && !!currentAssigneeId && t.teamLeaderId === currentAssigneeId;

  const isMonitoringManager = (task: Task) =>
    isManager && !!currentAssigneeId && !!task.monitorManagerIds?.includes(currentAssigneeId);

  const visibleRemarks = (task: Task) => {
    const viewerId = currentAssigneeId || "";
    const viewerIsLeader = task.teamLeaderId === viewerId;
    const viewerIsCoLeader = !viewerIsLeader && !!task.teamHeads?.includes(viewerId);

    return (task.remarks || []).filter(remark => {
      // Admins and selected monitoring managers see the complete progress log.
      if (isCSuiteOrAdmin || isMonitoringManager(task)) return true;
      if (remark.authorId === viewerId) return true;

      const authorIsLeader = remark.authorId === task.teamLeaderId;
      const authorIsCoLeader = !authorIsLeader && !!task.teamHeads?.includes(remark.authorId);
      const authorIsEmployee = !!task.teamMembers?.includes(remark.authorId) && !authorIsLeader && !authorIsCoLeader;

      // The Leader's remarks are the shared progress trail — visible to the whole team.
      if (authorIsLeader) return true;

      if (viewerIsLeader) return authorIsEmployee || authorIsCoLeader;
      if (viewerIsCoLeader) return authorIsEmployee;
      return false;
    });
  };

  // Admins and selected managers see one chronological timeline on a main team task.
  const remarksForDisplay = (task: Task) => {
    const includeSubtaskLogs = task.isTeamTask && !task.parentTaskId &&
      (isCSuiteOrAdmin || isMonitoringManager(task));
    const sourceTasks = includeSubtaskLogs ? [task, ...progressTasks] : [task];

    return sourceTasks.flatMap(sourceTask => visibleRemarks(sourceTask).map(remark => ({
      remark,
      sourceTitle: sourceTask.id === task.id ? null : sourceTask.title,
    }))).sort((a, b) =>
      new Date(a.remark.createdAt).getTime() - new Date(b.remark.createdAt).getTime()
    );
  };

  const assignableSubtaskTargets = (parent: Task) => {
    const members = parent.teamMembers || [];
    if (isTeamLeader(parent)) return members;
    // Co-Leader: can assign to self or non-head members only
    return members.filter(id => id === currentAssigneeId || !parent.teamHeads?.includes(id));
  };

  const isEligibleLeader = (emp: any) => ["senior_employee", "manager", "team_lead"].includes(normaliseRole(emp?.role || emp?.userRole));

  const managers = useMemo(() => employeesList.filter(emp =>
    normaliseRole(emp.role || emp.userRole) === "manager"
  ), [employeesList]);

  const isSelfAssignedByLeader = (t: Task) => !!t.parentTaskId && !!t.assignedBy && t.assignedTo === t.assignedBy;

  const juniorEmployees = useMemo(() => employeesList
    .filter(emp => {
      const employeeRole = normaliseRole(emp.role || emp.userRole);
      if (employeeRole) return employeeRole === "intern" || employeeRole === "employee";
      const title = `${emp.jobTitle || ""} ${emp.designation || ""}`;
      return !/\b(senior|manager|lead|admin|founder|chief|director)\b/i.test(title);
    })
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")), [employeesList]);

  const [headedTeamTasks, setHeadedTeamTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (!currentAssigneeId) return;
    const q = query(collection(db, "tasks"), where("teamHeads", "array-contains", currentAssigneeId));
    const unsub = onSnapshot(q, (snapshot) => {
      setHeadedTeamTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Task[]);
    });
    return () => unsub();
  }, [currentAssigneeId]);

  const findTeamTaskById = useCallback((id?: string) => {
    if (!id) return null;
    return headedTeamTasks.find(t => t.id === id) || null;
  }, [headedTeamTasks]);

  const canReviewSubtask = useCallback((task: Task) => {
    if (!task.parentTaskId) return false;
    const parent = findTeamTaskById(task.parentTaskId);
    if (!parent) return false;

    const isCurrentUserLeader = parent.teamLeaderId === currentAssigneeId;
    const isCurrentUserCoLeader =!isCurrentUserLeader && !!parent.teamHeads?.includes(currentAssigneeId || "");

    // A task assigned TO a co-leader can ONLY be reviewed by the team leader
    const isAssigneeCoLeader =
      parent.teamLeaderId !== task.assignedTo &&
      !!parent.teamHeads?.includes(task.assignedTo);

    if (isAssigneeCoLeader) {
      return isCurrentUserLeader;
    }

    return isCurrentUserLeader || isCurrentUserCoLeader;
  }, [findTeamTaskById, currentAssigneeId]);

  const canReviewTask = (task: Task) => {
    if (task.status !== "review") return false;
    if (task.parentTaskId) return canReviewSubtask(task);
    return isCSuiteOrAdmin;
  };

  const canViewTask = useCallback((task: Task) => {
    if (isCSuiteOrAdmin || isMonitoringManager(task)) return true;
    if (task.assignedTo === currentAssigneeId) return true;
    if (task.parentTaskId) return canReviewSubtask(task);
    if (task.isTeamTask && task.teamMembers?.includes(currentAssigneeId || "")) return true;
    return isManagerOrSenior && juniorEmployees.some(employee => employee.id === task.assignedTo);
  }, [currentAssigneeId, isCSuiteOrAdmin, isManagerOrSenior, juniorEmployees, canReviewSubtask, isManager, monitorManagerIds]);

  const focusWorkspaceTask = focusWorkspaceTaskId
    ? Object.values(tasks).flat().find(t => t.id === focusWorkspaceTaskId) || null
    : null;

  const myFocusSessionTask = useMemo(
    () => Object.values(tasks).flat().find(t => t.focusSession && t.focusSession.startedBy === currentAssigneeId) || null,
    [tasks, currentAssigneeId]
  );

  useEffect(() => {
    const intervalMs = focusWorkspaceTaskId ? 1000 : 30000;
    const id = setInterval(() => setNowTick(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [focusWorkspaceTaskId]);

  useEffect(() => {
    setSelectedFocusTaskId(null);
  }, [focusMode]);

  useEffect(() => {
    if (focusWorkspaceTask?.focusSession) {
      setWorkspaceNotes(focusWorkspaceTask.focusSession.notes || "");
      setWorkspaceChecklist(focusWorkspaceTask.focusSession.checklist || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusWorkspaceTaskId]);

  useEffect(() => {
    if (!focusWorkspaceTask?.focusSession) return;
    if (workspaceNotes === focusWorkspaceTask.focusSession.notes) return;
    const timeoutId = setTimeout(() => {
      updateDoc(doc(db, "tasks", focusWorkspaceTask.id), { "focusSession.notes": workspaceNotes }).catch(err =>
        console.error("Error saving focus notes:", err)
      );
    }, 700);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceNotes, focusWorkspaceTaskId]);

  const openStartFocusDialog = (task: Task) => {
    const existing = task.focusSession;
    if (existing && existing.startedBy === currentAssigneeId) {
      if (existing.status === "paused") {
        resumeFocusSession(task);
      } else {
        setFocusWorkspaceTaskId(task.id);
      }
      return;
    }
    if (myFocusSessionTask && myFocusSessionTask.id !== task.id) {
      alert(`You already have a focus session running on "${myFocusSessionTask.title}". Finish or exit it before starting a new one.`);
      return;
    }
    setFocusDurationChoice("25");
    setFocusStartNotes("");
    setIsStartFocusOpen(true);
  };

  const handleConfirmStartFocus = async () => {
    const task = focusTasks.find(t => t.id === selectedFocusTaskId);
    if (!task || !user) return;
    setIsStartingFocus(true);
    try {
      const nowIso = new Date().toISOString();
      const session: FocusSession = {
        startedBy: currentAssigneeId || user.uid,
        startedByName: user.fullName || user.displayName || "Team Member",
        startedAt: nowIso,
        resumedAt: nowIso,
        status: "running",
        elapsedSeconds: 0,
        checklist: [],
        notes: focusStartNotes.trim(),
        breakCount: 0,
        durationMinutes: focusDurationChoice === "none" ? null : parseInt(focusDurationChoice, 10),
      };
      await updateDoc(doc(db, "tasks", task.id), {
        status: "in_progress",
        focusSession: session,
      });
      setIsStartFocusOpen(false);
      setSelectedFocusTaskId(null);
      setFocusWorkspaceTaskId(task.id);
    } catch (err) {
      console.error("Error starting focus session:", err);
    } finally {
      setIsStartingFocus(false);
    }
  };

  const resumeFocusSession = async (task: Task) => {
    if (!task.focusSession) return;
    try {
      await updateDoc(doc(db, "tasks", task.id), {
        focusSession: {
          ...task.focusSession,
          status: "running",
          resumedAt: new Date().toISOString(),
        },
      });
      setFocusWorkspaceTaskId(task.id);
    } catch (err) {
      console.error("Error resuming focus session:", err);
    }
  };

  const handlePauseFocusSession = async (task: Task) => {
    if (!task.focusSession) return;
    try {
      const banked = getSessionElapsedSeconds(task.focusSession, Date.now());
      await updateDoc(doc(db, "tasks", task.id), {
        focusSession: {
          ...task.focusSession,
          notes: workspaceNotes,
          checklist: workspaceChecklist,
          status: "paused",
          elapsedSeconds: banked,
          breakCount: (task.focusSession.breakCount || 0) + 1,
        },
      });
      setFocusWorkspaceTaskId(null);
      setFocusMode(false);
    } catch (err) {
      console.error("Error pausing focus session:", err);
    }
  };

  const handleCompleteFocusTask = async (task: Task) => {
    try {
      const skipsReview = isSelfAssignedByLeader(task);
      await updateDoc(doc(db, "tasks", task.id), {
        status: skipsReview ? "done" : "review",
        submittedAt: new Date().toISOString(),
        focusSession: null,
        ...(skipsReview ? { feedback: null } : {}),
      });
      setFocusWorkspaceTaskId(null);
    } catch (err) {
      console.error("Error completing focused task:", err);
    }
  };

  const handleExitFocusSession = async (task: Task) => {
    try {
      await updateDoc(doc(db, "tasks", task.id), {
        focusSession: null,
      });
      setFocusWorkspaceTaskId(null);
      setExitFocusTarget(null);
    } catch (err) {
      console.error("Error exiting focus session:", err);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistText.trim() || !focusWorkspaceTask?.focusSession) return;
    const item: FocusChecklistItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: newChecklistText.trim(),
      done: false,
    };
    const updated = [...workspaceChecklist, item];
    setWorkspaceChecklist(updated);
    setNewChecklistText("");
    try {
      await updateDoc(doc(db, "tasks", focusWorkspaceTask.id), { "focusSession.checklist": updated });
    } catch (err) {
      console.error("Error adding checklist item:", err);
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    if (!focusWorkspaceTask?.focusSession) return;
    const updated = workspaceChecklist.map(i => (i.id === itemId ? { ...i, done: !i.done } : i));
    setWorkspaceChecklist(updated);
    try {
      await updateDoc(doc(db, "tasks", focusWorkspaceTask.id), { "focusSession.checklist": updated });
    } catch (err) {
      console.error("Error updating checklist item:", err);
    }
  };

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeTask || !newRemark.trim()) return;
    if (!canAddRemark(activeTask)) return;

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

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !activeTask || activeTask.status !== "in_progress" || !isOwner(activeTask)) return;

    const allowedExtensions = [".pdf", ".docx", ".xlsx"];
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setAttachmentError("Only PDF, DOCX, and XLSX files can be attached.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError("Attachments must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setAttachmentError("");
    setIsUploadingAttachment(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageRef = ref(storage, `task_attachments/${activeTask.id}/${Date.now()}-${safeName}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      const attachment: TaskAttachment = {
        name: file.name,
        url,
        contentType: file.type,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentAssigneeId || user.uid,
      };
      await updateDoc(doc(db, "tasks", activeTask.id), {
        attachments: [...(activeTask.attachments || []), attachment],
      });
    } catch (error) {
      console.error("Error uploading task attachment:", error);
      setAttachmentError("Upload failed. Please try again.");
    } finally {
      setIsUploadingAttachment(false);
      event.target.value = "";
    }
  };

  const notifyAssignee = async (params: {
    assigneeId: string;
    assigneeEmp: any;
    senderName: string;
    senderEmail: string;
    subject: string;
    body: string;
    priority: TaskPriority;
    notificationTitle: string;
    notificationMessage: string;
  }) => {
    const { assigneeId, assigneeEmp, senderName, senderEmail, subject, body, priority, notificationTitle, notificationMessage } = params;

    await addDoc(collection(db, "internal_mails"), {
      senderId: user?.uid,
      senderName,
      senderEmail,
      receiverId: assigneeId,
      receiverName: assigneeEmp?.fullName || "Employee",
      receiverEmail: assigneeEmp?.email || "",
      subject,
      body,
      priority: priority === "Urgent" || priority === "High" ? "Urgent" : "Normal",
      readStatus: false,
      createdAt: serverTimestamp()
    });

    if (assigneeId !== user?.uid) {
      await addDoc(collection(db, "notifications"), {
        userId: assigneeId,
        title: notificationTitle,
        message: notificationMessage,
        read: false,
        createdAt: serverTimestamp()
      });

      fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `📋 **${notificationTitle}**\n**${notificationMessage}**\n**Assigned To ID:** ${assigneeId}`
        })
      }).catch(err => console.error("Discord error:", err));
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTask.title.trim()) return;

    if (isCSuiteOrAdmin && assignMode === "team") {
      if (teamMemberIds.length === 0) return;
      const leaderId = teamLeaderId;
      const leaderEmp = employeesList.find(emp => emp.id === leaderId);
      if (!leaderId || !leaderEmp || !isEligibleLeader(leaderEmp)) return;

      setIsSubmitting(true);
      try {
        const taskRef = await addDoc(collection(db, "tasks"), {
          title: newTask.title.trim(),
          description: newTask.description.trim() || null,
          projectId: "general",
          projectName: "General",
          assignedTo: leaderId,
          status: "backlog",
          priority: newTask.priority,
          dueDate: newTask.dueDate || null,
          createdAt: serverTimestamp(),
          blocked: false,
          isTeamTask: true,
          teamMembers: teamMemberIds,
          // FIX 1: Leader is ALWAYS included in teamHeads so the headedTeamTasks
          // listener always finds their own team tasks. Co-leaders are added on top.
          teamHeads: [...new Set([leaderId, ...teamHeadIds])],
          teamLeaderId: leaderId,
          monitorManagerIds,
        });

        for (const memberId of teamMemberIds) {
          const memberEmp = employeesList.find(emp => emp.id === memberId);
          const roleTag = memberId === leaderId ? " (Team Leader)" : (teamHeadIds.includes(memberId) ? " (Co-Leader)" : "");
          await notifyAssignee({
            assigneeId: memberId,
            assigneeEmp: memberEmp,
            senderName: user.fullName || user.displayName || "Mints Task Manager",
            senderEmail: user.email || "system@mintsglobal.com",
            subject: `📋 Team Task Assigned: ${newTask.title.trim()}${roleTag}`,
            body: `Hello ${memberEmp?.fullName || "Team Member"},\n\nYou have been added to a new Team Task on the Mints Global ERP:\n\nTask: ${newTask.title.trim()}\nYour Role: ${memberId === leaderId ? "Team Leader" : (teamHeadIds.includes(memberId) ? "Co-Leader" : "Team Member")}\nPriority: ${newTask.priority.toUpperCase()}\nDue Date: ${newTask.dueDate || "No due date set"}\n\nPlease head to your Tasks Kanban Board to view this task.\n\nBest regards,\n${user.fullName || user.displayName || "Mints Project Management"}`,
            priority: newTask.priority,
            notificationTitle: "New Team Task Assigned",
            notificationMessage: `You have been added to the team task: ${newTask.title.trim()}`,
          });
        }

        setIsAddOpen(false);
        setAssignMode("individual");
        setTeamMemberIds([]);
        setTeamHeadIds([]);
        setTeamLeaderId("");
        setMonitorManagerIds([]);
        setNewTask({ title: "", description: "", priority: "Normal", dueDate: "", assignedTo: currentAssigneeId || user.uid });
      } catch (error) {
        console.error("Error adding team task:", error);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      let assigneeId = currentAssigneeId || user.uid;
      if (isCSuiteOrAdmin) {
        assigneeId = newTask.assignedTo || currentAssigneeId || user.uid;
      } else if (isManagerOrSenior) {
        const isPermittedJunior = juniorEmployees.some(emp => emp.id === newTask.assignedTo);
        assigneeId = isPermittedJunior ? newTask.assignedTo : (currentAssigneeId || user.uid);
      } else {
        assigneeId = currentAssigneeId || user.uid;
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

      await notifyAssignee({
        assigneeId,
        assigneeEmp,
        senderName: user.fullName || user.displayName || "Mints Task Manager",
        senderEmail: user.email || "system@mintsglobal.com",
        subject: `📋 Task Assigned: ${newTask.title.trim()}`,
        body: `Hello ${assigneeEmp.fullName || "Team Member"},\n\nYou have been assigned a new task on the Mints Global ERP:\n\nTask: ${newTask.title.trim()}\nPriority: ${newTask.priority.toUpperCase()}\nDue Date: ${newTask.dueDate || "No due date set"}\n\nPlease head to your Tasks Kanban Board to manage this task.\n\nBest regards,\n${user.fullName || user.displayName || "Mints Project Management"}`,
        priority: newTask.priority,
        notificationTitle: "New Task Assigned",
        notificationMessage: `You have been assigned a new task: ${newTask.title.trim()}`,
      });

      setIsAddOpen(false);
      setNewTask({ title: "", description: "", priority: "Normal", dueDate: "", assignedTo: currentAssigneeId || user.uid });
    } catch (error) {
      console.error("Error adding task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // FIX 2 (part): Reset subtaskDateError when opening the modal
  const openAddSubtaskModal = (parentTask: Task) => {
    setSubtaskParent(parentTask);
    setNewSubtask({ title: "", description: "", priority: "Normal", dueDate: "", assignedTo: "" });
    setSubtaskDateError("");
    setIsAddSubtaskOpen(true);
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subtaskParent || !newSubtask.title.trim() || !newSubtask.assignedTo) return;
    if (!assignableSubtaskTargets(subtaskParent).includes(newSubtask.assignedTo)) {
      console.error("Blocked: not authorized to assign a subtask to this member.");
      return;
    }

    // Validate subtask due date must not be in the past
    const todayStr = new Date().toISOString().split("T")[0];
    if (newSubtask.dueDate && newSubtask.dueDate < todayStr) {
      setSubtaskDateError("Subtask due date cannot be before today.");
      return;
    }

    // FIX 2: Validate subtask due date must not exceed parent task due date
    if (newSubtask.dueDate && subtaskParent.dueDate) {
      if (newSubtask.dueDate > subtaskParent.dueDate) {
        setSubtaskDateError(
          `Subtask due date cannot be later than the main task's due date (${subtaskParent.dueDate}).`
        );
        return;
      }
    }
    setSubtaskDateError("");

    setIsSubmittingSubtask(true);
    try {
      await addDoc(collection(db, "tasks"), {
        title: newSubtask.title.trim(),
        description: newSubtask.description.trim() || null,
        projectId: subtaskParent.projectId || "general",
        projectName: subtaskParent.projectName || "General",
        assignedTo: newSubtask.assignedTo,
        status: "backlog",
        priority: newSubtask.priority,
        dueDate: newSubtask.dueDate || null,
        createdAt: serverTimestamp(),
        blocked: false,
        parentTaskId: subtaskParent.id,
        parentTaskTitle: subtaskParent.title,
        assignedBy: currentAssigneeId || user.uid,
        assignedByName: user.fullName || user.displayName || "Team Leader",
        // Carry visibility metadata to the child document for monitoring and remark filtering.
        teamMembers: subtaskParent.teamMembers || [],
        teamHeads: subtaskParent.teamHeads || [],
        teamLeaderId: subtaskParent.teamLeaderId,
        monitorManagerIds: subtaskParent.monitorManagerIds || [],
      });

      const assigneeEmp = employeesList.find(emp => emp.id === newSubtask.assignedTo);
      const assignerLabel = isTeamLeader(subtaskParent) ? "Leader" : "Co-Leader";

      if (newSubtask.assignedTo !== currentAssigneeId) {
        await notifyAssignee({
          assigneeId: newSubtask.assignedTo,
          assigneeEmp,
          senderName: user.fullName || user.displayName || "Team Leader",
          senderEmail: user.email || "system@mintsglobal.com",
          subject: `📋 Subtask Assigned: ${subtaskParent.title} (${newSubtask.title.trim()})`,
          body: `Hello ${assigneeEmp?.fullName || "Team Member"},\n\n${user.fullName || user.displayName || "Your Team Leader"} (${assignerLabel}) has assigned you a subtask under the team task "${subtaskParent.title}":\n\nSubtask: ${newSubtask.title.trim()}\nPriority: ${newSubtask.priority.toUpperCase()}\nDue Date: ${newSubtask.dueDate || "No due date set"}\n\nPlease head to your Tasks Kanban Board to manage this subtask.\n\nBest regards,\n${user.fullName || user.displayName || "Mints Project Management"}`,
          priority: newSubtask.priority,
          notificationTitle: "New Subtask Assigned",
          notificationMessage: `${subtaskParent.title} (${newSubtask.title.trim()}) was assigned to you by ${user.fullName || user.displayName || "your Team Leader"}`,
        });
      }

      setIsAddSubtaskOpen(false);
      setSubtaskParent(null);
    } catch (error) {
      console.error("Error adding subtask:", error);
    } finally {
      setIsSubmittingSubtask(false);
    }
  };

  const handleStartTask = async (taskId: string) => {
    setTasks(prev => {
      const task = prev.backlog.find(t => t.id === taskId);
      if (!task) return prev;
      const updated: Task = { ...task, status: "in_progress" };
      return {
        ...prev,
        backlog: prev.backlog.filter(t => t.id !== taskId),
        in_progress: [updated, ...prev.in_progress],
      };
    });
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: "in_progress" });
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error starting task:", err);
      setTasks(prev => {
        const task = prev.in_progress.find(t => t.id === taskId);
        if (!task) return prev;
        const reverted: Task = { ...task, status: "backlog" };
        return {
          ...prev,
          in_progress: prev.in_progress.filter(t => t.id !== taskId),
          backlog: [reverted, ...prev.backlog],
        };
      });
    }
  };

  const openSubmitReviewConfirm = (task: Task) => {
    setSelectedTask(task);
    setIsSubmitReviewOpen(true);
  };

  const handleConfirmSubmitForReview = async () => {
    if (!activeTask) return;
    setIsSubmittingReview(true);

    const skipsReview = isSelfAssignedByLeader(activeTask);
    const newStatus: TaskStatus = skipsReview ? "done" : "review";
    const submittedAt = new Date().toISOString();

    setTasks(prev => {
      const task = prev.in_progress.find(t => t.id === activeTask.id);
      if (!task) return prev;
      const updated: Task = { ...task, status: newStatus, submittedAt, ...(skipsReview ? { feedback: null } : {}) };
      return {
        ...prev,
        in_progress: prev.in_progress.filter(t => t.id !== activeTask.id),
        [newStatus]: [updated, ...prev[newStatus]],
      };
    });

    try {
      await updateDoc(doc(db, "tasks", activeTask.id), {
        status: newStatus,
        submittedAt,
        ...(skipsReview ? { feedback: null } : {}),
      });
      setIsSubmitReviewOpen(false);
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error submitting task for review:", err);
      setTasks(prev => {
        const task = prev[newStatus].find(t => t.id === activeTask.id);
        if (!task) return prev;
        return {
          ...prev,
          [newStatus]: prev[newStatus].filter(t => t.id !== activeTask.id),
          in_progress: [{ ...task, status: "in_progress" }, ...prev.in_progress],
        };
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleApproveTask = async (taskId: string) => {
    setTasks(prev => {
      const task = prev.review.find(t => t.id === taskId);
      if (!task) return prev;
      const updated: Task = { ...task, status: "done", feedback: null };
      return {
        ...prev,
        review: prev.review.filter(t => t.id !== taskId),
        done: [updated, ...prev.done],
      };
    });
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: "done", feedback: null });
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error approving task:", err);
      setTasks(prev => {
        const task = prev.done.find(t => t.id === taskId);
        if (!task) return prev;
        return {
          ...prev,
          done: prev.done.filter(t => t.id !== taskId),
          review: [{ ...task, status: "review" }, ...prev.review],
        };
      });
    }
  };

  const openInspectModal = (task: Task) => {
    setInspectTaskId(task.id);
  };
  const inspectTask = inspectTaskId
    ? Object.values(tasks).flat().find(t => t.id === inspectTaskId) || progressTasks.find(t => t.id === inspectTaskId) || null
    : null;

  const activeRemarkEntries = activeTask ? remarksForDisplay(activeTask) : [];
  const inspectRemarkEntries = inspectTask ? remarksForDisplay(inspectTask) : [];

  const openRecheckModal = (task: Task) => {
    setSelectedTask(task);
    setRecheckFeedback("");
    setRecheckError(false);
    setIsRecheckOpen(true);
  };

  const handleConfirmRecheck = async () => {
    if (!activeTask) return;
    if (!recheckFeedback.trim()) {
      setRecheckError(true);
      return;
    }

    setIsSubmittingRecheck(true);
    const updatedRemarks = [...(activeTask.remarks || []), {
      id: Math.random().toString(36).substring(2, 9),
      text: `Recheck requested: ${recheckFeedback.trim()}`,
      authorId: user?.uid || "admin",
      authorName: user?.fullName || user?.displayName || "Admin",
      createdAt: new Date().toISOString()
    }];

    setTasks(prev => {
      const task = prev.review.find(t => t.id === activeTask.id);
      if (!task) return prev;
      const updated: Task = { ...task, status: "in_progress", feedback: recheckFeedback.trim(), remarks: updatedRemarks };
      return {
        ...prev,
        review: prev.review.filter(t => t.id !== activeTask.id),
        in_progress: [updated, ...prev.in_progress],
      };
    });

    try {
      await updateDoc(doc(db, "tasks", activeTask.id), {
        status: "in_progress",
        feedback: recheckFeedback.trim(),
        remarks: updatedRemarks
      });
      setIsRecheckOpen(false);
      setIsDetailsOpen(false);
    } catch (err) {
      console.error("Error sending task back for recheck:", err);
      setTasks(prev => {
        const task = prev.in_progress.find(t => t.id === activeTask.id);
        if (!task) return prev;
        return {
          ...prev,
          in_progress: prev.in_progress.filter(t => t.id !== activeTask.id),
          review: [{ ...task, status: "review" }, ...prev.review],
        };
      });
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
      const primaryQ = myTasksOnly
        ? query(
            collection(db, "tasks"),
            where("status", "==", col.id),
            where("assignedTo", "==", currentAssigneeId || user.uid)
          )
        : query(collection(db, "tasks"), where("status", "==", col.id));

      const commitColumn = (primaryTasks: Task[]) => {
        let columnTasks = primaryTasks;
        if (!myTasksOnly) columnTasks = columnTasks.filter(canViewTask);
        if (employeeFilter !== "All Employees" && isCSuiteOrAdmin && !myTasksOnly) {
          columnTasks = columnTasks.filter(t => t.assignedTo === employeeFilter);
        }
        columnTasks.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        setTasks(prev => ({ ...prev, [col.id]: columnTasks }));
        setLoading(false);
      };

      const primaryUnsub = onSnapshot(primaryQ, snapshot => {
        const primaryTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Task[];
        commitColumn(primaryTasks);
      });
      unsubscribes.push(primaryUnsub);
    });

    return () => { unsubscribes.forEach(u => u()); };
  }, [user, myTasksOnly, employeeFilter, isCSuiteOrAdmin, currentAssigneeId, canViewTask]);
  
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;

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

/////

const openDeleteModal = (task: Task) => {
    setDeleteTarget(task);
    setDeleteReason("");
    setDeleteError(false);
  };

  const handleConfirmDeleteTask = async () => {
    if (!deleteTarget || !user) return;
    if (!deleteReason.trim()) {
      setDeleteError(true);
      return;
    }

    setIsSubmittingDelete(true);
    try {
      const task = deleteTarget;
      const recipientIds = new Set<string>();
      let subtaskDocs: { id: string; assignedTo: string; title: string }[] = [];

      if (task.isTeamTask) {
        (task.teamMembers || []).forEach(id => recipientIds.add(id));
        (task.teamHeads || []).forEach(id => recipientIds.add(id));
        if (task.teamLeaderId) recipientIds.add(task.teamLeaderId);

        // Pull every subtask under this main team task so they can be deleted too.
        const subtaskSnapshot = await getDocs(
          query(collection(db, "tasks"), where("parentTaskId", "==", task.id))
        );
        subtaskDocs = subtaskSnapshot.docs.map(d => ({
          id: d.id,
          assignedTo: (d.data() as any).assignedTo,
          title: (d.data() as any).title,
        }));
        subtaskDocs.forEach(st => { if (st.assignedTo) recipientIds.add(st.assignedTo); });
      } else if (task.parentTaskId) {
        recipientIds.add(task.assignedTo);
        (task.teamHeads || []).forEach(id => recipientIds.add(id));
        if (task.teamLeaderId) recipientIds.add(task.teamLeaderId);
      } else {
        recipientIds.add(task.assignedTo);
      }
      recipientIds.delete(user.uid);

      for (const recipientId of recipientIds) {
        const recipientEmp = employeesList.find(emp => emp.id === recipientId);
        const mySubtask = subtaskDocs.find(st => st.assignedTo === recipientId);
        const subtaskLine = mySubtask ? `\nYour Subtask: ${mySubtask.title} (also removed)\n` : "";
        await notifyAssignee({
          assigneeId: recipientId,
          assigneeEmp: recipientEmp,
          senderName: user.fullName || user.displayName || "Mints Task Manager",
          senderEmail: user.email || "system@mintsglobal.com",
          subject: `❌ Task Cancelled: ${task.title}`,
          body: `Hello ${recipientEmp?.fullName || "Team Member"},\n\nThe following task has been cancelled/deleted by ${user.fullName || user.displayName || "Admin"}:\n\nTask: ${task.title}\nReason: ${deleteReason.trim()}\n${subtaskLine}\nPlease reach out if you have any questions.\n\nBest regards,\n${user.fullName || user.displayName || "Mints Project Management"}`,
          priority: task.priority,
          notificationTitle: "Task Cancelled",
          notificationMessage: `${task.title} was cancelled by ${user.fullName || user.displayName || "Admin"}: ${deleteReason.trim()}`,
        });
      }

      // Delete every subtask under this main team task before deleting the main task itself.
      for (const st of subtaskDocs) {
        await deleteDoc(doc(db, "tasks", st.id));
      }

      await deleteDoc(doc(db, "tasks", task.id));
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(false);
    } catch (err) {
      console.error("Error deleting task:", err);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

////

  const parseLocalDate = (dateString: string) => {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  };

  const isOverdue = (dateString?: string) => {
    if (!dateString) return false;
    return parseLocalDate(dateString) < new Date(new Date().setHours(0, 0, 0, 0));
  };

  const isToday = (dateString?: string) => {
    if (!dateString) return false;
    const date = parseLocalDate(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const focusTasks = [
    ...tasks.backlog,
    ...tasks.in_progress,
    ...tasks.review
  ].filter(t =>
    (isToday(t.dueDate) || isOverdue(t.dueDate) || t.priority === "Urgent") &&
    t.assignedTo === (currentAssigneeId || user?.uid)
  )
    .sort((a, b) => {
      if (a.priority === "Urgent" && b.priority !== "Urgent") return -1;
      if (b.priority === "Urgent" && a.priority !== "Urgent") return 1;
      return 0;
    });

  const renderFocusCardBlock = (task: Task) => {
    if (!task.focusSession) return null;
    const session = task.focusSession;
    const elapsed = getSessionElapsedSeconds(session, nowTick);
    const isMine = session.startedBy === currentAssigneeId;
    const focuserName = employeesList.find(e => e.id === session.startedBy)?.fullName || session.startedByName || "A teammate";

    if (!isMine) {
      return (
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-1.5 text-[11px] font-bold text-foreground/60">
          <Target className="w-3 h-3 text-primary shrink-0" />
          <span className="truncate">
            {focuserName} is in Focus Mode · {session.status === "running" ? "Active" : "Paused"} · {formatFocusDuration(elapsed)}
          </span>
        </div>
      );
    }

    return (
      <div className="mt-3 pt-2 border-t border-border/40 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-[11px] font-bold text-primary flex items-center gap-1.5">
          <Target className="w-3 h-3" />
          Focus Mode · {session.status === "running" ? "Active" : "Paused"} · {formatFocusDuration(elapsed)}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => resumeFocusSession(task)}
            className="h-7 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <Play className="w-3 h-3 fill-current" /> Resume
          </button>
          <button
            onClick={() => handleCompleteFocusTask(task)}
            className="h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <Send className="w-3 h-3" /> Complete
          </button>
          <button
            onClick={() => setExitFocusTarget(task)}
            className="h-7 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <LogOut className="w-3 h-3" /> Exit
          </button>
        </div>
      </div>
    );
  };

  const renderTeamTaskBadge = (task: Task) => {
    if (!task.isTeamTask) return null;
    const leader = employeesList.find(e => e.id === task.teamLeaderId);
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary/80 mt-2">
        <Users className="w-3 h-3" />
        <span className="truncate">Team Task · Led by {leader?.fullName || "—"} · {task.teamMembers?.length || 0} members</span>
      </div>
    );
  };

  const renderSubtaskBadge = (task: Task) => {
    if (!task.parentTaskId) return null;
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/50 mt-2">
        <UserPlus className="w-3 h-3 text-primary" />
        <span className="truncate">Subtask of {task.parentTaskTitle} ({task.title})</span>
      </div>
    );
  };

  const handleExportCSV = () => {
    const flatList = Object.values(tasks).flat();
    const employeesMap = new Map(employeesList.map(e => [e.id, e.fullName]));
    const formatted = flatList.map(t => ({
      ...t,
      assigneeName: employeesMap.get(t.assignedTo) || "Unassigned",
      statusLabel: STATUS_META[t.status].label,
      priority: capitalizeWord(t.priority),
    }));
    downloadCSV(
      formatted,
      ["Task Title", "Project Name", "Assignee Name", "Priority", "Status", "Blocked", "Due Date"],
      ["title", "projectName", "assigneeName", "priority", "statusLabel", "blocked", "dueDate"],
      "Mints_Global_Tasks_Kanban.csv"
    );
  };

  // SCREEN 3 — FOCUS WORKSPACE
  if (focusWorkspaceTask && focusWorkspaceTask.focusSession) {
    const session = focusWorkspaceTask.focusSession;
    const elapsedSeconds = getSessionElapsedSeconds(session, nowTick);
    const targetSeconds = session.durationMinutes ? session.durationMinutes * 60 : null;
    const checklistDone = workspaceChecklist.filter(i => i.done).length;
    const progressPct = targetSeconds
      ? Math.min(100, Math.round((elapsedSeconds / targetSeconds) * 100))
      : Math.min(100, Math.round((checklistDone / Math.max(1, workspaceChecklist.length)) * 100));

    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] text-foreground">
        <div className="flex-1 border border-border rounded-2xl overflow-y-auto flex flex-col items-center p-6 sm:p-10">
          <div className="max-w-xl w-full">
            <div className="text-center mb-8">
              <span className="badge bg-primary/10 border border-primary/20 text-primary font-bold text-xs py-0.5 px-2.5 uppercase tracking-wider inline-flex items-center gap-1.5">
                <Target className="w-3 h-3" /> Focus Mode
              </span>
              <h1 className="text-lg font-extrabold text-foreground mt-3 leading-snug">{focusWorkspaceTask.title}</h1>
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[focusWorkspaceTask.priority]}`} />
                <span className="text-xs font-bold text-foreground/40">{capitalizeWord(focusWorkspaceTask.priority)} Priority</span>
                <StatusBadge status={focusWorkspaceTask.status} />
              </div>
            </div>

            <div className="text-center mb-6">
              <div className="text-5xl sm:text-6xl font-extrabold text-foreground tabular-nums tracking-tight">
                {formatFocusTimer(elapsedSeconds)}
              </div>
              {targetSeconds && (
                <p className="text-xs text-foreground/40 mt-1 font-bold uppercase tracking-wider">Goal: {session.durationMinutes} Minutes</p>
              )}
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-1.5 text-xs font-bold uppercase tracking-wider text-foreground/50">
                <span>Today's Progress</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted/60 border border-border overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            <div className="mb-8 border border-border rounded-xl p-4">
              <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-primary" /> Checklist
              </h3>
              <div className="space-y-2 mb-3">
                {workspaceChecklist.length === 0 ? (
                  <p className="text-xs text-foreground/30 font-medium py-2">No checklist items yet — add one below.</p>
                ) : (
                  workspaceChecklist.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleToggleChecklistItem(item.id)}
                      className="w-full flex items-center gap-2.5 text-left cursor-pointer group"
                    >
                      <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        item.done ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                      )}>
                        {item.done && <Check className="w-2.5 h-2.5 text-foreground" />}
                      </span>
                      <span className={cn("text-xs font-medium", item.done ? "text-foreground/40 line-through" : "text-foreground/80")}>
                        {item.text}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Add a checklist item..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddChecklistItem(); } }}
                  className="flex-grow h-9 rounded-lg border border-border px-3 py-1 text-xs text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  disabled={!newChecklistText.trim()}
                  className="px-3 h-9 bg-primary hover:bg-primary disabled:opacity-50 text-foreground rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-primary" /> Quick Notes
              </h3>
              <Textarea
                placeholder="Jot down anything worth remembering..."
                value={workspaceNotes}
                onChange={(e) => setWorkspaceNotes(e.target.value)}
                className="border-border text-foreground placeholder:text-foreground/30 min-h-[100px] text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handlePauseFocusSession(focusWorkspaceTask)}
                className="btn-ghost h-11 text-sm font-bold flex items-center justify-center gap-2 border-border text-foreground/70 hover:text-foreground cursor-pointer"
              >
                <Pause className="w-4 h-4" /> Pause
              </button>
              <button
                onClick={() => handleCompleteFocusTask(focusWorkspaceTask)}
                className="btn-primary h-11 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" /> Complete Task
              </button>
            </div>
            <button
              onClick={() => setExitFocusTarget(focusWorkspaceTask)}
              className="w-full mt-3 h-9 text-xs font-bold text-rose-400 hover:bg-rose-500/10 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Exit Focus Mode
            </button>
          </div>
        </div>

        <Dialog open={!!exitFocusTarget} onOpenChange={(o) => !o && setExitFocusTarget(null)}>
          <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-sm backdrop-blur-md shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Exit Focus Mode?
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
              This session's progress will be discarded. The task will stay in In Progress, with no focus stats attached.
            </p>
            <DialogFooter className="mt-6 border-t-0 pt-2">
              <button type="button" onClick={() => setExitFocusTarget(null)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors">Cancel</button>
              <button type="button" onClick={() => exitFocusTarget && handleExitFocusSession(exitFocusTarget)} className="px-4 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Exit Focus Mode
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

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

          {isCSuiteOrAdmin && !focusMode && !myTasksOnly && (
            <Select value={employeeFilter} onValueChange={(val) => setEmployeeFilter(val ?? "all")}>
              <SelectTrigger className="h-9 w-44 border-border text-xs font-bold">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border text-foreground text-xs">
                <SelectItem value="All Employees">All Employees</SelectItem>
                {employeesList.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.fullName}</SelectItem>
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
              setAssignMode("individual");
              setTeamMemberIds([]);
              setTeamHeadIds([]);
              setTeamLeaderId("");
              setNewTask(prev => ({ ...prev, assignedTo: currentAssigneeId || user?.uid || "" }));
              setIsAddOpen(true);
            }}
            className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer"
          >
            <Plus className="mr-1.5 h-4 w-4" /> {getAddTaskBtnLabel()}
          </button>
        </div>
      </div>

      {/* 4 STATS CARDS */}
      {isCSuiteOrAdmin && !focusMode && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-foreground/50 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Active Tasks
            </div>
            <div className="text-2xl font-extrabold text-foreground mt-2">{tasks.backlog.length + tasks.in_progress.length}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-foreground/50 uppercase tracking-wider">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Awaiting Review
            </div>
            <div className="text-2xl font-extrabold text-foreground mt-2">{tasks.review.length}</div>
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
            <div className="text-2xl font-extrabold text-foreground mt-2">{tasks.done.length}</div>
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
          className="flex-1 border border-border rounded-2xl flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            <div className="max-w-2xl w-full">
              <div className="text-center mb-8">
                <h2 className="text-base font-bold text-foreground">Your Focus for Today</h2>
                <p className="text-xs text-foreground/40 mt-1">Tick a task, then start a focus session for it. Complete these {focusTasks.length} High-priority items.</p>
              </div>

              <div className="space-y-4">
                <AnimatePresence>
                  {focusTasks.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 border border-border border-dashed rounded-2xl">
                      <CheckSquare className="h-10 w-10 text-foreground/20 mx-auto mb-3" />
                      <h3 className="text-sm font-bold text-foreground/50 uppercase tracking-wider">All caught up!</h3>
                      <p className="text-xs text-foreground/30 mt-1">You have no Urgent tasks due today.</p>
                    </motion.div>
                  ) : (
                    focusTasks.map((task) => {
                      const isTicked = selectedFocusTaskId === task.id;
                      return (
                        <motion.div key={task.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                          <Card
                            onClick={() => setSelectedFocusTaskId(prev => (prev === task.id ? null : task.id))}
                            className={cn("bg-card border border-border shadow-sm rounded-lg overflow-hidden relative group cursor-pointer hover:border-primary/30 transition-all",
                              task.priority === "Urgent" ? "border-rose-500/30" : "",
                              task.blocked ? "opacity-60" : "",
                              isTicked && "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                            )}
                          >
                            {task.priority === "Urgent" && !task.blocked && (
                              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                            )}
                            <CardContent className="p-5">
                              <div className="flex items-start gap-4">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setSelectedFocusTaskId(prev => (prev === task.id ? null : task.id)); }}
                                  aria-pressed={isTicked}
                                  className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer",
                                    isTicked ? "bg-primary border-primary" : "border-border hover:border-primary/50"
                                  )}
                                >
                                  {isTicked && <Check className="w-3.5 h-3.5 text-foreground" />}
                                </button>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="badge border border-border text-foreground/50 text-xs font-bold py-0.5 uppercase tracking-wider">{task.projectName || "Project"}</span>
                                      {task.priority === "Urgent" && <span className="badge status-critical font-bold text-xs py-0.5 uppercase tracking-wider">Urgent</span>}
                                      {task.blocked && <span className="badge status-draft font-bold text-xs py-0.5 uppercase tracking-wider flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Blocked</span>}
                                      {task.status === "review" && <StatusBadge status="review" />}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); openDeleteModal(task); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 text-rose-400 rounded cursor-pointer">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-snug">{task.title}</h3>
                                  {renderTeamTaskBadge(task)}
                                  {renderSubtaskBadge(task)}

                                  <div className="flex items-center gap-4 mt-4 text-xs font-bold uppercase tracking-wider">
                                    {task.dueDate && (
                                      <div className={cn("flex items-center gap-1 px-2.5 h-6 rounded-lg text-xs font-bold uppercase",
                                        isOverdue(task.dueDate) ? "bg-rose-950/40 border border-rose-500/20 text-rose-300" :
                                          isToday(task.dueDate) ? "bg-amber-950/40 border border-amber-500/20 text-amber-300" :
                                            "border border-border text-foreground/50"
                                      )}>
                                        <Clock className="w-3 h-3" />
                                        {isOverdue(task.dueDate) ? "Overdue" : isToday(task.dueDate) ? "Due Today" : new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                      </div>
                                    )}
                                    {task.status === "backlog" && isOwner(task) && !task.focusSession && (
                                      <button onClick={(e) => { e.stopPropagation(); handleStartTask(task.id); }} className="ml-auto btn-ghost py-1 px-3 h-7 text-xs font-bold flex items-center gap-1 border-border text-foreground/70 hover:text-foreground cursor-pointer">
                                        <Play className="w-2.5 h-2.5 fill-current text-accent" /> Start
                                      </button>
                                    )}
                                  </div>
                                  {renderFocusCardBlock(task)}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border p-4 flex justify-center bg-card/40">
            <button
              type="button"
              disabled={!selectedFocusTaskId}
              onClick={() => { const task = focusTasks.find(t => t.id === selectedFocusTaskId); if (task) openStartFocusDialog(task); }}
              className="btn-primary h-10 px-6 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-w-2xl w-full"
            >
              <Target className="w-4 h-4" /> Start Focus Mode
            </button>
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
                        {column.id === "backlog" && (
                          <button
                            onClick={() => {
                              setAddingToStatus("backlog");
                              setAssignMode("individual");
                              setTeamMemberIds([]);
                              setTeamHeadIds([]);
                              setTeamLeaderId("");
                              setNewTask(prev => ({ ...prev, assignedTo: currentAssigneeId || user?.uid || "" }));
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
                                  onClick={() => { setSelectedTask(task); setIsDetailsOpen(true); }}
                                  className={cn("mb-3 cursor-pointer border-border bg-card/80 hover:bg-card transition-all relative overflow-hidden group hover:border-primary/30",
                                    snapshot.isDragging ? 'shadow-xl ring-1 ring-primary/30 rotate-1 bg-blue-950/90' : 'shadow-sm',
                                    task.priority === "Urgent" && "border-rose-500/20",
                                    locked && "cursor-default"
                                  )}
                                >
                                  {task.priority === "Urgent" && (
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
                                          onClick={(e) => { e.stopPropagation(); openDeleteModal(task); }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 text-rose-400 rounded cursor-pointer shrink-0"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>

                                    <p className="text-xs font-bold text-foreground mb-2 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                                      {task.title}
                                    </p>
                                    {renderTeamTaskBadge(task)}
                                    {renderSubtaskBadge(task)}

                                    {task.feedback && task.status === "in_progress" && (
                                      <div className="mb-2 mt-2 p-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-1.5 font-medium">
                                        <AlertTriangle className="w-3 h-3 shrink-0 text-rose-400" />
                                        <span className="truncate">Recheck: {task.feedback}</span>
                                      </div>
                                    )}

                                    {(task.status === "review" || task.status === "done") && (
                                      <div className="mb-3 mt-2"><StatusBadge status={task.status} /></div>
                                    )}

                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                                      <div className="flex items-center gap-2 text-foreground/40 text-xs font-bold">
                                        <span className="text-[11px] text-foreground/60">{assigneeName}</span>
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

                                    {task.status === "backlog" && isOwner(task) && (
                                      <button onClick={(e) => { e.stopPropagation(); handleStartTask(task.id); }} className="btn-ghost w-full mt-3 h-8 text-xs font-bold flex items-center justify-center gap-1.5 border-border text-foreground/70 hover:text-foreground cursor-pointer">
                                        <Play className="w-3 h-3 fill-current text-accent" /> Start Task
                                      </button>
                                    )}
                                    {task.status === "in_progress" && isOwner(task) && !task.focusSession && !task.isTeamTask && (
                                      <button onClick={(e) => { e.stopPropagation(); openSubmitReviewConfirm(task); }} className="btn-primary w-full mt-3 h-8 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                                        <Send className="w-3 h-3" /> Completed Task
                                      </button>
                                    )}
                                    {task.status === "in_progress" && isOwner(task) && task.isTeamTask && (
                                      <p className="text-[10px] text-foreground/45 mt-3">
                                        Open this team task to assign subtasks and submit once everyone's finished.
                                      </p>
                                    )}

                                    {isTeamLeader(task) && task.status === "in_progress" && (
                                      <button onClick={(e) => { e.stopPropagation(); openAddSubtaskModal(task); }} className="btn-ghost w-full mt-3 h-8 text-xs font-bold flex items-center justify-center gap-1.5 border-border text-foreground/70 hover:text-foreground cursor-pointer">
                                        <UserPlus className="w-3 h-3" /> Add Subtask
                                      </button>
                                    )}

                                    {renderFocusCardBlock(task)}

                                    {canReviewTask(task) && (
                                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-border/40">
                                        <button onClick={(e) => { e.stopPropagation(); handleApproveTask(task.id); }} className="h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                                          <CheckCircle2 className="w-3 h-3" /> Approve
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); openRecheckModal(task); }} className="h-7 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
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
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-4 mt-4">

            {isCSuiteOrAdmin && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Task Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAssignMode("individual")} className={cn("h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer", assignMode === "individual" ? "bg-primary border-primary text-foreground" : "border-border text-foreground/60 hover:bg-muted/60")}>
                    <CheckSquare className="w-3.5 h-3.5" /> Individual
                  </button>
                  <button type="button" onClick={() => setAssignMode("team")} className={cn("h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer", assignMode === "team" ? "bg-primary border-primary text-foreground" : "border-border text-foreground/60 hover:bg-muted/60")}>
                    <Users className="w-3.5 h-3.5" /> Team Task
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Task Title</label>
              <Input required placeholder="What needs to be done?" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} className="border-border text-foreground placeholder:text-foreground/30" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Description</label>
              <Textarea placeholder="Short description or details..." value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} className="border-border text-foreground placeholder:text-foreground/30 min-h-[70px]" />
            </div>

            {isCSuiteOrAdmin && assignMode === "team" ? (
              <div className="space-y-3 border border-border rounded-xl p-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" /> Team Members
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {employeesList.map(emp => {
                      const checked = teamMemberIds.includes(emp.id);
                      return (
                        <button type="button" key={emp.id}
                          onClick={() => {
                            setTeamMemberIds(prev => checked ? prev.filter(id => id !== emp.id) : [...prev, emp.id]);
                            if (checked) {
                              setTeamHeadIds(prev => prev.filter(id => id !== emp.id));
                              if (teamLeaderId === emp.id) setTeamLeaderId("");
                            }
                          }}
                          className="w-full flex items-center gap-2.5 text-left cursor-pointer group py-1"
                        >
                          <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", checked ? "bg-primary border-primary" : "border-border group-hover:border-primary/50")}>
                            {checked && <Check className="w-2.5 h-2.5 text-foreground" />}
                          </span>
                          <span className="text-xs font-medium text-foreground/80">{emp.fullName} {emp.jobTitle ? `— ${emp.jobTitle}` : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {teamMemberIds.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Co-Leaders (optional)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {teamMemberIds.map(id => {
                        const emp = employeesList.find(e => e.id === id);
                        const isHead = teamHeadIds.includes(id);
                        const isCurrentLeader = id === teamLeaderId;
                        return (
                          <button
                            type="button"
                            key={id}
                            disabled={isCurrentLeader}
                            onClick={() => setTeamHeadIds(prev => isHead ? prev.filter(h => h !== id) : [...prev, id])}
                            title={isCurrentLeader ? "This person is already the Team Leader" : undefined}
                            className={cn("px-2.5 h-7 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer",
                              isCurrentLeader ? "opacity-40 cursor-not-allowed border-border text-foreground/40" :
                              isHead ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-foreground/60 hover:bg-muted/60"
                            )}
                          >
                            {emp?.fullName || id}
                          </button>
                        );
                      })}
                    </div>

                    <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5 pt-2">
                      <Crown className="w-3.5 h-3.5 text-primary" /> Team Leader
                    </label>
                    {(() => {
                      const eligibleLeaderIds = teamMemberIds.filter(id => {
                        const emp = employeesList.find(e => e.id === id);
                        return emp && isEligibleLeader(emp) && !teamHeadIds.includes(id);
                      });
                      if (eligibleLeaderIds.length === 0) {
                        return (
                          <p className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 p-2 border border-rose-500/30 bg-rose-950/30 rounded-lg">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> None of the selected members hold a Manager / Senior Employee role. Add one to assign a Team Leader.
                          </p>
                        );
                      }
                      return (
                        <Select value={teamLeaderId} onValueChange={(val) => { setTeamLeaderId(val ?? ""); setTeamHeadIds(prev => prev.filter(id => id !== val)); }}>
                          <SelectTrigger className="w-full border-border text-foreground h-9">
                            <SelectValue placeholder="Select Team Leader" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                            {eligibleLeaderIds.map(id => {
                              const emp = employeesList.find(e => e.id === id);
                              return <SelectItem key={id} value={id}>{emp?.fullName || id}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    <div className="space-y-1.5 pt-3 border-t border-border/60 mt-3">
                      <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-primary" /> Monitoring Managers
                      </label>
                      <p className="text-[10px] text-foreground/45">Selected managers can view the complete team and subtask progress, but cannot edit, approve, or recheck it.</p>
                      <div className="flex flex-wrap gap-2">
                        {managers.map(manager => {
                          const selected = monitorManagerIds.includes(manager.id);
                          return (
                            <button type="button" key={manager.id}
                              onClick={() => setMonitorManagerIds(previous => selected ? previous.filter(id => id !== manager.id) : [...previous, manager.id])}
                              className={cn("px-2.5 h-7 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer", selected ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-foreground/60 hover:bg-muted/60")}
                            >
                              {manager.fullName || manager.id}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[10px] text-foreground/45">Only Managers / Senior Employees can be Team Leader. Every selected member — Leader, Co-Leaders, and regular members — gets notified by mail.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Assign To</label>
                {isCSuiteOrAdmin ? (
                  <Select value={newTask.assignedTo || currentAssigneeId || user?.uid || ""} onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val ?? "" })}>
                    <SelectTrigger className="w-full border-border text-foreground h-9"><SelectValue placeholder="Select Employee" /></SelectTrigger>
                    <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                      <SelectItem value={currentAssigneeId || user?.uid || ""}>Assign to me</SelectItem>
                      {Object.entries(employeesByDept).map(([dept, emps]) => (
                        <SelectGroup key={dept}>
                          <SelectLabel className="font-bold text-primary">{dept}</SelectLabel>
                          {emps.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.fullName} {emp.jobTitle ? `- ${emp.jobTitle}` : ""}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                ) : isManagerOrSenior ? (
                  <Select value={newTask.assignedTo || currentAssigneeId || user?.uid || ""} onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val ?? "" })}>
                    <SelectTrigger className="w-full border-border text-foreground h-9"><SelectValue placeholder="Select Myself or Junior" /></SelectTrigger>
                    <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                      <SelectItem value={currentAssigneeId || user?.uid || ""}>Assign to me</SelectItem>
                      <SelectGroup>
                        <SelectLabel className="font-bold text-primary">Junior Team Members</SelectLabel>
                        {juniorEmployees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.fullName} {emp.jobTitle ? `- ${emp.jobTitle}` : ""}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={currentAssigneeId || user?.uid || ""} disabled={true} onValueChange={(val) => setNewTask({ ...newTask, assignedTo: val as string })}>
                    <SelectTrigger className="w-full border-border text-foreground h-9 bg-muted/30 cursor-not-allowed"><SelectValue placeholder="Assign to me" /></SelectTrigger>
                    <SelectContent className="bg-background border-border text-foreground">
                      <SelectItem value={currentAssigneeId || user?.uid || ""}>Assign to me</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Priority</label>
                <Select value={newTask.priority} onValueChange={(val) => setNewTask({ ...newTask, priority: val as TaskPriority })}>
                  <SelectTrigger className="w-full border-border text-foreground h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Due Date</label>
                <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} className="border-border text-foreground placeholder:text-foreground/30" style={{ colorScheme: "dark" }} />
              </div>
            </div>
            <DialogFooter className="mt-6 border-t-0 pt-4">
              <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors" disabled={isSubmitting}>Cancel</button>
              <button type="submit" disabled={isSubmitting || (isCSuiteOrAdmin && assignMode === "team" && (teamMemberIds.length === 0 || !teamLeaderId || !isEligibleLeader(employeesList.find(e => e.id === teamLeaderId))))} className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary text-foreground rounded-lg transition-colors flex items-center justify-center disabled:opacity-50">
                {isSubmitting ? "Adding..." : "Add Task"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADD SUBTASK MODAL (Leader / Co-Leader) */}
      <Dialog open={isAddSubtaskOpen} onOpenChange={setIsAddSubtaskOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" /> Add Subtask
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubtask} className="space-y-4 mt-4">
            <div className="p-2.5 border border-border rounded-lg text-xs text-foreground/60">
              Under Team Task: <span className="font-bold text-foreground">{subtaskParent?.title}</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Subtask Title</label>
              <Input required placeholder="What needs to be done?" value={newSubtask.title} onChange={(e) => setNewSubtask({ ...newSubtask, title: e.target.value })} className="border-border text-foreground placeholder:text-foreground/30" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Description</label>
              <Textarea placeholder="Short description or details..." value={newSubtask.description} onChange={(e) => setNewSubtask({ ...newSubtask, description: e.target.value })} className="border-border text-foreground placeholder:text-foreground/30 min-h-[60px]" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Assign To</label>
              <Select value={newSubtask.assignedTo} onValueChange={(val) => setNewSubtask({ ...newSubtask, assignedTo: val ?? "" })}>
                <SelectTrigger className="w-full border-border text-foreground h-9"><SelectValue placeholder="Select Team Member" /></SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground max-h-60 overflow-y-auto">
                  {(subtaskParent ? assignableSubtaskTargets(subtaskParent) : []).map(id => {
                    const emp = employeesList.find(e => e.id === id);
                    const isHead = subtaskParent?.teamHeads?.includes(id);
                    const isLeader = subtaskParent?.teamLeaderId === id;
                    const isSelf = id === currentAssigneeId;
                    return (
                      <SelectItem key={id} value={id}>
                        {emp?.fullName || id} {isSelf ? "· You" : isLeader ? "· Leader" : isHead ? "· Co-Leader" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-foreground/45">
                {newSubtask.assignedTo === currentAssigneeId
                  ? "Assigning this to yourself — no review needed, just mark it Completed when done and it'll go straight to Done."
                  : "Employees, interns, and Co-Leaders on this team can all receive subtasks — they'll be emailed the moment it's assigned."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Priority</label>
                <Select value={newSubtask.priority} onValueChange={(val) => setNewSubtask({ ...newSubtask, priority: val as TaskPriority })}>
                  <SelectTrigger className="w-full border-border text-foreground h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* FIX 2: Due date input with max constraint + error display */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Due Date</label>
                <Input
                  type="date"
                  value={newSubtask.dueDate}
                  min={new Date().toISOString().split("T")[0]}
                  max={subtaskParent?.dueDate || undefined}
                  onChange={(e) => {
                    setSubtaskDateError("");
                    setNewSubtask({ ...newSubtask, dueDate: e.target.value });
                  }}
                  className="border-border text-foreground placeholder:text-foreground/30"
                  style={{ colorScheme: "dark" }}
                />
                {subtaskDateError && (
                  <p className="text-[10px] font-medium text-rose-400 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> {subtaskDateError}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="mt-6 border-t-0 pt-4">
              <button type="button" onClick={() => setIsAddSubtaskOpen(false)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors" disabled={isSubmittingSubtask}>Cancel</button>
              <button type="submit" disabled={isSubmittingSubtask || !newSubtask.assignedTo} className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary text-foreground rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                <UserPlus className="w-3.5 h-3.5" /> {isSubmittingSubtask ? "Assigning..." : "Assign Subtask"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* START FOCUS DIALOG (Screen 2) */}
      <Dialog open={isStartFocusOpen} onOpenChange={setIsStartFocusOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> Start Focus Mode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Selected Task</label>
              <div className="p-3 border border-border rounded-xl text-sm font-bold text-foreground bg-background/50">
                {focusTasks.find(t => t.id === selectedFocusTaskId)?.title || "—"}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Choose Session Duration</label>
              <Select value={focusDurationChoice} onValueChange={(val) => setFocusDurationChoice(val as "25" | "50" | "none")}>
                <SelectTrigger className="w-full border-border text-foreground h-9"><SelectValue placeholder="Duration" /></SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground">
                  <SelectItem value="25">25 Minutes</SelectItem>
                  <SelectItem value="50">50 Minutes</SelectItem>
                  <SelectItem value="none">No Time Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Optional Notes</label>
              <Textarea placeholder="Seed your Quick Notes for this session..." value={focusStartNotes} onChange={(e) => setFocusStartNotes(e.target.value)} className="border-border text-foreground placeholder:text-foreground/30 min-h-[70px]" />
            </div>
          </div>
          <DialogFooter className="mt-6 border-t-0 pt-4">
            <button type="button" onClick={() => setIsStartFocusOpen(false)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors" disabled={isStartingFocus}>Cancel</button>
            <button type="button" onClick={handleConfirmStartFocus} disabled={isStartingFocus || !selectedFocusTaskId} className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary text-foreground rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Target className="w-3.5 h-3.5" /> {isStartingFocus ? "Starting..." : "Start Focus"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EXIT FOCUS MODE CONFIRMATION */}
      <Dialog open={!!exitFocusTarget} onOpenChange={(o) => !o && setExitFocusTarget(null)}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-sm backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Exit Focus Mode?
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-foreground/60 mt-2 leading-relaxed">This session's progress will be discarded. The task will stay in In Progress, with no focus stats attached.</p>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button type="button" onClick={() => setExitFocusTarget(null)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors">Cancel</button>
            <button type="button" onClick={() => exitFocusTarget && handleExitFocusSession(exitFocusTarget)} className="px-4 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Exit Focus Mode
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TASK DETAILS DRAWER */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-lg backdrop-blur-md shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="badge border border-border text-foreground/50 text-xs font-bold py-0.5 uppercase tracking-wider">{activeTask?.projectName || "General"}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${activeTask ? PRIORITY_COLORS[activeTask.priority] : ''}`} />
              <span className="text-xs font-bold text-foreground/40">{activeTask ? capitalizeWord(activeTask.priority) : ""} Priority</span>
              {activeTask && <StatusBadge status={activeTask.status} />}
            </div>
            <DialogTitle className="text-base font-extrabold text-foreground leading-tight">{activeTask?.title}</DialogTitle>
            {activeTask && renderTeamTaskBadge(activeTask)}
            {activeTask && renderSubtaskBadge(activeTask)}
          </DialogHeader>

          <div className="space-y-4 mt-3">
            {activeTask?.description && (
              <div className="p-3 border border-border/80 bg-background/50 rounded-xl text-xs text-foreground/80 leading-relaxed">{activeTask.description}</div>
            )}

            <div className="grid grid-cols-3 gap-2 border border-border p-3 rounded-xl text-xs">
              <div>
                <span className="text-foreground/40 block mb-0.5">Assigned To:</span>
                <span className="font-bold text-foreground">{activeTask ? (employeesList.find(e => e.id === activeTask.assignedTo)?.fullName || "Unassigned") : "Unassigned"}</span>
              </div>
              <div>
                <span className="text-foreground/40 block mb-0.5">Time Spent:</span>
                <span className="font-bold text-foreground flex items-center gap-1"><Clock className="w-3 h-3 text-primary" />{activeTask?.timeSpent || "0h"}</span>
              </div>
              <div>
                <span className="text-foreground/40 block mb-0.5">Due Date:</span>
                <span className="font-bold text-foreground">{activeTask?.dueDate ? new Date(activeTask.dueDate).toLocaleDateString() : "No deadline"}</span>
              </div>
            </div>

            {activeTask?.isTeamTask && (
              <div className="border border-border rounded-xl p-3">
                <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-primary" /> Team Roster
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {activeTask.teamMembers?.map(id => {
                    const emp = employeesList.find(e => e.id === id);
                    const isLeader = activeTask.teamLeaderId === id;
                    const isHead = activeTask.teamHeads?.includes(id);
                    return (
                      <span key={id} className={cn("px-2 h-6 rounded-full border text-[11px] font-bold flex items-center gap-1",
                        isLeader ? "bg-primary/10 border-primary/40 text-primary" : isHead ? "border-primary/30 text-primary/80" : "border-border text-foreground/60"
                      )}>
                        {isLeader && <Crown className="w-2.5 h-2.5" />}
                        {emp?.fullName || id}
                      </span>
                    );
                  })}
                </div>

                {(() => {
                  const scope = getProgressScope(activeTask);
                  if (!scope) return null;
                  const stats = overallSubtaskStats();
                  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

                  if (scope === "overall") {
                    return (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="flex justify-between items-center mb-1.5 text-xs font-bold uppercase tracking-wider text-foreground/50">
                          <span>Overall Progress</span>
                          <span>{stats.done}/{stats.total} subtasks · {pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted/60 border border-border overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  }

                  const rosterForScope = (activeTask.teamMembers || []).filter(id =>
                    scope === "full" ? true : !activeTask.teamHeads?.includes(id)
                  );

                  return (
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-foreground/50">
                        <span>{scope === "full" ? "Team Progress" : "Employee Progress"}</span>
                        <span>{stats.done}/{stats.total} subtasks</span>
                      </div>
                      {rosterForScope.map(id => {
                        const emp = employeesList.find(e => e.id === id);
                        const memberStats = memberSubtaskStats(id);
                        const memberPct = memberStats.total ? Math.round((memberStats.done / memberStats.total) * 100) : 0;
                        const memberSubtasks = progressTasks.filter(st => st.assignedTo === id);
                        return (
                          <div key={id}>
                            <div className="flex justify-between items-center text-[11px] font-bold text-foreground/60 mb-1">
                              <span>{emp?.fullName || id}</span>
                              <span>{memberStats.done}/{memberStats.total}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted/60 border border-border overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${memberPct}%` }} />
                            </div>
                            {memberSubtasks.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {memberSubtasks.map(st => (
                                  <button key={st.id} type="button" onClick={() => openInspectModal(st)}
                                    className="w-full flex items-center justify-between gap-2 text-[10.5px] text-foreground/50 hover:text-foreground/80 py-0.5 cursor-pointer transition-colors">
                                    <span className="truncate flex items-center gap-1"><Eye className="w-2.5 h-2.5 shrink-0" /> {st.title}</span>
                                    <StatusBadge status={st.status} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {isTeamLeader(activeTask) && activeTask.status === "in_progress" && (
                  <button onClick={() => openAddSubtaskModal(activeTask)} className="btn-primary w-full h-9 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer mt-3">
                    <UserPlus className="w-3.5 h-3.5" /> Add Subtask
                  </button>
                )}
                {isTeamLeader(activeTask) && activeTask.status !== "in_progress" && (
                  <p className="text-[10px] text-foreground/45 mt-3">Click <span className="font-bold">Start Task</span> to move this team task to In Progress before assigning subtasks.</p>
                )}
              </div>
            )}

            {activeTask?.feedback && (
              <div className="border border-rose-500/40 bg-rose-950/40 rounded-xl p-3 text-xs text-rose-300 font-medium space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-400"><AlertTriangle className="w-4 h-4" /> Sent Back for Recheck:</div>
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

            {activeTask?.status !== "backlog" && (
              <div>
                <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-primary" /> Attachments
                </h4>
                <div className="p-2.5 border border-border rounded-xl text-xs text-foreground/50">
                  {activeTask?.attachments && activeTask.attachments.length > 0 ? (
                    activeTask.attachments.map((att, i) => {
                      const attachment = typeof att === "string" ? { name: att, url: "" } : att;
                      return (
                        <div key={`${attachment.name}-${i}`} className="flex items-center gap-2 text-foreground/80 py-1">
                          <Paperclip className="w-3 h-3 shrink-0 text-primary" />
                          {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{attachment.name}</a> : <span className="truncate">{attachment.name}</span>}
                        </div>
                      );
                    })
                  ) : "No attachments uploaded."}
                </div>
                {activeTask?.status === "in_progress" && isOwner(activeTask) && (
                  <div className="mt-2">
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/10">
                      <Paperclip className="h-3.5 w-3.5" />
                      {isUploadingAttachment ? "Uploading…" : "Attach file"}
                      <input type="file" className="sr-only" accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleAttachmentUpload} disabled={isUploadingAttachment} />
                    </label>
                    <p className="mt-1.5 text-[10px] text-foreground/45">PDF, DOCX, or XLSX — up to 10 MB.</p>
                    {attachmentError && <p className="mt-1 text-[10px] font-medium text-rose-400">{attachmentError}</p>}
                  </div>
                )}
              </div>
            )}

            {activeTask?.status !== "backlog" && (
              <div>
                <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" /> Remarks & Progress Logs ({activeRemarkEntries.length})
                </h3>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {activeRemarkEntries.length === 0 ? (
                    <div className="text-center py-4 text-foreground/20 text-xs font-medium border border-border border-dashed rounded-xl">No remarks you can view yet.</div>
                  ) : (
                    activeRemarkEntries.map(({ remark, sourceTitle }) => (
                      <div key={`${sourceTitle || "main"}-${remark.id}`} className="border border-border p-2.5 rounded-xl">
                        <div className="flex justify-between items-center mb-1 text-xs font-bold uppercase">
                          <span className="text-primary">{remark.authorName}</span>
                          <span className="text-foreground/30 text-[10px]">{new Date(remark.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {sourceTitle && <p className="text-[10px] text-foreground/45 mb-1">Subtask: {sourceTitle}</p>}
                        <p className="text-xs text-foreground/80 leading-relaxed font-medium">{remark.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTask && activeTask.status !== "backlog" && canAddRemark(activeTask) && (
              <form onSubmit={handleAddRemark} className="space-y-2 border-t border-border pt-3">
                <label className="text-xs font-bold text-foreground/40 uppercase tracking-wider block">Add Progress Remark</label>
                <div className="flex gap-2">
                  <input required placeholder="Describe progress, blockers, or notes..." value={newRemark} onChange={(e) => setNewRemark(e.target.value)} className="flex-grow h-9 rounded-lg border border-border px-3 py-1 text-xs text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" />
                  <button type="submit" disabled={isSubmittingRemark || !newRemark.trim()} className="px-3 h-9 bg-primary hover:bg-primary disabled:opacity-50 text-foreground rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center">
                    {isSubmittingRemark ? "..." : "Log"}
                  </button>
                </div>
              </form>
            )}

            {activeTask?.status === "backlog" && isOwner(activeTask) && (
              <button onClick={() => handleStartTask(activeTask.id)} className="btn-primary w-full h-10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer mt-2">
                <Play className="w-4 h-4 fill-current" /> Start Task
              </button>
            )}
            {activeTask?.status === "in_progress" && isOwner(activeTask) && !activeTask.focusSession && (
              activeTask.isTeamTask && !activeTask.parentTaskId ? (
                (progressTasks.length === 0 || progressTasks.every(st => st.status === "done")) ? (
                  <button onClick={() => openSubmitReviewConfirm(activeTask)} className="btn-primary w-full h-10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer mt-2">
                    <Send className="w-4 h-4" /> Submit Team Task
                  </button>
                ) : (
                  <div className="mt-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                    <Hourglass className="w-3.5 h-3.5 shrink-0" />
                    {progressTasks.filter(st => st.status === "done").length}/{progressTasks.length} subtasks completed — everyone must finish before you can submit the team task.
                  </div>
                )
              ) : (
                <button onClick={() => openSubmitReviewConfirm(activeTask)} className="btn-primary w-full h-10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer mt-2">
                  <Send className="w-4 h-4" /> Completed Task
                </button>
              )
            )}
            {activeTask && renderFocusCardBlock(activeTask)}

            {activeTask && canReviewTask(activeTask) && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-2 border-t border-border">
                <button onClick={() => handleApproveTask(activeTask.id)} className="h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> Approve Task
                </button>
                <button onClick={() => openRecheckModal(activeTask)} className="h-10 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <RotateCcw className="w-4 h-4" /> Send for Recheck
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* SUBMIT FOR REVIEW CONFIRMATION */}
      <Dialog open={isSubmitReviewOpen} onOpenChange={setIsSubmitReviewOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-sm backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle>{activeTask && isSelfAssignedByLeader(activeTask) ? "Complete Task" : "Complete & Submit Task"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
            {activeTask && isSelfAssignedByLeader(activeTask)
              ? <>Mark <span className="font-bold text-foreground">{activeTask.title}</span> as completed? Since you assigned this to yourself, it needs no evaluation — it'll move straight to Done.</>
              : <>Are you sure you want to mark <span className="font-bold text-foreground">{activeTask?.title}</span> as completed and submit it for review?</>}
          </p>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button type="button" onClick={() => setIsSubmitReviewOpen(false)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors" disabled={isSubmittingReview}>Cancel</button>
            <button type="button" onClick={handleConfirmSubmitForReview} disabled={isSubmittingReview} className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary text-foreground rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> {isSubmittingReview ? "Submitting..." : (activeTask && isSelfAssignedByLeader(activeTask) ? "Mark Done" : "Submit Task")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECHECK MODAL */}
      <Dialog open={isRecheckOpen} onOpenChange={setIsRecheckOpen}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Send Back for Recheck
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-foreground/60 leading-relaxed">Let the employee know exactly what needs to be modified before resubmitting.</p>
            <Textarea placeholder="Explain what needs to be changed or fixed..." value={recheckFeedback} onChange={(e) => { setRecheckFeedback(e.target.value); if (e.target.value.trim()) setRecheckError(false); }} className="border-border text-foreground placeholder:text-foreground/30 min-h-[100px] text-xs" />
            {recheckError && (
              <p className="text-xs text-rose-400 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Feedback is required — please describe what needs to change.
              </p>
            )}
          </div>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button type="button" onClick={() => setIsRecheckOpen(false)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors" disabled={isSubmittingRecheck}>Cancel</button>
            <button type="button" onClick={handleConfirmRecheck} disabled={isSubmittingRecheck} className="px-4 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> {isSubmittingRecheck ? "Sending..." : "Send Back"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE TASK MODAL */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteReason(""); setDeleteError(false); } }}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-md backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete Task
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-foreground/60 leading-relaxed">
              Deleting <span className="font-bold text-foreground">{deleteTarget?.title}</span> is permanent and cannot be undone.
              {deleteTarget?.isTeamTask
                ? " All team members, the leader, and co-leaders will be notified by mail."
                : " The assignee will be notified by mail."}
            </p>
            <Textarea
              placeholder="Explain why this task is being cancelled or deleted..."
              value={deleteReason}
              onChange={(e) => { setDeleteReason(e.target.value); if (e.target.value.trim()) setDeleteError(false); }}
              className="border-border text-foreground placeholder:text-foreground/30 min-h-[100px] text-xs"
            />
            {deleteError && (
              <p className="text-xs text-rose-400 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> A reason is required before deleting this task.
              </p>
            )}
          </div>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button type="button" onClick={() => { setDeleteTarget(null); setDeleteReason(""); setDeleteError(false); }} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors" disabled={isSubmittingDelete}>Cancel</button>
            <button type="button" onClick={handleConfirmDeleteTask} disabled={isSubmittingDelete} className="px-4 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> {isSubmittingDelete ? "Deleting..." : "Delete Task"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* INSPECT MODAL */}
      <Dialog open={!!inspectTaskId} onOpenChange={(o) => !o && setInspectTaskId(null)}>
        <DialogContent className="bg-card/95 border-border text-foreground sm:max-w-lg backdrop-blur-md shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> Inspect Submission
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="p-3 border border-border rounded-xl">
              <p className="text-sm font-extrabold text-foreground leading-snug">{inspectTask?.title}</p>
              {inspectTask?.parentTaskTitle && <p className="text-[11px] text-foreground/50 mt-1">Subtask of {inspectTask.parentTaskTitle}</p>}
              <p className="text-[11px] text-foreground/50 mt-1">
                Submitted by {employeesList.find(e => e.id === inspectTask?.assignedTo)?.fullName || "Employee"}
                {inspectTask?.submittedAt ? ` · ${new Date(inspectTask.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ""}
              </p>
            </div>

            {inspectTask?.description && (
              <div className="p-3 border border-border/80 bg-background/50 rounded-xl text-xs text-foreground/80 leading-relaxed">{inspectTask.description}</div>
            )}

            <div>
              <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-primary" /> Attachments
              </h4>
              <div className="p-2.5 border border-border rounded-xl text-xs text-foreground/50 space-y-1">
                {inspectTask?.attachments && inspectTask.attachments.length > 0 ? (
                  inspectTask.attachments.map((att, i) => {
                    const attachment = typeof att === "string" ? { name: att, url: "" } : att;
                    return (
                      <div key={`${attachment.name}-${i}`} className="flex items-center gap-2 text-foreground/80 py-1">
                        <Paperclip className="w-3 h-3 shrink-0 text-primary" />
                        {attachment.url ? <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline flex items-center gap-1">{attachment.name} <Download className="w-3 h-3" /></a> : <span className="truncate">{attachment.name}</span>}
                      </div>
                    );
                  })
                ) : "No attachments uploaded."}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" /> Progress Logs ({inspectRemarkEntries.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {inspectRemarkEntries.length === 0 ? (
                  <div className="text-center py-4 text-foreground/20 text-xs font-medium border border-border border-dashed rounded-xl">No remarks you can view yet.</div>
                ) : (
                  inspectRemarkEntries.map(({ remark, sourceTitle }) => (
                    <div key={`${sourceTitle || "main"}-${remark.id}`} className="border border-border p-2.5 rounded-xl">
                      <div className="flex justify-between items-center mb-1 text-xs font-bold uppercase">
                        <span className="text-primary">{remark.authorName}</span>
                        <span className="text-foreground/30 text-[10px]">{new Date(remark.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {sourceTitle && <p className="text-[10px] text-foreground/45 mb-1">Subtask: {sourceTitle}</p>}
                      <p className="text-xs text-foreground/80 leading-relaxed font-medium">{remark.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6 border-t-0 pt-2">
            <button type="button" onClick={() => setInspectTaskId(null)} className="px-4 py-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors">Close</button>
            {inspectTask && canReviewTask(inspectTask) && (
              <>
                <button type="button" onClick={() => { openRecheckModal(inspectTask); setInspectTaskId(null); }} className="px-4 py-2 text-sm font-bold border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Recheck
                </button>
                <button type="button" onClick={() => { handleApproveTask(inspectTask.id); setInspectTaskId(null); }} className="px-4 py-2 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
