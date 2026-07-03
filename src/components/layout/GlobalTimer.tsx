"use client";

import { useState, useEffect } from "react";
import { Play, Square, X, Clock, ChevronUp, ChevronDown, CheckCircle2 } from "lucide-react";
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Format seconds into HH:MM:SS
const formatTime = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export function GlobalTimer() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Fetch projects
  useEffect(() => {
    if (!user) return;
    const fetchProjects = async () => {
      try {
        // Fetch active projects
        const q = query(collection(db, "projects"), where("status", "in", ["planning", "active"]));
        const snap = await getDocs(q);
        const projs = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
        setProjects(projs);
      } catch (err) {
        console.error("Failed to fetch projects for timer:", err);
      }
    };
    fetchProjects();
  }, [user]);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem("mintsGlobal_timer");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.isRunning) {
          // Calculate how much time passed since last ping
          const now = Date.now();
          const diffSeconds = Math.floor((now - parsed.lastTick) / 1000);
          setElapsedSeconds(parsed.elapsedSeconds + diffSeconds);
          setIsRunning(true);
        } else {
          setElapsedSeconds(parsed.elapsedSeconds);
        }
        setSelectedProjectId(parsed.selectedProjectId || "");
        setTaskDescription(parsed.taskDescription || "");
      } catch (e) {
        console.error("Failed to parse timer state");
      }
    }
  }, []);

  // Timer interval and local storage sync
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => {
          const next = prev + 1;
          // Sync to local storage every second so we don't lose much if closed
          localStorage.setItem("mintsGlobal_timer", JSON.stringify({
            isRunning: true,
            elapsedSeconds: next,
            lastTick: Date.now(),
            selectedProjectId,
            taskDescription
          }));
          return next;
        });
      }, 1000);
    } else {
      // Sync stopped state
      localStorage.setItem("mintsGlobal_timer", JSON.stringify({
        isRunning: false,
        elapsedSeconds,
        lastTick: Date.now(),
        selectedProjectId,
        taskDescription
      }));
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, selectedProjectId, taskDescription, elapsedSeconds]);

  const handleStartStop = () => {
    setIsRunning(!isRunning);
    if (!isOpen) setIsOpen(true);
  };

  const handleSave = async () => {
    if (!user || elapsedSeconds < 60) {
      alert("Time logged must be at least 1 minute.");
      return;
    }
    
    setIsSaving(true);
    
    try {
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      
      await addDoc(collection(db, "time_logs"), {
        userId: user.uid,
        userName: user.fullName || user.displayName || "Unknown User",
        projectId: selectedProjectId || null,
        projectName: selectedProject?.name || null,
        description: taskDescription || "General task",
        durationSeconds: elapsedSeconds,
        billableHours: Number((elapsedSeconds / 3600).toFixed(2)),
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        timestamp: serverTimestamp()
      });
      
      // Reset
      setIsRunning(false);
      setElapsedSeconds(0);
      setTaskDescription("");
      // Keep project selected for convenience
      
      localStorage.removeItem("mintsGlobal_timer");
      alert("Time logged successfully!");
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to save time log:", err);
      alert("Failed to save time log. Try again.");
    }
    
    setIsSaving(false);
  };

  const handleDiscard = () => {
    if (confirm("Are you sure you want to discard this timer?")) {
      setIsRunning(false);
      setElapsedSeconds(0);
      setTaskDescription("");
      localStorage.removeItem("mintsGlobal_timer");
    }
  };

  // If there's no user, don't render
  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4 bg-background/95 rounded-2xl shadow-xl border border-border overflow-hidden w-[320px]"
          >
            <div className="border-b border-border text-white p-3 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Clock className="w-4 h-4 text-primary" />
                Time Tracker
              </div>
              <button onClick={() => setIsOpen(false)} className="hover: p-1 rounded-xl transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="text-center">
                <div className={cn("text-4xl font-mono font-black tracking-tight mb-1 transition-colors",
                  isRunning ? "text-primary" : "text-muted-foreground"
                )}>
                  {formatTime(elapsedSeconds)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                  {isRunning ? "Tracking..." : "Paused"}
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Project</label>
                  <Select value={selectedProjectId} onValueChange={(val) => setSelectedProjectId(val || "")}>
                    <SelectTrigger className="h-8 text-sm text-white border-border rounded-xl">
                      <SelectValue placeholder="Select a project..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card text-foreground border-border rounded-xl">
                      <SelectItem value="internal" className="focus: focus:text-foreground cursor-pointer">Internal / General</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id} className="focus: focus:text-foreground cursor-pointer">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">What are you working on?</label>
                  <Input 
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="E.g., Keyword research for SEO..." 
                    className="h-8 text-sm text-foreground placeholder:text-foreground/30 border-border rounded-xl focus:border-primary focus:ring-primary"
                  />
                </div>
              </div>
              
              <div className="pt-2 border-t border-border flex justify-between gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDiscard}
                  disabled={elapsedSeconds === 0}
                  className="w-full text-xs h-8 text-muted-foreground hover:text-foreground hover: border-border rounded-xl"
                >
                  Discard
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isSaving || elapsedSeconds === 0 || isRunning}
                  size="sm" 
                  className="w-full bg-primary hover:bg-primary/80 text-primary-foreground text-xs h-8 shadow-[0_0_20px_rgba(112,130,56,0.25)] border-0 rounded-xl font-bold cursor-pointer"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Log Time
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
 
      <button 
        onClick={handleStartStop}
        className={cn("flex items-center gap-2 rounded-full px-4 py-3 font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 border cursor-pointer",
          isRunning 
            ? "bg-primary text-primary-foreground border-0 shadow-[0_0_24px_rgba(112,130,56,0.3)] hover:bg-primary/80 animate-pulse-slow" 
            : " text-foreground border-border hover: shadow-card "
        )}
      >
        {isRunning ? (
          <>
            <Square className="w-4 h-4 fill-current text-muted-foreground" />
            <span className="font-mono text-white">{formatTime(elapsedSeconds)}</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current text-primary" />
            <span>{elapsedSeconds > 0 ? formatTime(elapsedSeconds) : "Start Timer"}</span>
          </>
        )}
      </button>
    </div>
  );
}
