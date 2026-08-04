"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, getDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, CalendarDays, FileText, User } from "lucide-react";
import { cn, sendDiscordNotification } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

// Time and Date formatting helpers
const formatTimeString = (timeStr: string) => {
  if (!timeStr) return "";
  try {
    const parts = timeStr.split(":");
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  } catch {
    return timeStr;
  }
};

const formattedDateLabel = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() + userTimezoneOffset);
    return localDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const getInitials = (name: string) => {
  if (!name) return "U";
  return name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
};

export function CorrectionRequestsTab() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Fetch pending requests in real-time
  useEffect(() => {
    const q = query(
      collection(db, "attendanceCorrections"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(list);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to attendance corrections:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAction = async (request: any, action: "approved" | "rejected") => {
    setActioningId(request.id);
    try {
      // 1. Update correction request status in DB
      await updateDoc(doc(db, "attendanceCorrections", request.id), {
        status: action,
        handledAt: new Date().toISOString()
      });

      if (action === "approved") {
        // 2. Perform Timesheet self-healing/override in 'attendance' collection
        const attendanceDocId = `${request.uid}_${request.date}`;
        const attDocRef = doc(db, "attendance", attendanceDocId);
        const attDocSnap = await getDoc(attDocRef);

        let finalIn = request.proposedClockIn;
        let finalOut = request.proposedClockOut;

        // If attendance document already exists, preserve unmodified logs if possible, otherwise overlay
        if (attDocSnap.exists()) {
          const currentData = attDocSnap.data();
          const currentLogs = currentData.logs || [];
          
          let updatedLogs = [...currentLogs];

          if (request.requestType === "in") {
            // Replace first 'in' log or prepend
            const inIdx = updatedLogs.findIndex(l => l.type === "in");
            const newLog = {
              type: "in",
              time: formatTimeString(finalIn),
              timestamp: new Date(`${request.date}T${finalIn}:00`).toISOString(),
              label: "Clocked In (Corrected)"
            };
            if (inIdx >= 0) {
              updatedLogs[inIdx] = newLog;
            } else {
              updatedLogs.unshift(newLog);
            }
            
            // Re-calculate working seconds based on first 'in' and last 'out' if existing
            const outLog = updatedLogs.find(l => l.type === "out");
            if (outLog) {
              const inSecs = new Date(newLog.timestamp).getTime();
              const outSecs = new Date(outLog.timestamp).getTime();
              const totalSecs = Math.max(0, Math.floor((outSecs - inSecs) / 1000));
              await setDoc(attDocRef, {
                logs: updatedLogs,
                totalWorkingSeconds: totalSecs,
                status: "out"
              }, { merge: true });
            } else {
              await setDoc(attDocRef, {
                logs: updatedLogs,
                status: "in",
                lastActionTimestamp: new Date(newLog.timestamp).getTime()
              }, { merge: true });
            }
          } else if (request.requestType === "out") {
            // Replace last 'out' log or append
            const outIdx = updatedLogs.slice().reverse().findIndex(l => l.type === "out");
            const newLog = {
              type: "out",
              time: formatTimeString(finalOut),
              timestamp: new Date(`${request.date}T${finalOut}:00`).toISOString(),
              label: "Clocked Out (Corrected)"
            };
            if (outIdx >= 0) {
              const realIdx = updatedLogs.length - 1 - outIdx;
              updatedLogs[realIdx] = newLog;
            } else {
              updatedLogs.push(newLog);
            }

            // Re-calculate working seconds based on first 'in' and last 'out'
            const inLog = updatedLogs.find(l => l.type === "in");
            if (inLog) {
              const inSecs = new Date(inLog.timestamp).getTime();
              const outSecs = new Date(newLog.timestamp).getTime();
              const totalSecs = Math.max(0, Math.floor((outSecs - inSecs) / 1000));
              await setDoc(attDocRef, {
                logs: updatedLogs,
                totalWorkingSeconds: totalSecs,
                status: "out"
              }, { merge: true });
            } else {
              await setDoc(attDocRef, {
                logs: updatedLogs,
                status: "out"
              }, { merge: true });
            }
          } else {
            // Type both
            const inSecs = parseInt(finalIn.split(":")[0]) * 3600 + parseInt(finalIn.split(":")[1]) * 60;
            const outSecs = parseInt(finalOut.split(":")[0]) * 3600 + parseInt(finalOut.split(":")[1]) * 60;
            const elapsed = Math.max(0, outSecs - inSecs);

            await setDoc(attDocRef, {
              status: "out",
              totalWorkingSeconds: elapsed,
              totalBreakSeconds: 0,
              lastActionTimestamp: Date.now(),
              logs: [
                {
                  type: "in",
                  time: formatTimeString(finalIn),
                  timestamp: new Date(`${request.date}T${finalIn}:00`).toISOString(),
                  label: "Clocked In (Corrected)"
                },
                {
                  type: "out",
                  time: formatTimeString(finalOut),
                  timestamp: new Date(`${request.date}T${finalOut}:00`).toISOString(),
                  label: "Clocked Out (Corrected)"
                }
              ]
            }, { merge: true });
          }
        } else {
          // Document does not exist: construct full manual sheet!
          if (request.requestType === "both" || (finalIn && finalOut)) {
            const inSecs = parseInt(finalIn.split(":")[0]) * 3600 + parseInt(finalIn.split(":")[1]) * 60;
            const outSecs = parseInt(finalOut.split(":")[0]) * 3600 + parseInt(finalOut.split(":")[1]) * 60;
            const elapsed = Math.max(0, outSecs - inSecs);

            await setDoc(attDocRef, {
              uid: request.uid,
              employeeName: request.employeeName,
              date: request.date,
              status: "out",
              totalWorkingSeconds: elapsed,
              totalBreakSeconds: 0,
              lastActionTimestamp: Date.now(),
              logs: [
                {
                  type: "in",
                  time: formatTimeString(finalIn),
                  timestamp: new Date(`${request.date}T${finalIn}:00`).toISOString(),
                  label: "Clocked In (Correction Override)"
                },
                {
                  type: "out",
                  time: formatTimeString(finalOut),
                  timestamp: new Date(`${request.date}T${finalOut}:00`).toISOString(),
                  label: "Clocked Out (Correction Override)"
                }
              ]
            });
          }
        }

        // Notify Discord (Success Approval)
        await sendDiscordNotification(
          `🔧 **Admin approved time correction** for **${request.employeeName}** on **${request.date}**.\n*Adjusted working times to Clock-in: ${formatTimeString(finalIn) || "N/A"} | Clock-out: ${formatTimeString(finalOut) || "N/A"}*`,
          undefined,
          'hr'
        );

        await addDoc(collection(db, "auditLog"), {
          actorId: user?.uid || "system",
          actorName: user?.fullName || "Admin",
          action: "ATTENDANCE_CORRECTION_APPROVE",
          targetCollection: "attendanceCorrections",
          targetId: request.id,
          details: `Approved attendance correction request for ${request.employeeName} on ${request.date} (Adjusted In: ${formatTimeString(finalIn) || "N/A"} | Out: ${formatTimeString(finalOut) || "N/A"})`,
          createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
        });
      } else {
        // Notify Discord (Rejection)
        await sendDiscordNotification(
          `❌ **Admin rejected time correction** for **${request.employeeName}** on **${request.date}**.`,
          undefined,
          'hr'
        );

        await addDoc(collection(db, "auditLog"), {
          actorId: user?.uid || "system",
          actorName: user?.fullName || "Admin",
          action: "ATTENDANCE_CORRECTION_REJECT",
          targetCollection: "attendanceCorrections",
          targetId: request.id,
          details: `Rejected attendance correction request for ${request.employeeName} on ${request.date}`,
          createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
        });
      }
    } catch (err) {
      console.error("Error executing correction decision:", err);
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-6 text-foreground pb-6">
      <Card className="border-border shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-lg">Pending Attendance Corrections</h3>
          </div>
          <Badge variant="outline" className="text-xs text-primary/80 font-bold bg-primary/10 border-primary/20 px-3 py-1 rounded-full shadow-none">
            {requests.length} Requests pending
          </Badge>
        </CardHeader>

        <CardContent className="p-6">
          {loading ? (
            <div className="py-12 text-center text-foreground/40 italic flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span>Querying pending correction logs...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center text-foreground/30 flex flex-col items-center justify-center">
              <Clock className="w-12 h-12 text-foreground/10 mb-3" />
              <p className="font-bold text-base text-foreground/60">No Pending Requests</p>
              <p className="text-xs text-foreground/40 mt-1 max-w-sm">All employee attendance adjustment requests are currently resolved.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {requests.map((req) => (
                <Card 
                  key={req.id} 
                  className="border border-border rounded-xl hover:border-border hover: transition-all relative overflow-hidden group flex flex-col justify-between"
                >
                  {/* Left accent strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-cyan-500"></div>
                  
                  <div className="p-5 pl-6 space-y-4">
                    {/* Employee Profile Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border bg-blue-950">
                          <AvatarFallback className="bg-primary/20 text-primary/70 font-bold text-xs">
                            {getInitials(req.employeeName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-sm text-foreground">{req.employeeName}</p>
                          <p className="text-xs text-foreground/40 font-semibold flex items-center gap-1">
                            <User className="w-3 h-3 text-primary" /> Employee ID: {req.uid.substring(0, 8)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary/80 border-primary/25 px-2 py-0.5 rounded-full font-mono shadow-none">
                        Pending
                      </Badge>
                    </div>

                    {/* Correction Proposed Values */}
                    <div className="grid grid-cols-2 gap-4 border border-border p-3 rounded-xl text-center">
                      <div>
                        <p className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Target Date</p>
                        <p className="text-xs font-bold text-foreground mt-1 font-mono">{formattedDateLabel(req.date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Adjustment Type</p>
                        <p className="text-xs font-bold text-cyan-300 mt-1 uppercase">
                          {req.requestType === "in" ? "Clock In" : req.requestType === "out" ? "Clock Out" : "Full Shift (Both)"}
                        </p>
                      </div>
                    </div>

                    {/* Target Adjusted Times */}
                    <div className="flex flex-col gap-2 border border-border p-3 rounded-xl">
                      <p className="text-xs text-foreground/30 uppercase tracking-wider font-bold">Proposed Correction:</p>
                      <div className="flex justify-between items-center text-xs">
                        {req.proposedClockIn && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground/45">Clock In:</span>
                            <Badge className="bg-emerald-500/10 text-accent border-emerald-500/20 font-bold font-mono text-xs">
                              {formatTimeString(req.proposedClockIn)}
                            </Badge>
                          </div>
                        )}
                        {req.proposedClockOut && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground/45">Clock Out:</span>
                            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-bold font-mono text-xs">
                              {formatTimeString(req.proposedClockOut)}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1 border border-border p-3 rounded-xl">
                      <p className="text-xs text-foreground/40 uppercase tracking-widest font-bold flex items-center gap-1">
                        <FileText className="w-3 h-3 text-primary" /> Explanation Reason
                      </p>
                      <p className="text-xs text-foreground/70 italic leading-relaxed">
                        "{req.reason || "No explanation provided."}"
                      </p>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="border-t border-border p-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAction(req, "approved")}
                      disabled={actioningId !== null}
                      className="flex-1 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-foreground font-bold rounded-lg border-0 cursor-pointer flex items-center justify-center gap-1"
                    >
                      {actioningId === req.id ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Approve Correction
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(req, "rejected")}
                      disabled={actioningId !== null}
                      className="flex-1 h-9 text-xs hover:bg-red-950/20 border-border hover:border-red-500/30 text-foreground/80 hover:text-red-400 font-semibold rounded-lg cursor-pointer flex items-center justify-center gap-1"
                    >
                      <X className="w-4 h-4" /> Deny
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
