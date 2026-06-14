"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Plus, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OKRManagement() {
  const { user, role } = useAuth();
  const [okrs, setOkrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [objective, setObjective] = useState("");
  const [keyResult, setKeyResult] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "okrs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOkrs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Firestore onSnapshot error (okrs):", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddOKR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective || !keyResult) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "okrs"), {
        objective,
        keyResult,
        targetValue,
        currentValue: 0,
        assignedTo: assignedTo || "Company-Wide",
        status: "on_track",
        createdAt: serverTimestamp(),
        createdBy: user?.uid
      });
      setIsAddOpen(false);
      setObjective("");
      setKeyResult("");
      setTargetValue("");
      setAssignedTo("");
    } catch (err) {
      console.error("Error adding OKR:", err);
    }
    setIsSubmitting(false);
  };

  return (
    <RoleGuard permission="MANAGE_USERS" fallback={<div className="p-8 text-center text-foreground/40 font-bold uppercase tracking-wider text-xs">Access Denied. Only authorized HR personnel can manage corporate OKRs.</div>}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
              <Target className="h-8 w-8 text-blue-400" /> Goal Tracking (OKRs)
            </h1>
            <p className="text-foreground/40 mt-1">Set, track, and manage Objectives and Key Results.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold h-10 px-5 bg-blue-600 hover:bg-blue-700 text-foreground shadow-md transition-all hover:translate-y-[-1px]">
              <Plus className="mr-2 h-4 w-4" /> New Goal
            </DialogTrigger>
            <DialogContent className="bg-[#121813] border-border rounded-2xl shadow-xl text-foreground">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-foreground">Create New Objective</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOKR} className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground/60 uppercase">Objective (The Goal)</label>
                  <Input required placeholder="E.g., Increase organic website traffic" value={objective} onChange={e => setObjective(e.target.value)} className="bg-muted/40 border-border rounded-xl text-foreground" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground/60 uppercase">Key Result (How to measure it)</label>
                  <Input required placeholder="E.g., Reach 50k monthly visitors" value={keyResult} onChange={e => setKeyResult(e.target.value)} className="bg-muted/40 border-border rounded-xl text-foreground" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/60 uppercase">Target Value (Numeric)</label>
                    <Input required type="number" placeholder="50000" value={targetValue} onChange={e => setTargetValue(e.target.value)} className="bg-muted/40 border-border rounded-xl text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/60 uppercase">Assign To</label>
                    <Input placeholder="Employee Name or Dept" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="bg-muted/40 border-border rounded-xl text-foreground" />
                  </div>
                </div>
                <DialogFooter className="pt-4 gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} className="rounded-xl border-border text-foreground bg-transparent hover:bg-muted/40">Cancel</Button>
                  <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-foreground rounded-xl font-semibold">Save OKR</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="p-8 text-center text-foreground/40">Loading goals...</div>
        ) : okrs.length === 0 ? (
          <Card className="border-dashed border-border bg-white/[0.01] rounded-2xl">
            <CardContent className="p-12 text-center flex flex-col items-center justify-center">
              <TrendingUp className="h-12 w-12 text-foreground/20 mb-3" />
              <h3 className="text-lg font-bold text-foreground">No Goals Set</h3>
              <p className="text-sm text-foreground/40 mt-1">Start by adding a company-wide or department OKR.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {okrs.map(okr => {
              const target = parseFloat(okr.targetValue) || 100;
              const current = parseFloat(okr.currentValue) || 0;
              const progress = Math.min(100, Math.round((current / target) * 100));
              
              return (
                <Card key={okr.id} className="border-border bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 rounded-2xl overflow-hidden shadow-sm hover:shadow-md">
                  <CardHeader className="pb-3 border-b border-border/30 bg-white/[0.01]">
                    <div className="flex justify-between items-start gap-4">
                      <CardTitle className="text-lg font-bold leading-tight text-foreground">{okr.objective}</CardTitle>
                      <Badge variant="outline" className={cn(
                        "whitespace-nowrap capitalize font-semibold shadow-none rounded-lg",
                        progress >= 100 ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/10" : 
                        progress > 30 ? "border-blue-500/20 text-blue-400 bg-blue-500/10" : "border-amber-500/20 text-amber-400 bg-amber-500/10"
                      )}>
                        {progress >= 100 ? "Completed" : okr.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <p className="text-xs font-bold text-foreground/40 uppercase tracking-wider mb-1">Key Result</p>
                      <p className="text-sm text-foreground/80 font-medium">{okr.keyResult}</p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground/40 font-medium">{current} / {target}</span>
                        <span className="font-bold text-blue-400">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2 bg-muted/80" />
                    </div>
                    
                    <div className="pt-3 border-t border-border/30 flex justify-between items-center text-xs">
                      <span className="text-foreground/40">Assigned: <strong className="text-blue-300">{okr.assignedTo}</strong></span>
                      <button className="text-blue-400 hover:text-blue-300 font-semibold hover:underline">Update Progress</button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
