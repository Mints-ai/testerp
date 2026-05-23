"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Monitor, Laptop, Key, Search, Plus, AlertCircle, Laptop2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type AssetType = "laptop" | "monitor" | "software" | "other";

export default function AssetManagement() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Form State
  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("laptop");
  const [serialNumber, setSerialNumber] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "assets"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Firestore onSnapshot error (assets):", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !serialNumber) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "assets"), {
        name,
        type,
        serialNumber,
        assignedTo: assignedTo || null,
        status: "active",
        createdAt: serverTimestamp()
      });
      setIsAddOpen(false);
      setName("");
      setSerialNumber("");
      setAssignedTo("");
    } catch (err) {
      console.error("Error adding asset:", err);
    }
    setIsSubmitting(false);
  };

  const filteredAssets = assets.filter(a => 
    a.name?.toLowerCase().includes(search.toLowerCase()) || 
    a.assignedTo?.toLowerCase().includes(search.toLowerCase()) ||
    a.serialNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <RoleGuard permission="MANAGE_USERS" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied.</div>}>
      <div className="space-y-6 pb-12 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Laptop2 className="h-5 w-5 text-blue-500" /> Asset Management
            </h1>
            <p className="text-xs text-white/40 mt-1">Track company devices, software licenses, and physical corporate assets.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
              <Input
                placeholder="Search inventory..."
                className="pl-9 glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger 
                render={
                  <button className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                    <Plus className="mr-1.5 h-4 w-4" /> Add Asset
                  </button>
                }
              />
              <DialogContent className="sm:max-w-[425px] bg-[#0d1f3c] border border-white/[0.08] text-white p-6 rounded-2xl shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-white">Register Corporate Asset</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddAsset} className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Asset Name / Model</label>
                    <Input 
                      required 
                      placeholder="e.g. MacBook Pro M3 Max" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Asset Type</label>
                      <select 
                        value={type} 
                        onChange={(e) => setType(e.target.value as AssetType)}
                        className="w-full h-9 border border-white/10 rounded-xl px-3 text-xs focus:border-blue-500/60 focus:ring-0 bg-[#0d1f3c] text-white"
                      >
                        <option value="laptop">Laptop / PC</option>
                        <option value="monitor">Monitor / Display</option>
                        <option value="software">Software License</option>
                        <option value="other">Other Peripheral</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Serial / License Key</label>
                      <Input 
                        required 
                        placeholder="SN-9823485" 
                        value={serialNumber} 
                        onChange={e => setSerialNumber(e.target.value)} 
                        className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Assigned To (Employee Name)</label>
                    <Input 
                      placeholder="Leave blank if unassigned" 
                      value={assignedTo} 
                      onChange={e => setAssignedTo(e.target.value)} 
                      className="glass-input h-9 text-xs border-white/10 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0 w-full"
                    />
                  </div>
                  <DialogFooter className="pt-4 border-t border-white/[0.06] gap-2 sm:gap-0 mt-4">
                    <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost h-9 py-0 px-4 text-xs font-semibold border-white/10 text-white/70 hover:text-white cursor-pointer">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                      {isSubmitting ? "Saving..." : "Save Asset"}
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="glass-card overflow-hidden border-white/[0.08] bg-white/[0.02]">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-16 text-center text-white/30 bg-white/[0.01]">
                <p className="text-xs font-bold uppercase tracking-wider animate-pulse">Loading inventory assets...</p>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-16 text-white/30 bg-white/[0.01]">
                <Laptop className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-wider text-white/40">No matching assets found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Device / Resource</th>
                      <th>Identification</th>
                      <th>Assigned To</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-white/[0.02] transition-colors">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-500/10 p-2.5 rounded-xl text-blue-400 border border-blue-500/20 shrink-0">
                              {asset.type === 'laptop' && <Laptop className="w-4 h-4" />}
                              {asset.type === 'monitor' && <Monitor className="w-4 h-4" />}
                              {asset.type === 'software' && <Key className="w-4 h-4" />}
                              {asset.type === 'other' && <AlertCircle className="w-4 h-4" />}
                              {!['laptop', 'monitor', 'software', 'other'].includes(asset.type) && <HelpCircle className="w-4 h-4" />}
                            </div>
                            <span className="font-bold text-white text-xs">{asset.name}</span>
                          </div>
                        </td>
                        <td className="text-white/50 font-mono text-[11px] font-semibold">{asset.serialNumber}</td>
                        <td className="text-white/60 font-semibold">{asset.assignedTo || <span className="text-white/30 italic">Unassigned</span>}</td>
                        <td>
                          <Badge variant="outline" className={cn(
                            "font-bold text-[9px] py-0.5 tracking-wider uppercase shadow-none",
                            asset.status === 'active' ? "bg-emerald-600/15 text-emerald-300 border-emerald-500/20" : "bg-amber-600/15 text-amber-300 border-amber-500/20"
                          )}>
                            {asset.status || 'ACTIVE'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
