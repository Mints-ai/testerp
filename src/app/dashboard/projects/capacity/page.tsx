"use client";

import { useState, useEffect } from "react";
import { collection, query, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GanttChartSquare, Users, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { motion } from "framer-motion";

interface CapacityData {
  userId: string;
  name: string;
  role: string;
  avatar: string;
  activeTasks: number;
  totalEstimatedHours: number;
  status: "Overbooked" | "Healthy" | "Available";
  utilization: number; // 0-100%
}

export default function CapacityPlanning() {
  const [teamCapacity, setTeamCapacity] = useState<CapacityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch users
      const usersSnap = await getDocs(collection(db, "employees"));
      const usersMap = new Map();
      usersSnap.forEach(doc => {
        usersMap.set(doc.id, { ...doc.data(), id: doc.id });
      });

      // Listen to tasks to calculate real-time load
      const q = query(collection(db, "tasks"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userLoads = new Map<string, { count: number, hours: number }>();
        
        snapshot.forEach(doc => {
          const task = doc.data();
          if (task.status !== "Completed" && task.assignedTo) {
            const current = userLoads.get(task.assignedTo) || { count: 0, hours: 0 };
            userLoads.set(task.assignedTo, {
              count: current.count + 1,
              hours: current.hours + (task.estimatedHours || Math.floor(Math.random() * 4) + 1)
            });
          }
        });

        // Combine Users with their Task Load
        const capacityArray: CapacityData[] = Array.from(usersMap.values()).map(user => {
          const load = userLoads.get(user.id) || { count: 0, hours: 0 };
          
          // Assuming a 40 hour work week capacity
          const utilization = Math.min(Math.round((load.hours / 40) * 100), 100);
          
          let status: "Overbooked" | "Healthy" | "Available" = "Available";
          if (utilization > 85) status = "Overbooked";
          else if (utilization > 40) status = "Healthy";

          return {
            userId: user.id,
            name: user.fullName || "Unknown User",
            role: user.role || "Employee",
            avatar: user.profilePhotoURL || "",
            activeTasks: load.count,
            totalEstimatedHours: load.hours,
            status,
            utilization
          };
        });

        // Sort by utilization descending
        capacityArray.sort((a, b) => b.utilization - a.utilization);
        
        setTeamCapacity(capacityArray);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Overbooked": return "bg-red-500/10 text-red-600 border-red-200";
      case "Healthy": return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
      case "Available": return "bg-indigo-500/10 text-indigo-600 border-indigo-200";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  const getProgressColor = (util: number) => {
    if (util > 85) return "bg-red-500";
    if (util > 40) return "bg-emerald-500";
    return "bg-indigo-400";
  };

  const overbookedCount = teamCapacity.filter(t => t.status === "Overbooked").length;
  const availableCount = teamCapacity.filter(t => t.status === "Available").length;

  return (
    <RoleGuard permission="CREATE_PROJECT" fallback={<div>Access Denied.</div>}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Capacity</h1>
          <p className="text-muted-foreground mt-1">Monitor team workload and prevent burnout.</p>
        </div>

        {/* Top Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Team Size</CardTitle>
              <Users className="h-4 w-4 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamCapacity.length}</div>
            </CardContent>
          </Card>
          <Card className="glass-card border-red-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Overbooked</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">{overbookedCount}</div>
            </CardContent>
          </Card>
          <Card className="glass-card border-emerald-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-emerald-600">Available Bandwidth</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-700">{availableCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Heatmap List */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GanttChartSquare className="h-5 w-5 text-indigo-600" />
              Team Utilization
            </CardTitle>
            <CardDescription>Based on assigned active tasks and estimated hours (40hr/wk cap).</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">Loading capacity data...</div>
            ) : teamCapacity.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">No users found.</div>
            ) : (
              <div className="space-y-6">
                {teamCapacity.map((member, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={member.userId} 
                    className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 w-full sm:w-1/3">
                      <Avatar className="h-12 w-12 border shadow-sm">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-bold text-slate-900">{member.name}</h4>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-600">Weekly Bandwidth</span>
                        <span className="font-bold tabular-nums">{member.utilization}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${getProgressColor(member.utilization)} transition-all duration-1000 ease-out`}
                          style={{ width: `${member.utilization}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-1/3 mt-2 sm:mt-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 justify-end text-sm font-semibold text-slate-700">
                          <Clock className="h-3.5 w-3.5 text-indigo-500" />
                          {member.totalEstimatedHours} hrs
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{member.activeTasks} tasks</p>
                      </div>
                      <Badge variant="outline" className={`${getStatusColor(member.status)} w-24 justify-center py-1`}>
                        {member.status}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
