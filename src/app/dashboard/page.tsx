"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Briefcase, Users, CheckCircle2, Clock, Check, X, AlertCircle, Heart, Zap } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, AreaChart, Area } from "recharts";
import { motion } from "framer-motion";

// Mock data for sparklines (Cleared for production)
const taskData: any[] = [];
const projData: any[] = [];
const teamData: any[] = [];
const hoursData: any[] = [];

// Clean Attendance Heatmap Data (12 weeks, 5 days a week, all zeroes)
const heatmapData: number[][] = Array(12).fill(Array(5).fill(0));

export default function DashboardHome() {
  const { user, role } = useAuth();
  const [shoutouts, setShoutouts] = useState<any[]>([]);
  const [newShoutout, setNewShoutout] = useState("");
  const [isSubmittingShoutout, setIsSubmittingShoutout] = useState(false);
  const [stats, setStats] = useState({
    openTasks: 0,
    activeProjects: 0,
    teamSize: 0,
    onlineCount: 0,
    pendingLeaves: 0,
    pendingApprovals: [] as any[]
  });
  const [loadingStats, setLoadingStats] = useState(true);
  
  const isExecutive = role === "founder" || role === "c_suite" || role === "manager";

  useEffect(() => {
    if (!user) return;
    
    const loadStats = async () => {
      try {
        const { collection, query, where, getDocs } = await import("firebase/firestore");
        
        // 1. Active Employees Count & Online Users Count
        const employeesSnap = await getDocs(query(collection(db, "employees"), where("isActive", "==", true)));
        const empCount = employeesSnap.size;
        
        let onlineUsers = 0;
        const now = Date.now();
        employeesSnap.docs.forEach(doc => {
          const emp = doc.data();
          if (emp.lastSeenAt) {
            const lastSeenTime = new Date(emp.lastSeenAt).getTime();
            if (now - lastSeenTime < 5 * 60 * 1000) {
              onlineUsers++;
            }
          }
        });
        
        // 2. Open Tasks
        const tasksSnap = await getDocs(collection(db, "tasks"));
        const taskCount = tasksSnap.docs.filter(doc => doc.data().status !== "completed").length;
        
        // 3. Active Projects Count
        const projectsSnap = await getDocs(query(collection(db, "projects")));
        const projectCount = projectsSnap.size;
        
        // 4. Pending Leaves List & Count
        const leavesSnap = await getDocs(query(collection(db, "leaves"), where("status", "==", "pending")));
        const leaveCount = leavesSnap.size;
        const approvals = leavesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setStats({
          openTasks: taskCount,
          activeProjects: projectCount,
          teamSize: empCount,
          onlineCount: onlineUsers,
          pendingLeaves: leaveCount,
          pendingApprovals: approvals
        });
      } catch (err) {
        console.error("Error loading dashboard stats:", err);
      } finally {
        setLoadingStats(false);
      }
    };

    loadStats();
    
    // Listen to Shoutouts
    import("firebase/firestore").then(({ collection, query, orderBy, limit, onSnapshot }) => {
      const q = query(collection(db, "shoutouts"), orderBy("createdAt", "desc"), limit(5));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setShoutouts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (error) => {
        console.error("Firestore onSnapshot error (shoutouts):", error);
      });
      return unsubscribe;
    });
  }, [user]);

  const handleAction = async (id: string, newStatus: "approved" | "rejected") => {
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "leaves", id), {
        status: newStatus,
        approvedBy: user?.displayName || "System Administrator",
        updatedAt: new Date().toISOString()
      });
      setStats(prev => ({
        ...prev,
        pendingLeaves: Math.max(0, prev.pendingLeaves - 1),
        pendingApprovals: prev.pendingApprovals.filter(a => a.id !== id)
      }));
    } catch (err) {
      console.error("Error updating leave request:", err);
    }
  };

  const handlePostShoutout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShoutout.trim() || !user) return;
    
    setIsSubmittingShoutout(true);
    try {
      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collection(db, "shoutouts"), {
        text: newShoutout,
        authorId: user.uid,
        authorName: user.fullName || user.displayName || "Team Member",
        createdAt: serverTimestamp()
      });
      setNewShoutout("");
    } catch (err) {
      console.error("Error posting shoutout:", err);
    }
    setIsSubmittingShoutout(false);
  };

  return (
    <div className="flex gap-6 h-full min-h-screen pb-24 text-white">
      {/* MAIN CONTENT AREA */}
      <div className="flex-1 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-500 fill-blue-500/10 animate-pulse" />
            {isExecutive ? "Command Center" : "My Workspace"}
          </h1>
          <p className="text-xs text-white/40 mt-1">
            {isExecutive 
              ? "Here is the top-level activity and operational health for Mints Global."
              : `Welcome back, ${user?.displayName?.split(" ")[0] || "User"}. Here's what's on your desk today.`}
          </p>
        </div>

        {/* Sparkline Stat Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card overflow-hidden group border-white/[0.08] bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
              <CardTitle className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Open Tasks</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent className="z-10 relative pb-14">
              <div className="stat-number">{stats.openTasks}</div>
              <p className="text-[10px] text-white/40 mt-1">Live operational tasks</p>
            </CardContent>
            <div className="absolute bottom-0 left-0 right-0 h-14 opacity-20 group-hover:opacity-40 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={taskData}>
                  <defs>
                    <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#2563eb" fillOpacity={1} fill="url(#colorTasks)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {isExecutive && (
            <>
              <Card className="glass-card overflow-hidden group border-white/[0.08] bg-white/[0.02]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
                  <CardTitle className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Active Projects</CardTitle>
                  <Briefcase className="h-4 w-4 text-cyan-400" />
                </CardHeader>
                <CardContent className="z-10 relative pb-14">
                  <div className="stat-number">{stats.activeProjects}</div>
                  <p className="text-[10px] text-white/40 mt-1">Actively loaded projects</p>
                </CardContent>
                <div className="absolute bottom-0 left-0 right-0 h-14 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={projData}>
                      <Line type="monotone" dataKey="v" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="glass-card overflow-hidden group border-white/[0.08] bg-white/[0.02]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
                  <CardTitle className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Team Size</CardTitle>
                  <Users className="h-4 w-4 text-violet-400" />
                </CardHeader>
                <CardContent className="z-10 relative pb-14">
                  <div className="stat-number flex items-baseline gap-2">
                    <span>{stats.teamSize}</span>
                    {stats.onlineCount > 0 && (
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                        {stats.onlineCount} Active
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">Onboarded employees</p>
                </CardContent>
                <div className="absolute bottom-0 left-0 right-0 h-14 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={teamData}>
                      <defs>
                        <linearGradient id="colorTeam" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="step" dataKey="v" stroke="#7c3aed" fillOpacity={1} fill="url(#colorTeam)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}

          <Card className="glass-card overflow-hidden group border-white/[0.08] bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
              <CardTitle className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Hours Logged</CardTitle>
              <Clock className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent className="z-10 relative pb-14">
              <div className="stat-number">0<span className="text-xs text-white/30 font-sans ml-0.5">h</span></div>
              <p className="text-[10px] text-white/40 mt-1">Current operational week</p>
            </CardContent>
            <div className="absolute bottom-0 left-0 right-0 h-14 opacity-20 group-hover:opacity-40 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hoursData}>
                  <Line type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} dot={{ r: 2, fill: "#10b981" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 h-auto">
          {/* Recent Activity / Tasks */}
          <div className="md:col-span-2 lg:col-span-4 space-y-6 flex flex-col">
            <Card className="glass bg-white/[0.02] border-white/[0.08]">
              <CardHeader className="pb-3 border-b border-white/[0.06]">
                <CardTitle className="text-sm font-bold text-white">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-white/[0.04]">
                  <div className="p-8 text-center text-xs text-white/40 italic">
                    No recent activity recorded.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TEAM SHOUTOUTS */}
            <Card className="glass bg-white/[0.02] border-white/[0.08] flex-1 flex flex-col">
              <CardHeader className="pb-3 border-b border-white/[0.06] flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Heart className="h-4 w-4 text-red-400 fill-red-400/20" /> Team Shoutouts
                  </CardTitle>
                  <CardDescription className="text-[10px] text-white/40 mt-1">Recognize your peers for great work</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col gap-4">
                <form onSubmit={handlePostShoutout} className="flex gap-2">
                  <Input 
                    placeholder="Give a shoutout to someone..." 
                    value={newShoutout}
                    onChange={(e) => setNewShoutout(e.target.value)}
                    className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 flex-1"
                  />
                  <button type="submit" disabled={isSubmittingShoutout || !newShoutout.trim()} className="btn-primary h-9 text-xs py-0 px-4 shrink-0 flex items-center justify-center font-bold">
                    Post
                  </button>
                </form>
                
                <div className="space-y-2.5 overflow-y-auto max-h-[260px] pr-1">
                  {shoutouts.length === 0 ? (
                    <div className="text-center py-6 text-white/20 text-xs font-semibold">No shoutouts yet. Be the first!</div>
                  ) : (
                    shoutouts.map((shout: any) => (
                      <div key={shout.id} className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06] shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-cyan-500"></div>
                        <p className="text-xs text-white/80 font-medium leading-relaxed pl-2">"{shout.text}"</p>
                        <p className="text-[9px] text-white/40 mt-2 pl-2 flex justify-between">
                          <span className="font-bold text-blue-400/80">— {shout.authorName}</span>
                          <span className="font-mono">{shout.createdAt ? new Date(shout.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 lg:col-span-3 space-y-6 flex flex-col">
            {/* Announcements */}
            <Card className="glass bg-white/[0.02] border-white/[0.08] overflow-hidden">
              <CardHeader className="bg-blue-950/60 border-b border-white/[0.06] pb-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-400" />
                  Notice Board
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 h-[180px] overflow-y-auto">
                <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.06] shadow-sm border-l-4 border-l-blue-500 hover:bg-white/[0.04] transition-all">
                  <p className="font-bold text-xs text-white">Q3 Planning Meeting</p>
                  <p className="text-[10px] text-white/45 mt-1 leading-relaxed">Tomorrow at 10:00 AM AST. All department heads must attend.</p>
                </div>
                <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.06] shadow-sm border-l-4 border-l-cyan-500 hover:bg-white/[0.04] transition-all">
                  <p className="font-bold text-xs text-white">New Client Onboarding</p>
                  <p className="text-[10px] text-white/45 mt-1 leading-relaxed">Please welcome Al Safa Group to the SEO portfolio.</p>
                </div>
              </CardContent>
            </Card>

            {/* Attendance Heatmap */}
            <Card className="glass bg-white/[0.02] border-white/[0.08] flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-white">Attendance Heatmap</CardTitle>
                <CardDescription className="text-[10px] text-white/40">Your activity over the last 12 weeks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {heatmapData.map((week, wIdx) => (
                    <div key={wIdx} className="flex flex-col gap-1">
                      {week.map((day, dIdx) => {
                        let colorClass = "bg-white/[0.04] hover:bg-white/[0.08]"; // absent/weekend
                        if (day === 1) colorClass = "bg-blue-600/35 hover:bg-blue-600/50"; // late/half-day
                        if (day === 2) colorClass = "bg-blue-500 hover:bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.4)]"; // present
                        if (day === 3) colorClass = "bg-cyan-500 hover:bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]"; // overtime
                        
                        return (
                          <div 
                            key={dIdx} 
                            className={`w-3 h-3 rounded-[3px] ${colorClass} cursor-help transition-all duration-150 border border-transparent`}
                            title={`Status level: ${day}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4 text-[9px] text-white/30 font-bold uppercase tracking-wider">
                  <span>Less</span>
                  <div className="w-2.5 h-2.5 rounded-[2px] bg-white/[0.04]" />
                  <div className="w-2.5 h-2.5 rounded-[2px] bg-blue-600/35" />
                  <div className="w-2.5 h-2.5 rounded-[2px] bg-blue-500" />
                  <div className="w-2.5 h-2.5 rounded-[2px] bg-cyan-500" />
                  <span>More</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* RIGHT RAIL - PENDING APPROVALS */}
      {isExecutive && (
        <div className="hidden xl:block w-72 shrink-0">
          <div className="sticky top-24 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Approvals</h3>
              <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/20 font-mono text-[10px]">{stats.pendingLeaves} tasks</Badge>
            </div>

            <div className="space-y-3">
              {stats.pendingApprovals.length === 0 ? (
                <div className="text-center py-8 text-white/30 bg-white/[0.01] border border-white/[0.05] rounded-2xl text-[10px] font-semibold tracking-wide uppercase">
                  🎉 All Caught Up!
                </div>
              ) : (
                stats.pendingApprovals.map((approval) => (
                  <div key={approval.id} className="bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] shadow-sm relative group hover:bg-white/[0.03] transition-all">
                    <div className="absolute inset-0 border border-blue-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="badge status-pending font-bold text-[9px] py-0.5 uppercase">
                        {approval.leaveType || "Leave Request"}
                      </span>
                      <span className="text-[9px] font-mono text-white/30">
                        {approval.createdAt ? new Date(approval.createdAt).toLocaleDateString() : "Pending"}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white leading-tight">{approval.employeeName || "Mints Team Member"}</p>
                    <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed">
                      {approval.startDate} to {approval.endDate}
                    </p>
                    <p className="text-[9px] italic text-blue-400/70 mt-1 leading-snug">
                      "{approval.reason || "No reason provided"}"
                    </p>
                    <div className="flex gap-2 mt-3.5">
                      <button 
                        onClick={() => handleAction(approval.id, "approved")}
                        className="flex-grow btn-primary py-1 px-3 text-[10px] h-7 font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button 
                        onClick={() => handleAction(approval.id, "rejected")}
                        className="flex-grow btn-ghost py-1 px-3 text-[10px] h-7 font-semibold flex items-center justify-center gap-1 border-white/5 hover:border-red-500/20 hover:text-red-400 hover:bg-red-500/5 cursor-pointer"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
