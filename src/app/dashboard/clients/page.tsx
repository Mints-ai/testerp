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
    if (score >= 4) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 shadow-none">Excellent</Badge>;
    if (score === 3) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 shadow-none">Good</Badge>;
    return <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100 shadow-none animate-pulse">At Risk</Badge>;
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
                  <Button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold h-10 px-5 bg-olive-600 hover:bg-olive-700 text-white shadow-md transition-all hover:translate-y-[-1px]">
                    <Plus className="h-4 w-4" /> Add Client Profile
                  </Button>
                }
              />
              <DialogContent className="max-w-2xl bg-white border-slate-200 rounded-2xl shadow-xl overflow-hidden p-0">
                <DialogHeader className="p-6 bg-olive-900 text-white">
                  <DialogTitle className="text-xl font-bold">Onboard New Corporate Client</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddClientSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">Company Name *</label>
                      <Input 
                        placeholder="e.g., Al Futtaim Group" 
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        className="rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-slate-900 bg-white placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">Primary Contact Person</label>
                      <Input 
                        placeholder="e.g., Tariq Ahmad" 
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        className="rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-slate-900 bg-white placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">Corporate Email</label>
                      <Input 
                        type="email" 
                        placeholder="partner@futtaim.ae" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-slate-900 bg-white placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">Contact Number</label>
                      <Input 
                        placeholder="+971 4 123 4567" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-slate-900 bg-white placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">HQ Country</label>
                      <Input 
                        placeholder="Global" 
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-slate-900 bg-white placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">Operating Timezone</label>
                      <Input 
                        placeholder="GST (GMT+4)" 
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500 text-slate-900 bg-white placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive-800 uppercase">Account Health Score (1-5)</label>
                      <select 
                        value={healthScore}
                        onChange={(e) => setHealthScore(Number(e.target.value))}
                        className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:border-olive-500 focus:ring-olive-500 bg-white text-slate-900"
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
                    <label className="text-xs font-bold text-olive-800 uppercase">Company Logo / Brand Badge</label>
                    <div className="flex items-center gap-4 p-3 border border-dashed rounded-xl bg-slate-50/50">
                      <ImageIcon className="h-8 w-8 text-slate-400 shrink-0" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoChange}
                        className="text-xs text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-olive-50 file:text-olive-700 hover:file:bg-olive-100 cursor-pointer"
                      />
                      {logoBase64 && (
                        <img src={logoBase64} alt="Preview" className="h-10 w-10 object-contain rounded border bg-white ml-auto" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-olive-800 uppercase">Subscribed Retainer Services</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {AVAILABLE_SERVICES.map(svc => {
                        const active = servicesSubscribed.includes(svc);
                        return (
                          <button
                            key={svc}
                            type="button"
                            onClick={() => toggleService(svc)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                              active 
                                ? "bg-olive-600 text-white border-olive-600 shadow-sm" 
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {svc}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <DialogFooter className="pt-4 border-t gap-2 sm:gap-0">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddOpen(false)}
                      disabled={saving}
                      className="rounded-xl border-slate-200"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={saving || !companyName.trim()} 
                      className="bg-olive-600 hover:bg-olive-700 text-white rounded-xl"
                    >
                      {saving ? "Onboarding..." : "Establish Client Profile"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </RoleGuard>
        </div>

        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients by company or contact name..."
              className="pl-9 bg-muted/50 rounded-xl border-slate-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-olive-600 font-medium">Querying secure CRM records...</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed flex flex-col items-center border-slate-200 p-8">
            <Building2 className="h-12 w-12 text-slate-400/40 mb-4" />
            <h3 className="text-lg font-semibold text-slate-800">No Clients Discovered</h3>
            <p className="text-sm text-slate-500 mt-1">Try adjusting search parameters or add a new brand profile.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => (
              <Card 
                key={client.id} 
                onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden group border-slate-200 bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="h-1.5 bg-olive-100 group-hover:bg-olive-600 transition-colors"></div>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-3">
                        {client.logo ? (
                          <img src={client.logo} alt="" className="h-12 w-12 object-contain rounded-xl border bg-white shrink-0 p-1" />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-olive-50 flex items-center justify-center text-olive-600 font-bold text-lg shrink-0 border border-olive-100">
                            {client.companyName?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-olive-700 transition-colors">
                            {client.companyName}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1 text-slate-500 font-medium">
                            <Globe className="h-3 w-3 shrink-0" /> {client.country || "Global"} ({client.timezone || "GST"})
                          </CardDescription>
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
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
                            title="Delete Client"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm text-slate-600 font-medium">
                      {client.contactPerson && (
                        <div className="flex items-center gap-2.5">
                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                          <span>{client.contactPerson}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5">
                        <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="truncate">{client.email || "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>{client.phone || "No phone"}</span>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Services Subscribed</p>
                      <div className="flex flex-wrap gap-1.5">
                        {client.servicesSubscribed?.slice(0, 3).map((svc: string) => (
                          <Badge key={svc} variant="secondary" className="font-medium text-xs bg-slate-50 text-slate-600 border border-slate-200/80 shadow-none rounded-lg">
                            {svc}
                          </Badge>
                        ))}
                        {client.servicesSubscribed?.length > 3 && (
                          <Badge variant="secondary" className="font-semibold text-xs bg-olive-50 text-olive-700 border border-olive-100 shadow-none rounded-lg">
                            +{client.servicesSubscribed.length - 3} more
                          </Badge>
                        )}
                        {!client.servicesSubscribed?.length && (
                          <span className="text-xs text-slate-400 italic">None subscribed yet</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </div>
                
                <CardContent className="pt-0 pb-6">
                  <div className="pt-4 border-t border-slate-100 flex gap-2 relative z-10">
                    <Button 
                      variant="outline" 
                      className="w-full text-xs h-9 rounded-xl hover:bg-olive-50 hover:text-olive-700 border-slate-200 font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/projects?client=${encodeURIComponent(client.companyName)}`);
                      }}
                    >
                      View Projects
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full text-xs h-9 rounded-xl hover:bg-olive-50 hover:text-olive-700 border-slate-200 font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/clients/${client.id}`);
                      }}
                    >
                      CRM Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
