"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Clock, Users, Coffee, Play, Square, Building2 } from "lucide-react";
import { ROLE_META } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const formatElapsed = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getInitials = (name: string) => {
  if (!name) return "U";
  return name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
};

export function CompanyOverview() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch employees
  useEffect(() => {
    const q = query(
      collection(db, "employees"),
      where("isActive", "==", true),
      orderBy("fullName")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch today's attendance
  useEffect(() => {
    const dateString = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, "attendance"),
      where("date", "==", dateString)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.uid) {
          records[data.uid] = { id: doc.id, ...data };
        }
      });
      setAttendanceRecords(records);
    });
    return () => unsubscribe();
  }, []);

  const filteredEmployees = employees.filter(emp => 
    emp.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.jobTitle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.06] backdrop-blur-[24px]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
          <Input
            placeholder="Search employees by name or title..."
            className="glass-input h-9 text-xs pl-10 border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-olive-200 bg-white shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-olive-100 bg-olive-50/50">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-olive-700" />
            <h3 className="font-bold text-olive-900 text-lg">Live Company Attendance</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-olive-50 text-olive-600 text-xs uppercase font-bold border-b border-olive-200">
                <tr>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Role / Dept</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Hours Worked Today</th>
                  <th className="px-6 py-4">Last Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-olive-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-olive-500 font-medium italic">
                      Loading organizational data...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-olive-500 font-medium italic">
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const record = attendanceRecords[emp.id];
                    const status = record?.status || "out";
                    const isOnline = emp.lastSeenAt && (Date.now() - new Date(emp.lastSeenAt).getTime() < 5 * 60 * 1000);
                    
                    let liveWorkingSeconds = record?.totalWorkingSeconds || 0;
                    if (status === "in" && record?.lastActionTimestamp) {
                      liveWorkingSeconds += Math.floor((Date.now() - record.lastActionTimestamp) / 1000);
                    }

                    const lastLog = record?.logs?.length > 0 ? record.logs[record.logs.length - 1] : null;

                    return (
                      <tr key={emp.id} className="hover:bg-olive-50/50 transition-colors bg-white">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="h-10 w-10 border border-olive-200 shadow-sm">
                                <AvatarImage src={emp.profilePhotoURL} />
                                <AvatarFallback className="bg-olive-100 text-olive-700 font-bold text-xs">
                                  {getInitials(emp.fullName)}
                                </AvatarFallback>
                              </Avatar>
                              {isOnline && (
                                <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white animate-pulse" title="Active in ERP" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-olive-900">{emp.fullName}</p>
                              <p className="text-[10px] text-olive-500 font-semibold">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5 items-start">
                            <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider font-bold shadow-none", ROLE_META[emp.role]?.color || "bg-olive-100 text-olive-700")}>
                              {emp.jobTitle || ROLE_META[emp.role]?.label || "Employee"}
                            </Badge>
                            {emp.department && (
                              <span className="text-[10px] font-semibold text-olive-600 flex items-center">
                                <Building2 className="w-3 h-3 mr-1" /> {emp.department}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {status === "in" ? (
                            <Badge className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border-emerald-200 font-bold shadow-none">
                              <Play className="w-3 h-3 mr-1" /> Clocked In
                            </Badge>
                          ) : status === "break" ? (
                            <Badge className="bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-200 font-bold shadow-none">
                              <Coffee className="w-3 h-3 mr-1" /> On Break
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-bold shadow-none">
                              <Square className="w-3 h-3 mr-1" /> Offline
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn("font-mono font-bold tabular-nums text-sm", liveWorkingSeconds > 0 ? "text-olive-900" : "text-olive-400")}>
                            {formatElapsed(liveWorkingSeconds)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {lastLog ? (
                            <div>
                              <p className="font-bold text-xs text-olive-800">{lastLog.label}</p>
                              <p className="text-[10px] text-olive-500 font-semibold mt-0.5"><Clock className="w-3 h-3 inline mr-1" />{lastLog.time}</p>
                            </div>
                          ) : (
                            <span className="text-[10px] text-olive-400 font-medium italic">No activity today</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
