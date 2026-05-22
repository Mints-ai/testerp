"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, MessageSquare, CheckSquare, Target, Lock, Play, Kanban as KanbanIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TaskStatus = "backlog" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "normal" | "high" | "urgent";

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
  normal: "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]",
  low: "bg-white/20",
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
  const [newTask, setNewTask] = useState({ title: "", priority: "normal" as TaskPriority, dueDate: "" });
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus>("backlog");

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTask.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "tasks"), {
        title: newTask.title.trim(),
        projectId: "general", // Default or fetch from somewhere
        projectName: "General",
        assignedTo: user.uid,
        status: addingToStatus,
        priority: newTask.priority,
        dueDate: newTask.dueDate || null,
        createdAt: serverTimestamp(),
        blocked: false,
      });
      setIsAddOpen(false);
      setNewTask({ title: "", priority: "normal", dueDate: "" });
    } catch (error) {
      console.error("Error adding task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] text-white pl-4 lg:pl-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <KanbanIcon className="h-5 w-5 text-blue-500" /> Tasks
          </h1>
          <p className="text-xs text-white/40 mt-1">Manage tasks across active projects.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => {
              setFocusMode(!focusMode);
              if (!focusMode && !myTasksOnly) setMyTasksOnly(true);
            }}
            className={cn("px-4 h-9 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-1.5 cursor-pointer border", 
              focusMode 
                ? "bg-blue-600 border-blue-500 text-white shadow-glow-blue" 
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
            )}
          >
            <Target className={cn("h-4 w-4", focusMode && "animate-pulse")} />
            {focusMode ? "Exit Focus" : "Focus Mode"}
          </button>

          {!focusMode && (
            <div className="flex items-center space-x-2 bg-white/[0.02] px-3.5 h-9 rounded-xl border border-white/10 text-xs">
              <span className={myTasksOnly ? "text-white/40 font-bold" : "font-bold text-white"}>Team</span>
              <button 
                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${myTasksOnly ? 'bg-blue-600 shadow-glow-blue' : 'bg-white/10'}`}
                onClick={() => {
                  if (role !== "intern") setMyTasksOnly(!myTasksOnly);
                }}
                disabled={role === "intern"}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 shadow-sm transition-all ${myTasksOnly ? 'left-5' : 'left-0.5'}`} />
              </button>
              <span className={myTasksOnly ? "font-bold text-white" : "text-white/40 font-bold"}>Mine</span>
            </div>
          )}

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
          <Clock className="h-6 w-6 text-blue-500 animate-spin" />
        </div>
      ) : focusMode ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 bg-white/[0.01] border border-white/[0.05] rounded-2xl p-6 flex flex-col items-center overflow-y-auto"
        >
          <div className="max-w-2xl w-full">
            <div className="text-center mb-8">
              <h2 className="text-base font-bold text-white">Your Focus for Today</h2>
              <p className="text-xs text-white/40 mt-1">Complete these {focusTasks.length} high-priority items.</p>
            </div>

            <div className="space-y-4">
              <AnimatePresence>
                {focusTasks.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 bg-white/[0.01] border border-white/[0.05] border-dashed rounded-2xl">
                    <CheckSquare className="h-10 w-10 text-white/20 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">All caught up!</h3>
                    <p className="text-xs text-white/30 mt-1">You have no urgent tasks due today.</p>
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
                      <Card className={cn("glass-card overflow-hidden border-white/[0.08] bg-white/[0.02] relative group", 
                        task.priority === "urgent" ? "border-rose-500/30" : "",
                        task.blocked ? "opacity-60" : ""
                      )}>
                        {task.priority === "urgent" && !task.blocked && (
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                        )}
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            <button className="mt-1 w-5 h-5 rounded border-2 border-white/20 flex items-center justify-center hover:border-blue-500 hover:bg-blue-500/10 transition-colors shrink-0 cursor-pointer">
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="badge bg-white/5 border border-white/10 text-white/50 text-[9px] font-bold py-0.5 uppercase tracking-wider">
                                  {task.projectName || "Project"}
                                </span>
                                {task.priority === "urgent" && <span className="badge status-critical font-bold text-[9px] py-0.5 uppercase tracking-wider">Urgent</span>}
                                {task.blocked && <span className="badge status-draft font-bold text-[9px] py-0.5 uppercase tracking-wider flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Blocked</span>}
                              </div>
                              <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors leading-snug">{task.title}</h3>
                              
                              <div className="flex items-center gap-4 mt-4 text-xs font-bold uppercase tracking-wider">
                                {task.dueDate && (
                                  <div className={cn("flex items-center gap-1 px-2.5 h-6 rounded-lg text-[9px] font-bold uppercase", 
                                    isOverdue(task.dueDate) ? "bg-rose-950/40 border border-rose-500/20 text-rose-300" : "bg-amber-950/40 border border-amber-500/20 text-amber-300"
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    {isOverdue(task.dueDate) ? "Overdue" : "Due Today"}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-white/30 text-[9px] font-bold">
                                  <CheckSquare className="w-3 h-3 text-blue-400/80" /> 2/5 Subtasks
                                </div>
                                <button className="ml-auto btn-ghost py-1 px-3 h-7 text-[10px] font-bold flex items-center gap-1 border-white/10 text-white/70 hover:text-white cursor-pointer">
                                  <Play className="w-2.5 h-2.5 fill-current text-emerald-400" /> Start
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
                <div key={column.id} className="flex flex-col w-[300px] max-h-full bg-white/[0.02] rounded-2xl border border-white/[0.06] shadow-sm shrink-0">
                  <div className="p-3 border-b border-white/[0.06] bg-blue-950/30 rounded-t-2xl flex justify-between items-center backdrop-blur-sm shrink-0">
                    <h3 className="font-bold text-xs text-white uppercase tracking-wider">{column.title}</h3>
                    <Badge className="bg-white/5 border border-white/10 text-white/60 font-mono text-[10px]">{tasks[column.id].length}</Badge>
                  </div>
                  
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div 
                        {...provided.droppableProps} 
                        ref={provided.innerRef}
                        className={cn("flex-1 p-3 overflow-y-auto min-h-[400px] transition-colors rounded-b-2xl max-h-[500px]", 
                          snapshot.isDraggingOver ? "bg-blue-600/5 ring-1 ring-blue-500/10" : ""
                        )}
                      >
                        {tasks[column.id].map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <Card 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  "mb-3 cursor-grab border-white/[0.08] bg-[#0c1322]/80 hover:bg-[#0c1322] transition-all relative overflow-hidden group", 
                                  snapshot.isDragging ? 'shadow-xl ring-1 ring-blue-500/30 rotate-1 bg-blue-950/90' : 'shadow-sm',
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
                                      <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 px-1.5 h-4 bg-white/5 text-white/50 border-white/10">
                                        {task.projectName || "Project"}
                                      </Badge>
                                      {task.blocked && <span title="Blocked"><Lock className="w-3 h-3 text-white/30" /></span>}
                                    </div>
                                  </div>
                                  
                                  <p className="text-xs font-bold text-white mb-3 leading-snug line-clamp-2 group-hover:text-blue-400 transition-colors">
                                    {task.title}
                                  </p>
                                  
                                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/[0.04]">
                                    <div className="flex gap-2 text-white/40 text-[9px] font-bold">
                                      <div className="flex items-center gap-1 hover:text-white/70 transition-colors">
                                        <CheckSquare className="w-3 h-3 text-blue-400" /> 0/3
                                      </div>
                                      <div className="flex items-center gap-1 hover:text-white/70 transition-colors">
                                        <MessageSquare className="w-3 h-3" /> 2
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      {task.dueDate && (
                                        <div className={cn("flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase", 
                                          isOverdue(task.dueDate) ? 'bg-rose-950/40 border border-rose-500/20 text-rose-300' : 
                                          isToday(task.dueDate) ? 'bg-amber-950/40 border border-amber-500/20 text-amber-300' : 
                                          'bg-white/5 text-white/50 border border-white/10'
                                        )}>
                                          <Clock className="w-2.5 h-2.5" />
                                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                      )}
                                      <Avatar className="w-5 h-5 border border-white/10 shadow-sm">
                                        <AvatarFallback className="bg-blue-800 text-[8px] font-bold text-blue-200">
                                          {task.assignedTo ? "JD" : "?"}
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
                          className="w-full text-white/30 hover:text-white justify-start h-8 px-2 text-xs mt-1 hover:bg-white/5 rounded-xl transition-all font-bold border border-dashed border-white/5 hover:border-white/15 flex items-center cursor-pointer"
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
        <DialogContent className="bg-[#0f172a] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Task Title</label>
              <Input
                required
                placeholder="What needs to be done?"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}
                  className="flex h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 text-white appearance-none"
                >
                  <option value="low" className="bg-[#0f172a]">Low</option>
                  <option value="normal" className="bg-[#0f172a]">Normal</option>
                  <option value="high" className="bg-[#0f172a]">High</option>
                  <option value="urgent" className="bg-[#0f172a]">Urgent</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Due Date</label>
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            </div>
            <DialogFooter className="mt-6 border-t-0 pt-4">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 text-sm font-bold text-white/70 hover:text-white transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
              >
                {isSubmitting ? "Adding..." : "Add Task"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
