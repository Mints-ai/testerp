"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, CalendarClock } from "lucide-react";
import Link from "next/link";
import { generateInternCertificate } from "@/lib/pdfGenerator";
import { RoleGuard } from "@/components/layout/RoleGuard";

export default function InternManagement() {
  const [interns, setInterns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch only active interns without requiring composite index (sorted in memory)
    const q = query(
      collection(db, "employees"),
      where("isActive", "==", true),
      where("isIntern", "==", true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // Sort alphabetically by fullName in memory
      ints.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
      setInterns(ints);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const calculateProgress = (dateJoined: any, internEndDate: string) => {
    if (!dateJoined || !internEndDate) return 0;
    
    // Check if it's a Firestore timestamp or string
    const start = dateJoined.seconds ? new Date(dateJoined.seconds * 1000) : new Date(dateJoined);
    const end = new Date(internEndDate);
    const now = new Date();
    
    if (now < start) return 0;
    if (now > end) return 100;
    
    const totalDuration = end.getTime() - start.getTime();
    const elapsedDuration = now.getTime() - start.getTime();
    
    return Math.round((elapsedDuration / totalDuration) * 100);
  };

  const getDaysRemaining = (internEndDate: string) => {
    if (!internEndDate) return "TBD";
    
    const end = new Date(internEndDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "Completed";
    if (diffDays === 0) return "Ends today";
    return `${diffDays} days left`;
  };

  return (
    <RoleGuard permission="VIEW_ALL_EMPLOYEES" fallback={<div className="p-8 text-center text-foreground/40 font-bold uppercase tracking-wider text-xs">Access Denied. Only HR personnel can view active intern trackers.</div>}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Intern Management</h1>
          <p className="text-foreground/40 mt-1">Track internship progress and generate completion certificates.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : interns.length === 0 ? (
          <div className="text-center p-12 bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl rounded-2xl">
            <h3 className="text-lg font-medium text-foreground/80">No active interns found</h3>
            <p className="text-sm text-foreground/40 mt-1">When interns are added, they will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {interns.map((intern) => {
              const progress = calculateProgress(intern.dateJoined, intern.internEndDate);
              const daysRemaining = getDaysRemaining(intern.internEndDate);
              const isEndingSoon = daysRemaining.includes("days left") && parseInt(daysRemaining) <= 7;
              
              return (
                <div key={intern.id} className="overflow-hidden border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] backdrop-blur-xl transition-all shadow-card rounded-2xl flex flex-col justify-between">
                  <div>
                    <div className="p-5 pb-4 bg-white/[0.01] border-b border-white/[0.06]">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12 border border-border shadow-glow-blue/20">
                            <AvatarImage src={intern.profilePhotoURL} alt={intern.fullName} />
                            <AvatarFallback className="bg-blue-500/10 text-blue-300 font-bold">
                              {getInitials(intern.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="text-base font-bold text-foreground hover:text-blue-400 transition-colors">
                              <Link href={`/dashboard/hr/${intern.id}`}>
                                {intern.fullName}
                              </Link>
                            </h3>
                            <div className="text-xs text-foreground/40 font-bold uppercase tracking-wider mt-0.5">{intern.department || "No Department"}</div>
                          </div>
                        </div>
                        {isEndingSoon && (
                          <Badge variant="destructive" className="bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold shadow-none hover:bg-amber-500/20">Ending Soon</Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-5 space-y-5">
                      <div className="flex items-center gap-2 text-sm text-foreground/80">
                        <CalendarClock className="h-4 w-4 text-foreground/40" />
                        <span className="font-semibold">Ends:</span>
                        <span className="text-foreground/60">
                          {intern.internEndDate ? new Date(intern.internEndDate).toLocaleDateString() : 'TBD'}
                        </span>
                        <Badge variant="outline" className="ml-auto font-bold border-border text-foreground/60 bg-white/[0.02]">
                          {daysRemaining}
                        </Badge>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-foreground/40 font-bold uppercase tracking-wider">Internship Progress</span>
                          <span className="font-bold text-foreground/80">{progress}%</span>
                        </div>
                        {/* High-fidelity glowing custom progress bar */}
                        <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-glow-blue transition-all duration-300 rounded-full" 
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <div className="pt-4 flex justify-between gap-3 border-t border-white/[0.06]">
                      <Button variant="outline" className="w-full border-border text-foreground/60 hover:text-foreground hover:bg-muted/40 font-semibold rounded-xl cursor-pointer" render={<Link href={`/dashboard/hr/${intern.id}`} />} nativeButton={false}>
                        View Profile
                      </Button>
                      <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-foreground shadow-glow-blue border-0 rounded-xl font-bold gap-2 cursor-pointer" 
                        onClick={() => generateInternCertificate(intern.fullName, intern.department || "General", new Date().toLocaleDateString())}
                      >
                        <FileText className="h-4 w-4" /> Certificate
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
