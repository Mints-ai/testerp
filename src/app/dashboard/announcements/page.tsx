"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, addDoc, serverTimestamp, arrayUnion, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess, ROLE_META } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Megaphone, Pin, CheckCircle2, AlertCircle } from "lucide-react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const DEPARTMENTS = [
  "OPERATIONS",
  "IT & CYBER SECURITY",
  "MARKETING"
];

export default function Announcements() {
  const { user, role } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPostOpen, setIsPostOpen] = useState(false);
  
  // New Announcement State
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("all");
  const [targetValue, setTargetValue] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Enter your announcement here...</p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[150px] border rounded-md p-3',
      },
    },
  });

  const isManagerOrAbove = canAccess(role, "POST_ANNOUNCEMENT");

  useEffect(() => {
    if (!user || !role) return;

    // Fetch all announcements, we'll filter client side for complex audience logic
    // In production with larger datasets, you'd use a composite index or multiple queries
    const q = query(
      collection(db, "announcements"), 
      orderBy("isPinned", "desc"), 
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allAnns = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      // Filter based on audience
      // Support multiple departments via user.departments array
      const userDepts: string[] = user.departments || (user.department ? [user.department] : []);
      
      const visibleAnns = allAnns.filter(ann => {
        if (ann.audience === "all") return true;
        if (ann.audience === "department" && userDepts.includes(ann.targetValue)) return true;
        if (ann.audience === "role" && ann.targetValue === role) return true;
        // The creator can always see their posts
        if (ann.createdBy === user.uid) return true;
        
        return false;
      });

      setAnnouncements(visibleAnns);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, role]);

  const triggerNotificationHook = async (announcementData: any) => {
    console.log("🔔 [Notification Trigger Stub] Invoked Resend/Cloud Functions email trigger hook:", {
      service: "Resend",
      recipientGroup: announcementData.audience === "all" 
        ? "All Employees <all@mintsglobal.ae>" 
        : `${announcementData.targetValue} Audience <group@mintsglobal.ae>`,
      subject: `📢 New Mints Global Announcement: ${announcementData.title}`,
      meta: {
        pinned: announcementData.isPinned,
        postedBy: announcementData.creatorName
      }
    });
  };

  const handlePost = async () => {
    if (!user || !title || !editor) return;
    setIsSubmitting(true);
    
    try {
      const docRef = await addDoc(collection(db, "announcements"), {
        title,
        content: editor.getHTML(),
        audience,
        targetValue: audience !== "all" ? targetValue : "",
        isPinned,
        sendEmail, // A Cloud Function would pick this up and send the email
        createdBy: user.uid,
        creatorName: user.displayName,
        readBy: [],
        createdAt: serverTimestamp(),
      });

      // Fetch all employees to send internal mail notifications to targeted users
      const employeesSnap = await getDocs(collection(db, "employees"));
      const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // Filter target employees based on announcement scope
      const targetEmployees = employees.filter(emp => {
        // Exclude the creator from getting their own notice via email unless self-publishing is fine
        if (emp.id === user.uid) return false;

        if (audience === "all") return true;
        if (audience === "department") {
          const depts = emp.departments || (emp.department ? [emp.department] : []);
          return depts.includes(targetValue);
        }
        if (audience === "role") {
          return emp.role === targetValue;
        }
        return false;
      });

      // Dispatch secure internal mails for target audience
      const plainTextContent = editor.getText() || "A new notice has been published.";
      for (const emp of targetEmployees) {
        await addDoc(collection(db, "internal_mails"), {
          senderId: user.uid,
          senderName: user.fullName || user.displayName || "Mints Announcement System",
          senderEmail: user.email || "system@mintsglobal.com",
          receiverId: emp.id,
          receiverName: emp.fullName || "Employee",
          receiverEmail: emp.email || "",
          subject: `📢 Notice Board: ${title}`,
          body: `Hello ${emp.fullName || "Team Member"},\n\nA new corporate notice has been published on the Mints Global ERP:\n\nTitle: ${title}\nTarget Audience: ${audience === "all" ? "All Company" : audience.toUpperCase() + " (" + targetValue + ")"}\n\nNotice Body:\n----------------------------------------\n${plainTextContent}\n----------------------------------------\n\nPlease visit the Notice Board inside the ERP dashboard to view full formatting and pinned announcements.\n\nBest regards,\n${user.fullName || user.displayName || "Mints HR & Operations"}`,
          priority: isPinned ? "urgent" : "normal",
          readStatus: false,
          isStarredByReceiver: false,
          isStarredBySender: false,
          isDeletedBySender: false,
          isDeletedByReceiver: false,
          createdAt: serverTimestamp ? serverTimestamp() : new Date()
        });
      }
      
      // Trigger notification hook
      if (sendEmail) {
        await triggerNotificationHook({
          id: docRef.id,
          title,
          audience,
          targetValue: audience !== "all" ? targetValue : "",
          isPinned,
          creatorName: user.displayName
        });
      }

      setIsPostOpen(false);
      setTitle("");
      editor.commands.setContent('<p>Enter your announcement here...</p>');
      setAudience("all");
      setTargetValue("");
      setIsPinned(false);
      setSendEmail(false);
    } catch (err) {
      console.error("Error posting announcement:", err);
    }
    
    setIsSubmitting(false);
  };

  const markAsRead = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "announcements", id), {
        readBy: arrayUnion(user.uid)
      });
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Megaphone className="h-8 w-8 text-primary" />
            Notice Board
          </h1>
          <p className="text-foreground/40 mt-1">Company-wide and department announcements.</p>
        </div>
        
        {isManagerOrAbove && (
          <Dialog open={isPostOpen} onOpenChange={setIsPostOpen}>
            <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold h-10 px-5 bg-primary hover:bg-blue-700 text-foreground shadow-md transition-all hover:translate-y-[-1px]">
              Post Announcement
            </DialogTrigger>
            <DialogContent className="max-w-3xl bg-background border-border rounded-2xl shadow-xl text-foreground">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-foreground">New Announcement</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-foreground/60 uppercase">Announcement Title</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="E.g. Q3 Town Hall Meeting" className="border-border rounded-xl text-foreground" />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-foreground/60 uppercase">Message Content</Label>
                  <EditorContent editor={editor} className="border border-border rounded-xl text-foreground overflow-hidden" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground/60 uppercase">Target Audience</Label>
                    <Select value={audience} onValueChange={(val) => setAudience(val || "all")}>
                      <SelectTrigger className="border-border rounded-xl text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border text-foreground">
                        <SelectItem value="all">All Staff</SelectItem>
                        <SelectItem value="department">Specific Department</SelectItem>
                        <SelectItem value="role">Specific Role</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {audience === "department" && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-foreground/60 uppercase">Select Department</Label>
                      <Select value={targetValue} onValueChange={(val) => setTargetValue(val || "")}>
                        <SelectTrigger className="border-border rounded-xl text-foreground"><SelectValue placeholder="Choose department" /></SelectTrigger>
                        <SelectContent className="bg-background border-border text-foreground">
                          {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {audience === "role" && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-foreground/60 uppercase">Select Role</Label>
                      <Select value={targetValue} onValueChange={(val) => setTargetValue(val || "")}>
                        <SelectTrigger className="border-border rounded-xl text-foreground"><SelectValue placeholder="Choose role" /></SelectTrigger>
                        <SelectContent className="bg-background border-border text-foreground">
                          {Object.entries(ROLE_META).map(([key, meta]) => (
                            <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-6 pt-4 border-t border-border/30">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="pin" checked={isPinned} onCheckedChange={(c) => setIsPinned(!!c)} className="border-border/80 data-[state=checked]:bg-primary data-[state=checked]:border-blue-600" />
                    <Label htmlFor="pin" className="cursor-pointer text-xs font-semibold text-foreground/60 uppercase">Pin to top</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="email" checked={sendEmail} onCheckedChange={(c) => setSendEmail(!!c)} className="border-border/80 data-[state=checked]:bg-primary data-[state=checked]:border-blue-600" />
                    <Label htmlFor="email" className="cursor-pointer text-xs font-semibold text-foreground/60 uppercase">Send Email Notification</Label>
                  </div>
                </div>
              </div>
              
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsPostOpen(false)} className="rounded-xl border-border text-foreground bg-transparent hover:">Cancel</Button>
                <Button onClick={handlePost} disabled={isSubmitting || !title} className="bg-primary hover:bg-blue-700 text-foreground rounded-xl font-semibold">
                  {isSubmitting ? "Posting..." : "Publish Announcement"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-foreground/40">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border shadow-sm rounded-2xl shadow-xl flex flex-col items-center border-dashed border-border p-12">
             <Megaphone className="h-12 w-12 text-foreground/20 mb-4" />
             <h3 className="text-lg font-bold text-foreground">No Announcements</h3>
             <p className="text-sm text-foreground/40 mt-1">Check back later for updates from management.</p>
          </div>
        ) : (
          announcements.map((ann) => {
            const isRead = ann.readBy?.includes(user?.uid);
            
            return (
              <Card key={ann.id} className={`overflow-hidden border-border hover: transition-all duration-300 rounded-2xl shadow-sm hover:shadow-md ${ann.isPinned ? 'border-l-4 border-l-blue-500' : ''}`}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {ann.isPinned && <Pin className="h-4 w-4 text-primary fill-blue-400" />}
                      <CardTitle className="text-xl font-bold text-foreground">{ann.title}</CardTitle>
                      
                      {ann.audience !== "all" && (
                        <Badge variant="outline" className="ml-2 border-border text-foreground/60 font-medium text-xs rounded-lg">
                          {ann.audience === "department" ? "Dept: " : "Role: "} 
                          {ann.audience === "role" ? ROLE_META[ann.targetValue]?.label : ann.targetValue}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-foreground/40 flex items-center gap-2">
                      <span>Posted by <strong className="text-foreground/60">{ann.creatorName || "Management"}</strong></span>
                      <span>•</span>
                      <span>{ann.createdAt ? new Date(ann.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                    </div>
                  </div>
                  
                  {isRead ? (
                    <Badge variant="secondary" className="bg-emerald-500/10 border border-emerald-500/20 text-accent hover:bg-emerald-500/10 shadow-none rounded-lg font-semibold">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Read
                    </Badge>
                  ) : (
                    <Badge className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary/10 shadow-none group cursor-pointer transition-colors rounded-lg font-semibold"
                           onClick={() => markAsRead(ann.id)}>
                      <AlertCircle className="h-3 w-3 mr-1 fill-blue-500 text-[#121813]" /> 
                      <span className="group-hover:underline">Mark as Read</span>
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="prose prose-invert prose-sm max-w-none text-foreground/80" 
                       dangerouslySetInnerHTML={{ __html: ann.content }} />
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
