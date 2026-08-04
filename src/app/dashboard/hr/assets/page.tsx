"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Monitor, Laptop, Key, Search, Plus, AlertCircle, Laptop2, HelpCircle, Wrench, Activity } from "lucide-react";
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

  // Asset Maintenance History Ledger States
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Form State for Log Repair
  const [mIssue, setMIssue] = useState("");
  const [mCost, setMCost] = useState("");
  const [mStatus, setMStatus] = useState<"under_repair" | "resolved" | "scrapped">("under_repair");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  useEffect(() => {
    if (!selectedAsset) {
      setMaintenanceLogs([]);
      return;
    }
    setLoadingLogs(true);
    const q = query(
      collection(db, "assetMaintenanceLogs"),
      where("assetId", "==", selectedAsset.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logs.sort((a: any, b: any) => (b.loggedAt?.seconds || 0) - (a.loggedAt?.seconds || 0));
      setMaintenanceLogs(logs);
      setLoadingLogs(false);
    }, (error) => {
      console.error("Error loading maintenance logs:", error);
      setLoadingLogs(false);
    });
    return () => unsubscribe();
  }, [selectedAsset]);

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !mIssue || !mCost) return;

    setIsSubmittingLog(true);
    try {
      await addDoc(collection(db, "assetMaintenanceLogs"), {
        assetId: selectedAsset.id,
        issue: mIssue,
        cost: Number(mCost),
        status: mStatus,
        loggedAt: serverTimestamp()
      });

      const assetStatusMap = {
        under_repair: "under_repair",
        resolved: "active",
        scrapped: "scrapped"
      };
      
      await updateDoc(doc(db, "assets", selectedAsset.id), {
        status: assetStatusMap[mStatus]
      });

      setSelectedAsset((prev: any) => ({
        ...prev,
        status: assetStatusMap[mStatus]
      }));

      setMIssue("");
      setMCost("");
      setMStatus("under_repair");
    } catch (err) {
      console.error("Error adding maintenance log:", err);
    }
    setIsSubmittingLog(false);
  };

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
    <RoleGuard permission="MANAGE_USERS" fallback={<div className="p-8 text-center text-foreground/40 font-bold uppercase tracking-wider text-xs">Access Denied.</div>}>
      <div className="space-y-6 pb-12 text-foreground">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Laptop2 className="h-5 w-5 text-primary" /> Asset Management
            </h1>
            <p className="text-xs text-foreground/40 mt-1">Track company devices, software licenses, and physical corporate assets.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/30" />
              <Input
                placeholder="Search inventory..."
                className="pl-9 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
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
              <DialogContent className="sm:max-w-[425px] bg-background border border-border text-foreground p-6 rounded-2xl shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-foreground">Register Corporate Asset</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddAsset} className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Asset Name / Model</label>
                    <Input 
                      required 
                      placeholder="e.g. MacBook Pro M3 Max" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Asset Type</label>
                      <select 
                        value={type} 
                        onChange={(e) => setType(e.target.value as AssetType)}
                        className="w-full h-9 border border-border rounded-xl px-3 text-xs focus:border-primary/60 focus:ring-0 bg-background text-foreground"
                      >
                        <option value="laptop">Laptop / PC</option>
                        <option value="monitor">Monitor / Display</option>
                        <option value="software">Software License</option>
                        <option value="other">Other Peripheral</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Serial / License Key</label>
                      <Input 
                        required 
                        placeholder="SN-9823485" 
                        value={serialNumber} 
                        onChange={e => setSerialNumber(e.target.value)} 
                        className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Assigned To (Employee Name)</label>
                    <Input 
                      placeholder="Leave blank if unassigned" 
                      value={assignedTo} 
                      onChange={e => setAssignedTo(e.target.value)} 
                      className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                    />
                  </div>
                  <DialogFooter className="pt-4 border-t border-border gap-2 sm:gap-0 mt-4">
                    <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost h-9 py-0 px-4 text-xs font-semibold border-border text-foreground/70 hover:text-foreground cursor-pointer">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary h-9 py-0 px-4 text-xs font-bold flex items-center justify-center cursor-pointer">
                      {isSubmitting ? "Saving..." : "Save Asset"}
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="bg-card border border-border shadow-sm rounded-lg overflow-hidden border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-16 text-center text-foreground/30">
                <p className="text-xs font-bold uppercase tracking-wider animate-pulse">Loading inventory assets...</p>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-16 text-foreground/30">
                <Laptop className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-wider text-foreground/40">No matching assets found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
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
                      <tr 
                        key={asset.id} 
                        onClick={() => {
                          setSelectedAsset(asset);
                          setIsMaintenanceOpen(true);
                        }}
                        className="hover: transition-colors cursor-pointer group"
                      >
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 p-2.5 rounded-xl text-primary border border-primary/20 shrink-0">
                              {asset.type === 'laptop' && <Laptop className="w-4 h-4" />}
                              {asset.type === 'monitor' && <Monitor className="w-4 h-4" />}
                              {asset.type === 'software' && <Key className="w-4 h-4" />}
                              {asset.type === 'other' && <AlertCircle className="w-4 h-4" />}
                              {!['laptop', 'monitor', 'software', 'other'].includes(asset.type) && <HelpCircle className="w-4 h-4" />}
                            </div>
                            <span className="font-bold text-foreground text-xs">{asset.name}</span>
                          </div>
                        </td>
                        <td className="text-foreground/50 font-mono text-xs font-semibold">{asset.serialNumber}</td>
                        <td className="text-foreground/60 font-semibold">{asset.assignedTo || <span className="text-foreground/30 italic">Unassigned</span>}</td>
                        <td>
                          <Badge variant="outline" className={cn("font-bold text-xs py-0.5 tracking-wider uppercase shadow-none",
                            asset.status === 'active' ? "bg-emerald-600/15 text-emerald-300 border-emerald-500/20" : 
                            asset.status === 'under_repair' ? "bg-amber-600/15 text-amber-300 border-amber-500/20 shadow-glow-amber animate-pulse" :
                            "bg-rose-600/15 text-rose-300 border-rose-500/20"
                          )}>
                            {asset.status === 'under_repair' ? 'repairing' : (asset.status || 'ACTIVE')}
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
        <Dialog open={isMaintenanceOpen} onOpenChange={setIsMaintenanceOpen}>
          <DialogContent className="sm:max-w-[650px] bg-background border border-border text-foreground p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Wrench className="h-5 w-5 text-accent" /> Asset Health & Maintenance Ledger
              </DialogTitle>
            </DialogHeader>

            {selectedAsset && (
              <div className="space-y-6 py-4">
                {/* Asset Metadata Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border border-border rounded-2xl">
                  <div>
                    <span className="text-xs font-bold text-foreground/35 uppercase tracking-wider block">Asset Model</span>
                    <span className="text-xs font-bold text-foreground block mt-0.5">{selectedAsset.name}</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground/35 uppercase tracking-wider block">Serial ID</span>
                    <span className="text-xs font-mono font-bold text-primary block mt-0.5">{selectedAsset.serialNumber}</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground/35 uppercase tracking-wider block">Custodian</span>
                    <span className="text-xs font-bold text-foreground/80 block mt-0.5">{selectedAsset.assignedTo || "Unassigned"}</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground/35 uppercase tracking-wider block">Status</span>
                    <Badge variant="outline" className={cn("font-bold text-xs py-0.5 tracking-wider uppercase shadow-none mt-1",
                      selectedAsset.status === 'active' ? "bg-emerald-600/15 text-emerald-300 border-emerald-500/20" :
                      selectedAsset.status === 'under_repair' ? "bg-amber-600/15 text-amber-300 border-amber-500/20 shadow-glow-amber animate-pulse" :
                      "bg-rose-600/15 text-rose-300 border-rose-500/20"
                    )}>
                      {selectedAsset.status === 'under_repair' ? 'repairing' : (selectedAsset.status || 'ACTIVE')}
                    </Badge>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* History Logs Feed */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-accent" /> Maintenance Logs
                    </h4>
                    
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                      {loadingLogs ? (
                        <p className="text-xs text-foreground/35 font-bold uppercase tracking-wider text-center py-6 animate-pulse">Loading service logs...</p>
                      ) : maintenanceLogs.length === 0 ? (
                        <p className="text-xs text-foreground/30 italic text-center py-8">No maintenance history recorded for this asset.</p>
                      ) : (
                        maintenanceLogs.map((log) => {
                          const badgeColor = 
                            log.status === 'resolved' ? "bg-emerald-500/10 text-accent border-emerald-500/20" :
                            log.status === 'under_repair' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-rose-500/10 text-rose-400 border-rose-500/20";
                          return (
                            <div key={log.id} className="p-3 border border-border/30 rounded-xl space-y-2">
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-foreground leading-tight">{log.issue}</span>
                                <Badge variant="outline" className={`font-bold text-xs py-0 tracking-wider uppercase ${badgeColor}`}>
                                  {log.status === 'under_repair' ? 'repairing' : log.status}
                                </Badge>
                              </div>
                              <div className="flex justify-between items-center text-xs text-foreground/40 font-mono uppercase tracking-wider">
                                <span>Cost: {Number(log.cost).toLocaleString()} AED</span>
                                <span>{log.loggedAt ? new Date(log.loggedAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Register Repair Form */}
                  <div className="space-y-4 border border-border p-4 rounded-2xl">
                    <h4 className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Log Service Event</h4>
                    
                    <form onSubmit={handleAddMaintenance} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Service details / Issue</label>
                        <Input 
                          required 
                          placeholder="e.g. Broken screen replacement" 
                          value={mIssue} 
                          onChange={e => setMIssue(e.target.value)} 
                          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8.5 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Cost of Repair (AED)</label>
                          <Input 
                            required 
                            type="number"
                            placeholder="e.g. 450" 
                            value={mCost} 
                            onChange={e => setMCost(e.target.value)} 
                            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8.5 text-xs border-border placeholder:text-foreground/20 focus:border-primary/60 focus:ring-0 w-full font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-foreground/50 uppercase tracking-wider">New Status</label>
                          <select 
                            value={mStatus} 
                            onChange={(e) => setMStatus(e.target.value as any)}
                            className="w-full h-8.5 border border-border rounded-xl px-2.5 text-xs focus:border-primary/60 focus:ring-0 bg-background text-foreground"
                          >
                            <option value="under_repair">Under Repair</option>
                            <option value="resolved">Resolved (Active)</option>
                            <option value="scrapped">Scrapped</option>
                          </select>
                        </div>
                      </div>
                      <button 
                        type="submit" 
                        disabled={isSubmittingLog} 
                        className="btn-primary w-full h-8.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer shadow-sm mt-3"
                      >
                        {isSubmittingLog ? "Submitting Log..." : "Log Service Record"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
