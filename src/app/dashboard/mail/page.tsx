"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { 
  Mail, Inbox, Send, Star, Trash2, PenSquare, Search, FileText,
  User, Calendar, Clock, AlertTriangle, CornerUpLeft, 
  CheckCircle, ArrowLeft, StarOff, ShieldAlert, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

type FolderType = "inbox" | "sent" | "starred" | "trash";
type PriorityType = "low" | "normal" | "urgent";

interface InternalMail {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  receiverId: string;
  receiverName: string;
  receiverEmail: string;
  subject: string;
  body: string;
  priority: PriorityType;
  readStatus: boolean;
  isStarredByReceiver: boolean;
  isStarredBySender: boolean;
  isDeletedBySender: boolean;
  isDeletedByReceiver: boolean;
  attachments?: { name: string; url: string }[];
  createdAt: any;
}

export default function SecureMail() {
  const { user } = useAuth();
  
  // Real-time feeds state
  const [incomingMails, setIncomingMails] = useState<InternalMail[]>([]);
  const [outgoingMails, setOutgoingMails] = useState<InternalMail[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const [activeFolder, setActiveFolder] = useState<FolderType>("inbox");
  const [selectedMail, setSelectedMail] = useState<InternalMail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Composer state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composePriority, setComposePriority] = useState<PriorityType>("normal");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart priority filtering
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Recipient Autocomplete search query
  const [recipientSearchText, setRecipientSearchText] = useState("");

  // Composition attachments array
  const [composeAttachments, setComposeAttachments] = useState<{ name: string; url: string }[]>([]);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  // 1. Fetch real-time mail data and employees list
  useEffect(() => {
    if (!user) return;

    // Listen to incoming mails
    const incomingQ = query(
      collection(db, "internal_mails"),
      where("receiverId", "==", user.uid)
    );
    const unsubscribeIncoming = onSnapshot(incomingQ, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InternalMail));
      setIncomingMails(list);
    }, (error) => {
      console.error("Firestore onSnapshot error (incoming mails):", error);
    });

    // Listen to outgoing mails
    const outgoingQ = query(
      collection(db, "internal_mails"),
      where("senderId", "==", user.uid)
    );
    const unsubscribeOutgoing = onSnapshot(outgoingQ, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InternalMail));
      setOutgoingMails(list);
    }, (error) => {
      console.error("Firestore onSnapshot error (outgoing mails):", error);
    });

    // Listen to employees
    const employeesQ = query(collection(db, "employees"));
    const unsubscribeEmployees = onSnapshot(employeesQ, (snapshot) => {
      setEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Firestore onSnapshot error (mail page employees):", error);
    });

    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
      unsubscribeEmployees();
    };
  }, [user]);

  if (!user) {
    return (
      <div className="p-8 text-center text-white/30 font-bold uppercase tracking-wider text-xs">
        Connecting securely...
      </div>
    );
  }

  // 2. Merge and sort incoming and outgoing mails
  const allMailsMap = new Map<string, InternalMail>();
  incomingMails.forEach(m => allMailsMap.set(m.id, m));
  outgoingMails.forEach(m => allMailsMap.set(m.id, m));

  const sortedAllMails = Array.from(allMailsMap.values()).sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  // 3. Filter by folder and search query
  const folderFilteredMails = sortedAllMails.filter((mail) => {
    const isSender = mail.senderId === user.uid;
    const isReceiver = mail.receiverId === user.uid;

    if (activeFolder === "inbox") {
      return isReceiver && !mail.isDeletedByReceiver;
    }
    if (activeFolder === "sent") {
      return isSender && !mail.isDeletedBySender;
    }
    if (activeFolder === "starred") {
      const isStarred = (isReceiver && mail.isStarredByReceiver && !mail.isDeletedByReceiver) ||
                        (isSender && mail.isStarredBySender && !mail.isDeletedBySender);
      return isStarred;
    }
    if (activeFolder === "trash") {
      return (isReceiver && mail.isDeletedByReceiver) || (isSender && mail.isDeletedBySender);
    }
    return false;
  });

  const priorityFilteredMails = folderFilteredMails.filter((mail) => {
    if (priorityFilter === "all") return true;
    return mail.priority === priorityFilter;
  });

  const searchFilteredMails = priorityFilteredMails.filter((mail) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      mail.subject?.toLowerCase().includes(term) ||
      mail.body?.toLowerCase().includes(term) ||
      mail.senderName?.toLowerCase().includes(term) ||
      mail.receiverName?.toLowerCase().includes(term)
    );
  });

  // Dynamic counts for each folder
  const inboxUnreadCount = incomingMails.filter(m => !m.readStatus && !m.isDeletedByReceiver).length;
  const sentCount = outgoingMails.filter(m => !m.isDeletedBySender).length;
  const starredCount = sortedAllMails.filter((mail) => {
    const isSender = mail.senderId === user.uid;
    const isReceiver = mail.receiverId === user.uid;
    return (isReceiver && mail.isStarredByReceiver && !mail.isDeletedByReceiver) ||
           (isSender && mail.isStarredBySender && !mail.isDeletedBySender);
  }).length;
  const trashCount = sortedAllMails.filter((mail) => {
    const isSender = mail.senderId === user.uid;
    const isReceiver = mail.receiverId === user.uid;
    return (isReceiver && mail.isDeletedByReceiver) || (isSender && mail.isDeletedBySender);
  }).length;

  // 4. Message Operations
  const handleSelectMail = async (mail: InternalMail) => {
    setSelectedMail(mail);
    
    // Mark as read if received and unread
    if (mail.receiverId === user.uid && !mail.readStatus) {
      try {
        await updateDoc(doc(db, "internal_mails", mail.id), {
          readStatus: true
        });
      } catch (err) {
        console.error("Failed to mark mail as read:", err);
      }
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, mail: InternalMail) => {
    e.stopPropagation();
    const isReceiver = mail.receiverId === user.uid;
    const isSender = mail.senderId === user.uid;
    
    try {
      await updateDoc(doc(db, "internal_mails", mail.id), {
        isStarredByReceiver: isReceiver ? !mail.isStarredByReceiver : mail.isStarredByReceiver,
        isStarredBySender: isSender ? !mail.isStarredBySender : mail.isStarredBySender
      });
      // Sync selected preview panel if active
      if (selectedMail?.id === mail.id) {
        setSelectedMail({
          ...mail,
          isStarredByReceiver: isReceiver ? !mail.isStarredByReceiver : mail.isStarredByReceiver,
          isStarredBySender: isSender ? !mail.isStarredBySender : mail.isStarredBySender
        });
      }
    } catch (err) {
      console.error("Star toggle failed:", err);
    }
  };

  const handleDeleteMail = async (mail: InternalMail) => {
    const isReceiver = mail.receiverId === user.uid;
    const isSender = mail.senderId === user.uid;
    const inTrashFolder = activeFolder === "trash";

    try {
      if (inTrashFolder) {
        // Log secure memo purge in founder telemetry
        await addDoc(collection(db, "auditLog"), {
          actorId: user.uid,
          action: "PURGE_SECURE_MAIL",
          details: `Permanently purged secure memo: "${mail.subject}"`,
          ipAddress: "Secure Network",
          createdAt: serverTimestamp ? serverTimestamp() : new Date()
        });

        // Already in Trash - purge or double-delete clean logic
        // If both parties marked it deleted, or if we want to erase completely:
        const otherPartyDeleted = isReceiver ? mail.isDeletedBySender : mail.isDeletedByReceiver;
        
        if (otherPartyDeleted || mail.senderId === mail.receiverId) {
          await deleteDoc(doc(db, "internal_mails", mail.id));
        } else {
          // Set permanent delete flag inside caller profile
          await updateDoc(doc(db, "internal_mails", mail.id), {
            isDeletedByReceiver: isReceiver ? true : mail.isDeletedByReceiver,
            isDeletedBySender: isSender ? true : mail.isDeletedBySender,
            // Custom suffix or tag to hide permanently
            receiverId: isReceiver ? "DELETED" : mail.receiverId,
            senderId: isSender ? "DELETED" : mail.senderId
          });
        }
        setSelectedMail(null);
      } else {
        // Move to Trash
        await updateDoc(doc(db, "internal_mails", mail.id), {
          isDeletedByReceiver: isReceiver ? true : mail.isDeletedByReceiver,
          isDeletedBySender: isSender ? true : mail.isDeletedBySender
        });
        setSelectedMail(null);
      }
    } catch (err) {
      console.error("Delete operation failed:", err);
    }
  };

  const handleRestoreMail = async (mail: InternalMail) => {
    const isReceiver = mail.receiverId === user.uid;
    const isSender = mail.senderId === user.uid;

    try {
      await updateDoc(doc(db, "internal_mails", mail.id), {
        isDeletedByReceiver: isReceiver ? false : mail.isDeletedByReceiver,
        isDeletedBySender: isSender ? false : mail.isDeletedBySender
      });
      setSelectedMail(null);
    } catch (err) {
      console.error("Restore failed:", err);
    }
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo || !composeSubject.trim() || !composeBody.trim()) {
      setError("Please fill in all composition fields.");
      return;
    }

    const selectedEmp = employees.find(emp => emp.id === composeTo);
    if (!selectedEmp) {
      setError("Selected recipient is invalid.");
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await addDoc(collection(db, "internal_mails"), {
        senderId: user.uid,
        senderName: user.fullName || user.displayName || "Unknown Admin",
        senderEmail: user.email || "",
        receiverId: selectedEmp.id,
        receiverName: selectedEmp.fullName,
        receiverEmail: selectedEmp.email,
        subject: composeSubject.trim(),
        body: composeBody.trim(),
        priority: composePriority,
        readStatus: false,
        isStarredByReceiver: false,
        isStarredBySender: false,
        isDeletedBySender: false,
        isDeletedByReceiver: false,
        attachments: composeAttachments, // Save secure file attachments/links
        createdAt: serverTimestamp ? serverTimestamp() : new Date()
      });

      // Log secure internal mail transmission
      await addDoc(collection(db, "auditLog"), {
        actorId: user.uid,
        action: "SEND_SECURE_MAIL",
        details: `Sent secure memo to ${selectedEmp.fullName}: "${composeSubject.trim()}"`,
        ipAddress: "Secure Network",
        createdAt: serverTimestamp ? serverTimestamp() : new Date()
      });

      // Clear states
      setIsComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposePriority("normal");
      setComposeAttachments([]);
    } catch (err: any) {
      setError(err.message || "Failed to deliver secure mail memo.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyMail = (mail: InternalMail) => {
    // Detect sender
    const replyTargetId = mail.senderId === user.uid ? mail.receiverId : mail.senderId;
    setComposeTo(replyTargetId);
    setComposeSubject(`Re: ${mail.subject}`);
    setComposeBody(`\n\n----- Original Message -----\nFrom: ${mail.senderName}\nSubject: ${mail.subject}\n\n${mail.body}`);
    setIsComposeOpen(true);
  };

  const getInitials = (name: string) => 
    name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "M";

  return (
    <div className="h-[calc(100vh-120px)] flex bg-[#121813]/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden text-white">
      
      {/* 1. Left Folders Navigation */}
      <div className="w-56 bg-white/[0.01] border-r border-white/[0.06] flex flex-col p-4 shrink-0">
        <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
          <DialogTrigger 
            render={
              <button className="w-full btn-primary h-10 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-glow-blue uppercase tracking-wider mb-6">
                <PenSquare className="h-4 w-4" /> Compose Mail
              </button>
            }
          />
          <DialogContent className="sm:max-w-[500px] bg-[#121813] border border-white/[0.08] text-white p-6 rounded-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4.5 w-4.5 text-blue-500" /> New Secure Memo
              </DialogTitle>
            </DialogHeader>
            {error && (
              <div className="p-2.5 text-[11px] text-red-300 bg-red-950/40 border border-red-500/20 rounded-xl text-center font-bold">
                {error}
              </div>
            )}
            <form onSubmit={handleSendMail} className="space-y-4 py-3">
              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Secure Recipient</label>
                
                {composeTo ? (
                  <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 font-bold flex items-center justify-center text-xs shrink-0">
                        {getInitials(employees.find(emp => emp.id === composeTo)?.fullName)}
                      </div>
                      <div className="text-xs min-w-0">
                        <p className="font-bold text-white truncate">{employees.find(emp => emp.id === composeTo)?.fullName}</p>
                        <p className="text-[10px] text-white/45 truncate">{employees.find(emp => emp.id === composeTo)?.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setComposeTo(""); setRecipientSearchText(""); }}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Type name or email to search recipient..."
                      value={recipientSearchText}
                      onChange={(e) => setRecipientSearchText(e.target.value)}
                      className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
                    />
                    {recipientSearchText.trim() && (
                      <div className="absolute top-11 left-0 right-0 max-h-40 overflow-y-auto bg-[#1c241e] border border-white/[0.08] rounded-xl z-50 divide-y divide-white/[0.03] shadow-2xl">
                        {employees.filter(emp => {
                          const text = recipientSearchText.toLowerCase().trim();
                          return emp.fullName?.toLowerCase().includes(text) || emp.email?.toLowerCase().includes(text);
                        }).length === 0 ? (
                          <div className="p-3 text-xs text-white/30 text-center">No recipients found</div>
                        ) : (
                          employees.filter(emp => {
                            const text = recipientSearchText.toLowerCase().trim();
                            return emp.fullName?.toLowerCase().includes(text) || emp.email?.toLowerCase().includes(text);
                          }).map(emp => (
                            <div
                              key={emp.id}
                              onClick={() => {
                                setComposeTo(emp.id);
                                setRecipientSearchText("");
                              }}
                              className="p-2.5 hover:bg-white/[0.03] cursor-pointer flex items-center gap-2"
                            >
                              <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                                {getInitials(emp.fullName)}
                              </div>
                              <div className="text-left min-w-0">
                                <p className="text-xs font-bold text-white truncate">{emp.fullName}</p>
                                <p className="text-[9px] text-white/40 truncate">{emp.email}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Subject</label>
                  <Input
                    required
                    placeholder="Subject line"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    className="glass-input h-10 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Priority</label>
                  <select
                    value={composePriority}
                    onChange={(e) => setComposePriority(e.target.value as PriorityType)}
                    className="w-full h-10 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#121813] text-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Memo details</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Type secure internal memo details..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full border border-white/10 rounded-xl p-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#121813] text-white placeholder:text-white/20"
                />
              </div>

              {/* Secure Document Attachment Linker */}
              <div className="space-y-2 border-t border-white/[0.05] pt-3">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Secure Document Attachments</label>
                
                {/* Render current attached list */}
                {composeAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {composeAttachments.map((att, index) => (
                      <span key={index} className="flex items-center gap-1 text-[9px] font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-lg text-blue-300">
                        <FileText className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[120px]">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => setComposeAttachments(prev => prev.filter((_, i) => i !== index))}
                          className="hover:text-red-400 font-extrabold cursor-pointer ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Doc Name (e.g. Q3 Sales)"
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                    className="glass-input h-8 text-[10px] border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 flex-1"
                  />
                  <Input
                    placeholder="URL or Vault Path"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    className="glass-input h-8 text-[10px] border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!attachmentName.trim() || !attachmentUrl.trim()) return;
                      setComposeAttachments(prev => [...prev, { name: attachmentName.trim(), url: attachmentUrl.trim() }]);
                      setAttachmentName("");
                      setAttachmentUrl("");
                    }}
                    className="bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg px-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              <DialogFooter className="pt-4 border-t border-white/[0.06] gap-2 sm:gap-0 mt-2">
                <button type="button" onClick={() => setIsComposeOpen(false)} className="btn-ghost h-9 py-0 px-4 text-xs font-semibold border-white/10 text-white/70 hover:text-white cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSending} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer shadow-glow-blue">
                  {isSending ? "Sending Securely..." : "Send Memo"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="space-y-1 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-2 px-3">secure Folders</div>
          {[
            { id: "inbox", label: "Inbox", icon: Inbox, count: inboxUnreadCount },
            { id: "sent", label: "Sent", icon: Send, count: sentCount },
            { id: "starred", label: "Starred", icon: Star, count: starredCount },
            { id: "trash", label: "Trash", icon: Trash2, count: trashCount }
          ].map((folder) => (
            <button
              key={folder.id}
              onClick={() => {
                setActiveFolder(folder.id as FolderType);
                setSelectedMail(null);
              }}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border border-transparent",
                activeFolder === folder.id 
                  ? "bg-blue-600/15 text-blue-400 border-blue-500/15" 
                  : "text-white/40 hover:bg-white/[0.03] hover:text-white/70"
              )}
            >
              <div className="flex items-center gap-2">
                <folder.icon className="h-4 w-4 shrink-0" />
                <span>{folder.label}</span>
              </div>
              {folder.count > 0 && (
                <span className="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full shadow-glow-blue">
                  {folder.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Middle Mail List Pane */}
      <div className="w-80 border-r border-white/[0.06] flex flex-col bg-white/[0.005] shrink-0">
        
        {/* Search & Priority Pills */}
        <div className="p-4 border-b border-white/[0.06] relative shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/20" />
            <Input
              placeholder="Search memo subjects..."
              className="pl-9 glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
            {[
              { id: "all", label: "All" },
              { id: "urgent", label: "Urgent" },
              { id: "normal", label: "Normal" },
              { id: "low", label: "Low" }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPriorityFilter(p.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border cursor-pointer shrink-0",
                  priorityFilter === p.id 
                    ? p.id === "urgent" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" :
                      p.id === "low" ? "bg-slate-500/20 text-slate-300 border-white/10" :
                      "bg-blue-500/20 text-blue-300 border-blue-500/30"
                    : "bg-white/[0.02] text-white/40 border-white/[0.05] hover:text-white/60"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mails Scroll */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03] scrollbar-hide">
          {searchFilteredMails.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/20 p-6 text-center">
              <Mail className="h-9 w-9 opacity-15 mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-wider">No mails found in {activeFolder}</p>
            </div>
          ) : (
            searchFilteredMails.map((mail) => {
              const isSelected = selectedMail?.id === mail.id;
              const isInbox = activeFolder === "inbox";
              const isStarred = (mail.receiverId === user.uid && mail.isStarredByReceiver) ||
                                (mail.senderId === user.uid && mail.isStarredBySender);
              
              return (
                <div
                  key={mail.id}
                  onClick={() => handleSelectMail(mail)}
                  className={cn(
                    "p-4 cursor-pointer hover:bg-white/[0.02] transition-colors relative flex gap-3",
                    isSelected ? "bg-white/[0.03]" : "",
                    isInbox && !mail.readStatus ? "border-l-2 border-blue-500" : ""
                  )}
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold flex items-center justify-center shrink-0 text-xs">
                    {getInitials(mail.senderName)}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs truncate block",
                        isInbox && !mail.readStatus ? "font-bold text-white" : "font-semibold text-white/70"
                      )}>
                        {mail.senderId === user.uid ? `To: ${mail.receiverName}` : mail.senderName}
                      </span>
                      <span className="text-[9px] text-white/25 shrink-0 font-mono">
                        {mail.createdAt?.seconds 
                          ? new Date(mail.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : "Draft"}
                      </span>
                    </div>

                    <p className={cn(
                      "text-[11px] truncate block",
                      isInbox && !mail.readStatus ? "font-bold text-white/95" : "text-white/60"
                    )}>
                      {mail.subject}
                    </p>
                    
                    <p className="text-[10px] text-white/30 truncate leading-relaxed">
                      {mail.body}
                    </p>

                    <div className="flex items-center gap-2 pt-1.5">
                      {mail.priority === "urgent" && (
                        <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/25 text-[8px] py-0 px-1 font-bold uppercase tracking-wider">Urgent</Badge>
                      )}
                      {mail.priority === "low" && (
                        <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-white/5 text-[8px] py-0 px-1 font-bold uppercase tracking-wider">Low</Badge>
                      )}
                      <button
                        onClick={(e) => handleToggleStar(e, mail)}
                        className={cn(
                          "ml-auto cursor-pointer p-0.5 hover:bg-white/5 rounded-md",
                          isStarred ? "text-amber-400" : "text-white/25 hover:text-white/45"
                        )}
                      >
                        <Star className={cn("w-3.5 h-3.5", isStarred ? "fill-amber-400" : "")} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Right Mail Reader Pane */}
      <div className="flex-1 flex flex-col bg-white/[0.002]">
        {selectedMail ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Header controls */}
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => handleReplyMail(selectedMail)}
                  className="btn-ghost h-8 py-0 px-3.5 text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer border-white/10 hover:text-white"
                >
                  <CornerUpLeft className="h-3.5 w-3.5 text-blue-400" /> Reply
                </button>
                
                <button
                  onClick={(e) => handleToggleStar(e, selectedMail)}
                  className="btn-ghost h-8 py-0 px-3 text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer border-white/10 hover:text-white"
                >
                  <Star className="h-3.5 w-3.5 text-amber-400" /> Star
                </button>

                {activeFolder === "trash" ? (
                  <button
                    onClick={() => handleRestoreMail(selectedMail)}
                    className="btn-ghost h-8 py-0 px-3 text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer border-white/10 text-emerald-400 hover:text-emerald-300"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Restore
                  </button>
                ) : null}
              </div>

              <button
                onClick={() => handleDeleteMail(selectedMail)}
                className="btn-ghost h-8 py-0 px-3 text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer border-white/10 text-rose-400 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> {activeFolder === "trash" ? "Purge Permanently" : "Delete"}
              </button>
            </div>

            {/* Content Scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-extrabold flex items-center justify-center shrink-0">
                  {getInitials(selectedMail.senderName)}
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">{selectedMail.senderName}</h2>
                    <span className="text-[10px] text-white/30 font-mono">
                      {selectedMail.createdAt?.seconds 
                        ? new Date(selectedMail.createdAt.seconds * 1000).toLocaleString()
                        : "Sending..."}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/40 font-semibold font-mono">
                    Sender: {selectedMail.senderEmail}
                  </p>
                  <p className="text-[10px] text-white/40 font-semibold font-mono">
                    Recipient: {selectedMail.receiverEmail}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h1 className="text-sm font-bold text-white leading-snug">
                  {selectedMail.subject}
                </h1>
                
                <div className="flex items-center gap-2 pt-2.5">
                  <Badge variant="outline" className={cn(
                    "font-bold text-[8px] uppercase tracking-wider py-0.5 shadow-none",
                    selectedMail.priority === "urgent" ? "bg-rose-500/15 text-rose-300 border-rose-500/20 shadow-glow-rose" :
                    selectedMail.priority === "low" ? "bg-slate-500/10 text-slate-400 border-white/5" :
                    "bg-blue-500/10 text-blue-300 border-blue-500/20"
                  )}>
                    Priority: {selectedMail.priority}
                  </Badge>
                </div>
              </div>

              {/* Body */}
              <div className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap font-medium p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
                {selectedMail.body}
              </div>

              {/* Secure Attachments Row */}
              {selectedMail.attachments && selectedMail.attachments.length > 0 && (
                <div className="space-y-2 border-t border-white/[0.05] pt-4">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Secure Attachments</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedMail.attachments.map((att: any, index: number) => (
                      <a
                        key={index}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/[0.05] hover:border-blue-500/30 transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                          <div className="text-left min-w-0">
                            <p className="text-xs font-bold text-white truncate group-hover:text-blue-300 transition-colors">{att.name}</p>
                            <p className="text-[9px] text-white/30 truncate">{att.url}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider shrink-0">Open</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-8 text-center">
            <Inbox className="h-12 w-12 opacity-15 mb-3" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">No mail selected</h3>
            <p className="text-[10px] text-white/30 max-w-xs mt-1">Select an email memo from the column list to inspect its secure internal contents.</p>
          </div>
        )}
      </div>

    </div>
  );
}
