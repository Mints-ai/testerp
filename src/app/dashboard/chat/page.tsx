"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Hash, Send, Image as ImageIcon, Smile, MoreVertical, MessageSquare, 
  Video, VideoOff, Mic, MicOff, Monitor, PhoneOff, Plus, Users, User, Building2, Search 
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Chat() {
  const { user, role } = useAuth();
  
  // Channels and Messages State
  const [channels, setChannels] = useState<any[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>("");
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Employees & Profile State
  const [employees, setEmployees] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  // Search and Modal States
  const [isDMModalOpen, setIsDMModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  // Video call states
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 1. Fetch current employee profile
  useEffect(() => {
    if (!user) return;
    const unsubProfile = onSnapshot(doc(db, "employees", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentUserProfile(docSnap.data());
      }
    });
    return () => unsubProfile();
  }, [user]);

  // 2. Fetch all other employees
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "employees"));
    const unsub = onSnapshot(q, (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.id !== user.uid));
    });
    return () => unsub();
  }, [user]);

  // 3. Fetch channels & seed default channels if missing
  // 3. Fetch channels, perform self-healing duplicate cleanup, and seed required channels
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "chatChannels"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setChannels(fetched);
      setLoadingChannels(false);

      // Self-healing database cleanup: Delete existing duplicate department channel documents from Firestore
      const seenDeptKeys = new Set<string>();
      for (const channel of fetched) {
        if (channel.type === "department") {
          const deptKey = channel.department;
          if (seenDeptKeys.has(deptKey)) {
            try {
              await deleteDoc(doc(db, "chatChannels", channel.id));
            } catch (e) {
              console.error(`Error cleaning up duplicate channel document (${channel.id}):`, e);
            }
          } else {
            seenDeptKeys.add(deptKey);
          }
        }
      }

      // Background seeding for required company channels
      const requiredChannels = [
        { name: "General", type: "global" },
        { name: "Operations Team", type: "department", department: "Operations" },
        { name: "Performance Marketing Team", type: "department", department: "Performance Marketing" },
        { name: "Software Development Team", type: "department", department: "Software Development" }
      ];

      for (const req of requiredChannels) {
        const exists = fetched.some(c => 
          c.type === req.type && 
          (req.type === "global" ? c.name === req.name : c.department === req.department)
        );
        if (!exists) {
          try {
            await addDoc(collection(db, "chatChannels"), {
              ...req,
              members: [],
              createdAt: serverTimestamp()
            });
          } catch (e) {
            console.error(`Error seeding ${req.name}:`, e);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [user]);

  // 5. Default to 'General' channel on load
  useEffect(() => {
    if (channels.length > 0 && !activeChannel) {
      const general = channels.find(c => c.type === 'global' && c.name.toLowerCase() === 'general');
      if (general) {
        setActiveChannel(general.id);
      } else {
        setActiveChannel(channels[0].id);
      }
    }
  }, [channels, activeChannel]);

  // 6. Fetch messages in active channel
  useEffect(() => {
    if (!user || !activeChannel) return;
    
    const q = query(
      collection(db, "messages"),
      where("channelId", "==", activeChannel),
      orderBy("createdAt", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }, (error) => {
      console.error("Firestore onSnapshot error (messages):", error);
    });

    return () => unsubscribe();
  }, [activeChannel, user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !activeChannel) return;

    const messageText = newMessage;
    setNewMessage(""); 

    try {
      await addDoc(collection(db, "messages"), {
        text: messageText,
        channelId: activeChannel,
        userId: user.uid,
        userName: user.fullName || user.displayName || "Unknown User",
        userAvatar: user.photoURL || "",
        createdAt: serverTimestamp()
      });
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(messageText); 
    }
  };

  const handleStartDM = async (peer: any) => {
    const existing = channels.find(c => 
      c.type === 'dm' && 
      c.members?.includes(user?.uid) && 
      c.members?.includes(peer.id)
    );

    if (existing) {
      setActiveChannel(existing.id);
      setIsDMModalOpen(false);
      return;
    }

    try {
      const docRef = await addDoc(collection(db, "chatChannels"), {
        type: "dm",
        members: [user?.uid, peer.id],
        createdAt: serverTimestamp()
      });

      // Write system audit log
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid,
        action: "START_DM",
        targetCollection: "chatChannels",
        targetId: docRef.id,
        details: `Started a private Direct Message with ${peer.fullName || peer.name || 'colleague'}.`,
        createdAt: serverTimestamp()
      });

      setActiveChannel(docRef.id);
      setIsDMModalOpen(false);
    } catch (e) {
      console.error("Error starting DM:", e);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedMembers.length === 0) return;

    try {
      const docRef = await addDoc(collection(db, "chatChannels"), {
        name: groupName.trim(),
        type: "custom_group",
        members: [user?.uid, ...selectedMembers],
        createdAt: serverTimestamp()
      });

      // Write system audit log
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid,
        action: "CREATE_GROUP",
        targetCollection: "chatChannels",
        targetId: docRef.id,
        details: `Created custom group chat "${groupName.trim()}" with ${selectedMembers.length} members.`,
        createdAt: serverTimestamp()
      });

      setActiveChannel(docRef.id);
      setGroupName("");
      setSelectedMembers([]);
      setIsGroupModalOpen(false);
    } catch (e) {
      console.error("Error creating group:", e);
    }
  };

  const toggleMemberSelection = (uid: string) => {
    setSelectedMembers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const resolveChannelInfo = (channel: any) => {
    if (!channel) return { name: "General Channel", initials: "#", type: "global" };
    if (channel.type === 'dm') {
      const peerId = channel.members?.find((m: string) => m !== user?.uid);
      const peer = employees.find(e => e.id === peerId);
      const displayName = peer?.fullName || peer?.name || "Direct Message";
      return {
        name: displayName,
        initials: displayName.split(" ").map((n: any) => n[0]).join("").substring(0, 2).toUpperCase(),
        type: "dm",
        photoURL: peer?.profilePhotoURL
      };
    }
    return {
      name: channel.name,
      initials: channel.name.split(" ").map((n: any) => n[0]).join("").substring(0, 2).toUpperCase(),
      type: channel.type,
      photoURL: null
    };
  };

  // Video call controls
  const startCall = async () => {
    setInCall(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 200);
    } catch (err) {
      console.error("Camera access blocked or not available:", err);
    }
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setInCall(false);
    setIsScreenSharing(false);
    setIsVideoOff(false);
    setIsMuted(false);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    } else {
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    } else {
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);
      } catch (err) {
        console.error("Screen share cancelled:", err);
      }
    } else {
      if (videoRef.current && localStream) {
        videoRef.current.srcObject = localStream;
      }
      setIsScreenSharing(false);
    }
  };

  // Filters for user sidebar list
  const filteredEmployees = employees.filter(e => 
    (e.fullName || e.name || "").toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const handleToggleChannelMember = async (empId: string, isCurrentlyMember: boolean) => {
    if (!activeChannel) return;
    try {
      const channelRef = doc(db, "chatChannels", activeChannel);
      const currentMembers = activeChannelObj?.members || [];
      const updatedMembers = isCurrentlyMember
        ? currentMembers.filter((m: string) => m !== empId)
        : [...currentMembers, empId];

      await updateDoc(channelRef, { members: updatedMembers });

      // Write system audit log
      await addDoc(collection(db, "auditLog"), {
        actorId: user?.uid,
        action: isCurrentlyMember ? "REMOVE_CHANNEL_MEMBER" : "ADD_CHANNEL_MEMBER",
        targetCollection: "chatChannels",
        targetId: activeChannel,
        details: `${isCurrentlyMember ? 'Removed' : 'Added'} user ID ${empId} ${isCurrentlyMember ? 'from' : 'to'} chat channel "${activeChannelObj?.name}".`,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error toggling channel member:", e);
    }
  };

  const activeChannelObj = channels.find(c => c.id === activeChannel);
  const activeInfo = resolveChannelInfo(activeChannelObj);

  return (
    <div className="h-[calc(100vh-120px)] flex bg-white/50 backdrop-blur-xl border border-slate-200 rounded-xl overflow-hidden shadow-card text-slate-800">
      
      {/* Sidebar Channels */}
      <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-extrabold text-slate-900 tracking-tight">Team Hub Chat</h2>
        </div>
        
        <div className="p-3 space-y-6 flex-1 overflow-y-auto hide-scrollbar">
          
          {/* Section 1: Global / Announcement Channels */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Company Channels</div>
            <div className="space-y-0.5">
              {channels.filter(c => c.type === 'global').map(channel => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left",
                    activeChannel === channel.id 
                      ? 'bg-indigo-100 text-indigo-700 font-bold' 
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Department channels */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Departments</div>
            <div className="space-y-0.5">
              {(() => {
                const seenDepts = new Set<string>();
                return channels
                  .filter(c => c.type === 'department')
                  .filter(c => {
                    const isAdmin = canAccess(role, "MANAGE_USERS");
                    const isMyDept = currentUserProfile?.departments?.includes(c.department);
                    const isExplicitMember = c.members?.includes(user?.uid);
                    return isAdmin || isMyDept || isExplicitMember;
                  })
                  .filter(c => {
                    if (seenDepts.has(c.department)) return false;
                    seenDepts.add(c.department);
                    return true;
                  })
                  .map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => setActiveChannel(channel.id)}
                      className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left",
                        activeChannel === channel.id 
                          ? 'bg-indigo-100 text-indigo-700 font-bold' 
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{channel.name}</span>
                    </button>
                  ));
              })()}
            </div>
          </div>

          {/* Section 3: Custom Group Chats */}
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Custom Groups</span>
              <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
                <DialogTrigger render={<Button variant="ghost" size="icon" className="h-5 w-5 rounded-full p-0 text-slate-400 hover:text-slate-900" />}>
                  <Plus className="h-3.5 w-3.5" />
                </DialogTrigger>
                <DialogContent className="bg-[#0f172a] border-white/10 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Group Chat</DialogTitle>
                    <DialogDescription className="text-white/40">Gather your team members into a private custom group chat.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateGroup} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-white/60">Group Name</label>
                      <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Project Apollo Sprint" className="bg-white/5 border-white/10 text-white" required />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-white/60">Add Members</label>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 border border-white/10 rounded-lg p-2 bg-white/5">
                        {employees.map(emp => {
                          const name = emp.fullName || emp.name || "Team Member";
                          return (
                            <label key={emp.id} className="flex items-center gap-2.5 p-1.5 hover:bg-white/5 rounded cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={selectedMembers.includes(emp.id)} 
                                onChange={() => toggleMemberSelection(emp.id)}
                                className="accent-indigo-500 rounded"
                              />
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={emp.profilePhotoURL} />
                                <AvatarFallback className="bg-white/10 text-[9px] font-bold text-white">{name[0]}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-white/90">{name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    
                    <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white" disabled={!groupName.trim() || selectedMembers.length === 0}>Create Group</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-0.5">
              {channels.filter(c => c.type === 'custom_group' && c.members?.includes(user?.uid)).map(channel => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left",
                    activeChannel === channel.id 
                      ? 'bg-indigo-100 text-indigo-700 font-bold' 
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Users className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Direct Messages */}
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Direct Messages</span>
              <Dialog open={isDMModalOpen} onOpenChange={setIsDMModalOpen}>
                <DialogTrigger render={<Button variant="ghost" size="icon" className="h-5 w-5 rounded-full p-0 text-slate-400 hover:text-slate-900" />}>
                  <Plus className="h-3.5 w-3.5" />
                </DialogTrigger>
                <DialogContent className="bg-[#0f172a] border-white/10 text-white max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Direct Message</DialogTitle>
                    <DialogDescription className="text-white/40">Select a team member to start a private chat.</DialogDescription>
                  </DialogHeader>
                  <div className="relative my-2">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                    <Input 
                      placeholder="Search colleagues..." 
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10 text-white" 
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {filteredEmployees.map(emp => {
                      const name = emp.fullName || emp.name || "Team Member";
                      return (
                        <button 
                          key={emp.id} 
                          onClick={() => handleStartDM(emp)}
                          className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg text-left"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={emp.profilePhotoURL} />
                            <AvatarFallback className="bg-indigo-600 text-xs font-bold text-white">
                              {name.split(" ").map((n: any) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold text-white">{name}</p>
                            <p className="text-[10px] text-white/40">{emp.jobTitle || "Employee"}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-0.5">
              {channels.filter(c => c.type === 'dm' && c.members?.includes(user?.uid)).map(channel => {
                const info = resolveChannelInfo(channel);
                return (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel.id)}
                    className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left",
                      activeChannel === channel.id 
                        ? 'bg-indigo-100 text-indigo-700 font-bold' 
                        : 'text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarImage src={info.photoURL} />
                      <AvatarFallback className="bg-indigo-50 text-[9px] font-bold text-indigo-600">{info.initials}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{info.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        
        {/* Chat Header */}
        <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {activeInfo.type === 'dm' ? (
              <Avatar className="h-6 w-6">
                <AvatarImage src={activeInfo.photoURL} />
                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-bold">{activeInfo.initials}</AvatarFallback>
              </Avatar>
            ) : activeInfo.type === 'custom_group' ? (
              <Users className="h-5 w-5 text-slate-400 shrink-0" />
            ) : activeInfo.type === 'department' ? (
              <Building2 className="h-5 w-5 text-slate-400 shrink-0" />
            ) : (
              <Hash className="h-5 w-5 text-slate-400 shrink-0" />
            )}
            <h2 className="font-extrabold text-slate-900 text-md truncate">{activeInfo.name}</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Admin Privilege to Add/Manage Members in department/custom_group chat */}
            {canAccess(role, "MANAGE_USERS") && (activeChannelObj?.type === 'department' || activeChannelObj?.type === 'custom_group') && (
              <Dialog open={isManageMembersOpen} onOpenChange={setIsManageMembersOpen}>
                <DialogTrigger render={
                  <Button 
                    variant="outline" 
                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold flex items-center gap-1.5 shadow-sm rounded-lg text-xs h-8 cursor-pointer"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Manage Members
                  </Button>
                } />
                <DialogContent className="bg-[#0f172a] border-white/10 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle>Manage Channel Members</DialogTitle>
                    <DialogDescription className="text-white/40">
                      Add or remove colleagues from <strong>{activeInfo.name}</strong>.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="relative my-2">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                    <Input 
                      placeholder="Search colleagues..." 
                      value={memberSearchQuery}
                      onChange={e => setMemberSearchQuery(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10 text-white text-xs" 
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 mt-2">
                    {employees
                      .filter(emp => (emp.fullName || emp.name || "").toLowerCase().includes(memberSearchQuery.toLowerCase()))
                      .map(emp => {
                        const name = emp.fullName || emp.name || "Team Member";
                        const isDeptMember = activeChannelObj?.type === 'department' && emp.departments?.includes(activeChannelObj.department);
                        const isExplicitMember = activeChannelObj?.members?.includes(emp.id);

                        return (
                          <div 
                            key={emp.id} 
                            className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg text-left"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={emp.profilePhotoURL} />
                                <AvatarFallback className="bg-indigo-600 text-xs font-bold text-white">
                                  {name.split(" ").map((n: any) => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-bold text-white leading-none">{name}</p>
                                <p className="text-[10px] text-white/40 mt-1">
                                  {emp.jobTitle || "Employee"} • {emp.departments?.join(", ") || "No Department"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isDeptMember ? (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                  Dept Member
                                </span>
                              ) : (
                                <Button
                                  onClick={() => handleToggleChannelMember(emp.id, !!isExplicitMember)}
                                  size="xs"
                                  variant={isExplicitMember ? "destructive" : "default"}
                                  className={isExplicitMember ? "bg-rose-600 hover:bg-rose-500 text-white h-7 px-3 text-xs cursor-pointer" : "bg-indigo-600 hover:bg-indigo-500 text-white h-7 px-3 text-xs cursor-pointer border-none shadow-sm"}
                                >
                                  {isExplicitMember ? "Remove" : "Add to Chat"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {!inCall && (
              <Button 
                onClick={startCall} 
                variant="outline" 
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold flex items-center gap-1.5 shadow-sm rounded-lg text-xs h-8"
              >
                <Video className="h-3.5 w-3.5" />
                Video Call
              </Button>
            )}
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900 hover:bg-slate-100">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Live Call Window */}
        {inCall && (
          <div className="bg-slate-950 p-6 border-b border-slate-800 animate-in slide-in-from-top duration-300 relative shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
              
              {/* Local Stream (Me) */}
              <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800 group shadow-md">
                {isVideoOff ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white/40">
                    <Avatar className="h-16 w-16 mb-2 border border-white/10">
                      <AvatarFallback className="bg-indigo-600 text-white text-lg font-bold">
                        {user?.fullName ? user.fullName[0] : (user?.displayName ? user.displayName[0] : "Me")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold uppercase tracking-wider font-mono">Camera Off</span>
                  </div>
                ) : (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                )}
                
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {user?.displayName || "Me"} (You)
                </div>
              </div>

              {/* Remote Stream (Simulated connection) */}
              <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800 group shadow-md flex items-center justify-center">
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-indigo-950/20 text-white/50">
                  <div className="flex items-center gap-1 mb-4 h-8">
                    <span className="w-1 bg-indigo-500 rounded-full h-6 animate-pulse" />
                    <span className="w-1 bg-indigo-400 rounded-full h-8 animate-pulse delay-75" />
                    <span className="w-1 bg-indigo-500 rounded-full h-4 animate-pulse delay-150" />
                    <span className="w-1 bg-indigo-300 rounded-full h-7 animate-pulse delay-200" />
                    <span className="w-1 bg-indigo-500 rounded-full h-5 animate-pulse delay-300" />
                  </div>
                  <Avatar className="h-16 w-16 mb-2 border border-white/10 shadow-lg">
                    <AvatarFallback className="bg-purple-600 text-white text-lg font-bold">
                      SA
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-300">System Administrator</span>
                </div>
                
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Remote Host
                </div>
              </div>

            </div>

            {/* Call Control Panel */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button 
                onClick={toggleMute} 
                variant="outline" 
                className={cn("h-11 w-11 rounded-full p-0 border border-slate-850", 
                  isMuted 
                    ? "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300" 
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              
              <Button 
                onClick={toggleVideo} 
                variant="outline" 
                className={cn("h-11 w-11 rounded-full p-0 border border-slate-850", 
                  isVideoOff 
                    ? "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300" 
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </Button>

              <Button 
                onClick={toggleScreenShare} 
                variant="outline" 
                className={cn("h-11 w-11 rounded-full p-0 border border-slate-850", 
                  isScreenSharing 
                    ? "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500" 
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Monitor className="h-5 w-5" />
              </Button>

              <Button 
                onClick={endCall} 
                className="bg-red-600 hover:bg-red-700 text-white h-11 px-5 rounded-full font-bold flex items-center gap-1.5 shadow-md shadow-red-900/35 transition-transform active:scale-95 border-none"
              >
                <PhoneOff className="h-5 w-5" />
                Leave Room
              </Button>
            </div>
          </div>
        )}

        {/* Messages List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="font-bold text-sm">No messages in {activeInfo.name} yet.</p>
              <p className="text-xs">Be the first to say hello!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.userId === user?.uid;
              const showAvatar = idx === 0 || messages[idx - 1].userId !== msg.userId;
              
              return (
                <div key={msg.id} className={cn("flex gap-3", isMe ? 'flex-row-reverse' : 'flex-row', !showAvatar ? 'mt-1' : 'mt-4')}>
                  {showAvatar ? (
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={msg.userAvatar} />
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold text-xs">
                        {msg.userName ? msg.userName.split(" ").map((n: any) => n[0]).join("") : "U"}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-9 shrink-0" />
                  )}
                  
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    {showAvatar && (
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-900">{msg.userName}</span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {msg.createdAt?.seconds ? format(new Date(msg.createdAt.seconds * 1000), 'h:mm a') : 'Just now'}
                        </span>
                      </div>
                    )}
                    <div className={cn("px-4 py-2 rounded-2xl text-xs shadow-sm font-medium leading-relaxed whitespace-pre-wrap",
                      isMe 
                        ? 'bg-indigo-600 text-white rounded-tr-sm' 
                        : 'bg-slate-100 text-slate-900 rounded-tl-sm'
                    )}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message Input */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 shrink-0">
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message ${activeInfo.name}...`}
              className="flex-1 bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-full px-4 text-slate-950 font-medium text-xs h-9"
            />
            <Button type="button" variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 shrink-0">
              <Smile className="h-5 w-5" />
            </Button>
            <Button type="submit" disabled={!newMessage.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full h-9 w-9 p-0 shrink-0 shadow-md transition-transform active:scale-95 border-none flex items-center justify-center">
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
