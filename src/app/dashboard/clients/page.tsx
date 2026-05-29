"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { canAccess } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Building2, Globe, Phone, Mail, User, Image as ImageIcon, Trash2 } from "lucide-react";

const AVAILABLE_SERVICES = [
  "SEO Campaign", 
  "Performance Marketing", 
  "Social Media Management", 
  "Brand Strategy", 
  "Cybersecurity Audit", 
  "Penetration Testing", 
  "Website Development", 
  "Mobile App", 
  "Video Production", 
  "Photography", 
  "Graphic Design", 
  "Full-Service Retainer"
];

export default function ClientsCRM() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form Fields
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Global");
  const [timezone, setTimezone] = useState("GST");
  const [healthScore, setHealthScore] = useState(5);
  const [servicesSubscribed, setServicesSubscribed] = useState<string[]>([]);
  const [logoBase64, setLogoBase64] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Fetch clients list ordered alphabetically by companyName
    const q = query(collection(db, "clients"), orderBy("companyName"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(cls);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to clients:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredClients = clients.filter(c => 
    c.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getHealthBadge = (score: number) => {
    if (score >= 4) return <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-[#0a1628] shadow-none font-bold">Excellent</Badge>;
    if (score === 3) return <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-[#0a1628] shadow-none font-bold">Good</Badge>;
    return <Badge className="bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-[#0a1628] shadow-none animate-pulse font-bold">At Risk</Badge>;
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const toggleService = (svc: string) => {
    setServicesSubscribed(prev => 
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  };

  const handleAddClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setSaving(true);
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      await addDoc(collection(db, "clients"), {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        phone: phone.trim(),
        country: country.trim(),
        timezone: timezone.trim(),
        healthScore: Number(healthScore),
        servicesSubscribed,
        logo: logoBase64 || null,
        createdAt: new Date().toISOString()
      });

      // Clear Form Fields
      setCompanyName("");
      setContactPerson("");
      setEmail("");
      setPhone("");
      setCountry("Global");
      setTimezone("GST");
      setHealthScore(5);
      setServicesSubscribed([]);
      setLogoBase64("");
      setIsAddOpen(false);
    } catch (err) {
      console.error("Error onboarding client:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard permission="VIEW_ALL_EMPLOYEES" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied. Interns do not have permissions to view corporate CRM databases.</div>}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Clients</h1>
            <p className="text-white/40 mt-1">Manage corporate accounts, active retainers, and client health metrics.</p>
          </div>
          
          <RoleGuard permission="MANAGE_FINANCE">
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger 
                render={
                  <Button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold h-10 px-5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-[0_0_24px_rgba(37,99,235,0.3)] border-0 cursor-pointer transition-all hover:translate-y-[-1px]">
                    <Plus className="h-4 w-4" /> Add Client Profile
                  </Button>
                }
              />
              <DialogContent className="max-w-2xl bg-[#0a1628] border border-white/[0.08] text-white rounded-2xl shadow-xl overflow-hidden p-0 backdrop-blur-xl">
                <DialogHeader className="p-6 bg-white/[0.02] border-b border-white/[0.06] text-white">
                  <DialogTitle className="text-xl font-bold">Onboard New Corporate Client</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddClientSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">Company Name *</label>
                      <Input 
                        placeholder="e.g., Al Futtaim Group" 
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        className="rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-white bg-white/[0.03] placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">Primary Contact Person</label>
                      <Input 
                        placeholder="e.g., Tariq Ahmad" 
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        className="rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-white bg-white/[0.03] placeholder:text-white/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">Corporate Email</label>
                      <Input 
                        type="email" 
                        placeholder="partner@futtaim.ae" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-white bg-white/[0.03] placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">Contact Number</label>
                      <Input 
                        placeholder="+971 4 123 4567" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-white bg-white/[0.03] placeholder:text-white/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">HQ Country</label>
                      <Input 
                        placeholder="Global" 
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-white bg-white/[0.03] placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">Operating Timezone</label>
                      <Input 
                        placeholder="GST (GMT+4)" 
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500 text-white bg-white/[0.03] placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase">Account Health Score (1-5)</label>
                      <select 
                        value={healthScore}
                        onChange={(e) => setHealthScore(Number(e.target.value))}
                        className="w-full h-10 px-3 border border-white/10 rounded-xl text-sm focus:border-blue-500 focus:ring-blue-500 bg-[#0d1f37] text-white"
                      >
                        <option value={5}>5 - Excellent Relationship</option>
                        <option value={4}>4 - Good Standing</option>
                        <option value={3}>3 - Fair Stability</option>
                        <option value={2}>2 - Under Attention</option>
                        <option value={1}>1 - At Threat / Churn Risk</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/60 uppercase">Company Logo / Brand Badge</label>
                    <div className="flex items-center gap-4 p-3 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                      <ImageIcon className="h-8 w-8 text-white/20 shrink-0" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoChange}
                        className="text-xs text-white/60 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-500/10 file:text-blue-300 hover:file:bg-blue-500/20 cursor-pointer"
                      />
                      {logoBase64 && (
                        <img src={logoBase64} alt="Preview" className="h-10 w-10 object-contain rounded border border-white/10 bg-white ml-auto" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-white/60 uppercase">Subscribed Retainer Services</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {AVAILABLE_SERVICES.map(svc => {
                        const active = servicesSubscribed.includes(svc);
                        return (
                          <button
                            key={svc}
                            type="button"
                            onClick={() => toggleService(svc)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              active 
                                ? "bg-[#2563eb] text-white border-[#2563eb] shadow-[0_0_15px_rgba(37,99,235,0.25)]" 
                                : "bg-white/[0.02] text-white/60 border-white/10 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {svc}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <DialogFooter className="pt-4 border-t border-white/[0.06] gap-2 sm:gap-0">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddOpen(false)}
                      disabled={saving}
                      className="rounded-xl border-white/10 text-white/60 hover:text-white hover:bg-white/5"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={saving || !companyName.trim()} 
                      className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl font-bold shadow-[0_0_24px_rgba(37,99,235,0.3)] border-0 cursor-pointer"
                    >
                      {saving ? "Onboarding..." : "Establish Client Profile"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </RoleGuard>
        </div>

        <div className="border border-white/[0.08] bg-white/[0.02] p-4 rounded-xl shadow-card backdrop-blur-xl flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="Search clients by company or contact name..."
              className="pl-9 bg-white/[0.03] text-white placeholder:text-white/20 rounded-xl border-white/10 focus:border-blue-500 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-blue-400 font-bold">Querying secure CRM records...</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl rounded-2xl flex flex-col items-center p-8">
            <Building2 className="h-12 w-12 text-white/20 mb-4" />
            <h3 className="text-lg font-bold text-white/80">No Clients Discovered</h3>
            <p className="text-sm text-white/40 mt-1">Try adjusting search parameters or add a new brand profile.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => (
              <div 
                key={client.id} 
                className="border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:shadow-card transition-all overflow-hidden group rounded-2xl flex flex-col justify-between"
              >
                <div>
                  <div className="h-1.5 bg-white/[0.04] group-hover:bg-blue-600 transition-colors"></div>
                  <div className="p-5 pb-3">
                    <div className="flex justify-between items-start gap-4">
                      <div 
                        className="flex gap-3 cursor-pointer"
                        onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                      >
                        {client.logo ? (
                          <img src={client.logo} alt="" className="h-12 w-12 object-contain rounded-xl border border-white/10 bg-white shrink-0 p-1" />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-300 font-bold text-lg shrink-0 border border-blue-500/20">
                            {client.companyName?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                            {client.companyName}
                          </h3>
                          <div className="flex items-center gap-1 mt-1 text-white/40 font-semibold text-xs">
                            <Globe className="h-3 w-3 shrink-0" /> {client.country || "Global"} ({client.timezone || "GST"})
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {getHealthBadge(client.healthScore || 5)}
                        {canAccess(role, "DELETE_DATA") && (
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Are you absolutely sure you want to permanently delete the client "${client.companyName}" and all associated CRM data? This action is irreversible.`)) {
                                try {
                                  const { deleteDoc, doc } = await import("firebase/firestore");
                                  await deleteDoc(doc(db, "clients", client.id));
                                } catch (err) {
                                  console.error("Error deleting client:", err);
                                }
                              }
                            }}
                            className="p-1.5 text-white/40 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                            title="Delete Client"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-5 pt-0 space-y-4">
                    <div className="space-y-2 text-xs text-white/60 font-semibold">
                      {client.contactPerson && (
                        <div className="flex items-center gap-2.5">
                          <User className="h-4 w-4 text-white/30 shrink-0" />
                          <span>{client.contactPerson}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5">
                        <Mail className="h-4 w-4 text-white/30 shrink-0" />
                        <span className="truncate">{client.email || "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-white/30 shrink-0" />
                        <span>{client.phone || "No phone"}</span>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-white/[0.06]">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-2">Services Subscribed</p>
                      <div className="flex flex-wrap gap-1.5">
                        {client.servicesSubscribed?.slice(0, 3).map((svc: string) => (
                          <Badge key={svc} variant="secondary" className="font-bold text-[10px] bg-white/[0.02] text-white/80 border border-white/10 shadow-none rounded-lg">
                            {svc}
                          </Badge>
                        ))}
                        {client.servicesSubscribed?.length > 3 && (
                          <Badge variant="secondary" className="font-bold text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 shadow-none rounded-lg">
                            +{client.servicesSubscribed.length - 3} more
                          </Badge>
                        )}
                        {!client.servicesSubscribed?.length && (
                          <span className="text-xs text-white/40 italic">None subscribed yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 pt-0 pb-5">
                  <div className="pt-4 border-t border-white/[0.06] flex gap-2 relative z-10">
                    <Button 
                      variant="outline" 
                      className="w-full text-xs h-9 rounded-xl border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-semibold cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/projects?client=${encodeURIComponent(client.companyName)}`);
                      }}
                    >
                      View Projects
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full text-xs h-9 rounded-xl border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-semibold cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/clients/${client.id}`);
                      }}
                    >
                      CRM Details
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
