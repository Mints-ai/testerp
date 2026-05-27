"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import { sendDiscordNotification } from "@/lib/utils";

interface AppUser extends User {
  role?: string;
  department?: string;
  departments?: string[];
  fullName?: string;
  jobTitle?: string;
}

interface AuthContextType {
  user: AppUser | null;
  role: string | null;
  simulatedRole: string | null;
  setSimulatedRole: (role: string | null) => void;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  setAuthError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  simulatedRole: null,
  setSimulatedRole: () => {},
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
  authError: null,
  setAuthError: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [simulatedRole, setSimulatedRoleState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("simulatedRole");
      if (saved) {
        setSimulatedRoleState(saved);
      }
    }
  }, []);

  const setSimulatedRole = (role: string | null) => {
    setSimulatedRoleState(role);
    if (typeof window !== "undefined") {
      if (role) {
        sessionStorage.setItem("simulatedRole", role);
      } else {
        sessionStorage.removeItem("simulatedRole");
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Enforce super admin self-healing credentials for key admin accounts
        const emailLower = firebaseUser.email?.toLowerCase().trim() || "";
        const isSuperAdmin = emailLower === "binuarjunanand@gmail.com" || 
                             emailLower === "admin@mintsgloabal.ae" || 
                             emailLower === "admin@mintsglobal.ae";
        
        const userDocRef = doc(db, "employees", firebaseUser.uid);
        let userDoc = await getDoc(userDocRef);
        
        let appUser: AppUser = firebaseUser;
        
        if (isSuperAdmin) {
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              fullName: firebaseUser.displayName || (emailLower.startsWith("admin") ? "System Administrator" : "Binu Arjun Anand"),
              email: emailLower,
              role: "founder",
              department: "OPERATIONS",
              departments: ["OPERATIONS"],
              jobTitle: "Super Admin",
              phone: "",
              isIntern: false,
              isActive: true,
              dateJoined: new Date().toISOString(),
              createdAt: new Date().toISOString()
            });
            userDoc = await getDoc(userDocRef);
          } else {
            const data = userDoc.data();
            if (data?.role !== "founder" || data?.isActive !== true) {
              await setDoc(userDocRef, {
                ...data,
                role: "founder",
                isActive: true,
                fullName: data?.fullName || (emailLower.startsWith("admin") ? "System Administrator" : "Binu Arjun Anand"),
                updatedAt: new Date().toISOString()
              }, { merge: true });
              userDoc = await getDoc(userDocRef);
            }
          }
        }
        
        if (!userDoc.exists() && firebaseUser.email) {
          // If not found by UID, search for manually onboarded profile by email!
          const q = query(collection(db, "employees"), where("email", "==", firebaseUser.email));
          const querySnap = await getDocs(q);
          
          if (!querySnap.empty) {
            const oldDoc = querySnap.docs[0];
            const data = oldDoc.data();
            
            // Re-key the manual profile under the user's authentic Auth UID!
            await setDoc(userDocRef, {
              ...data,
              fullName: data.fullName || firebaseUser.displayName || "Mints Team Member",
              updatedAt: new Date().toISOString()
            });
            
            // Delete the old random-ID document to avoid duplication
            if (oldDoc.id !== firebaseUser.uid) {
              await deleteDoc(doc(db, "employees", oldDoc.id));
            }
            
            // Reload the linked document
            userDoc = await getDoc(userDocRef);
          }
        }

        if (userDoc.exists()) {
          const data = userDoc.data();
          // Verify user is active
          if (data.isActive === false) {
            setAuthError("Access Denied: Your account has been deactivated.");
            await signOut(auth);
            setUser(null);
          } else {
            appUser = { ...firebaseUser, role: data.role, department: data.department, departments: data.departments || (data.department ? [data.department] : []), fullName: data.fullName, jobTitle: data.jobTitle };
            setUser(appUser);

            // Fetch public IP address and record login trace asynchronously
            (async () => {
              try {
                const ipResponse = await fetch("https://api.ipify.org?format=json");
                const ipData = await ipResponse.json();
                const userIp = ipData.ip || "Unknown";

                await updateDoc(userDocRef, {
                  lastLoginIP: userIp,
                  lastLoginAt: new Date().toISOString(),
                  lastSeenAt: new Date().toISOString()
                });

                // Record audit trace
                const auditRef = doc(collection(db, "auditLog"));
                await setDoc(auditRef, {
                  actorId: firebaseUser.uid,
                  action: "LOGIN",
                  targetCollection: "employees",
                  targetId: firebaseUser.uid,
                  details: `User logged in from IP address: ${userIp}`,
                  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
                });
              } catch (ipErr) {
                console.error("Error logging sign-in IP address:", ipErr);
              }
            })();
          }
        } else {
          // SELF-HEALING FALLBACK: If the database was wiped but the user is authenticated in Firebase Auth,
          // automatically reconstruct their Firestore employee record to prevent lockout!
          try {
            const emailLower = firebaseUser.email?.toLowerCase().trim() || "";
            const defaultRole = "employee";
            
            // Format name cleanly from email
            const nameParts = emailLower.split("@")[0].split(".");
            const cleanName = nameParts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
            
            await setDoc(userDocRef, {
              fullName: firebaseUser.displayName || cleanName,
              email: emailLower,
              role: defaultRole,
              department: "OPERATIONS",
              departments: ["OPERATIONS"],
              jobTitle: "Team Member",
              phone: firebaseUser.phoneNumber || "",
              isIntern: false,
              isActive: true,
              dateJoined: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isSelfHealed: true
            });
            
            await sendDiscordNotification(
              `♻️ **Self-Healing Active**: Reconstructed missing Firestore profile for authenticated user **${emailLower}** following database anomaly.`,
              undefined,
              'auth'
            );
            
            userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              const data = userDoc.data();
              appUser = { ...firebaseUser, role: data.role, department: data.department, departments: data.departments || (data.department ? [data.department] : []), fullName: data.fullName, jobTitle: data.jobTitle };
              setUser(appUser);
            }
          } catch (healErr) {
            console.error("Self-healing failed:", healErr);
            setAuthError("Access Denied: Your email is not registered in Mints Global ERP. Please contact an administrator.");
            await signOut(auth);
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Periodic Heartbeat to mark the user as online/active
  useEffect(() => {
    if (!user) return;
    
    const updateHeartbeat = async () => {
      try {
        const userDocRef = doc(db, "employees", user.uid);
        await updateDoc(userDocRef, {
          lastSeenAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Heartbeat error:", err);
      }
    };
    
    updateHeartbeat();
    
    const interval = setInterval(updateHeartbeat, 120000); // once every 2 minutes
    return () => clearInterval(interval);
  }, [user]);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Removed host domain constraint so employees can sign in with any standard Gmail address!
    try {
      const result = await signInWithPopup(auth, provider);
      await sendDiscordNotification(`🔓 **${result.user.displayName || result.user.email}** logged in to the ERP via Google.`, undefined, 'auth');
    } catch (error: any) {
      console.error("Login failed", error);
      throw error;
    }
  };

  const logout = async () => {
    if (user) {
      await sendDiscordNotification(`🔒 **${user.fullName || user.email}** logged out of the ERP.`, undefined, 'auth');
    }
    setSimulatedRole(null);
    await signOut(auth);
  };

  const activeRole = simulatedRole !== null ? simulatedRole : (user?.role || null);

  return (
    <AuthContext.Provider value={{ 
      user, 
      role: activeRole, 
      simulatedRole, 
      setSimulatedRole, 
      loading, 
      loginWithGoogle, 
      logout, 
      authError, 
      setAuthError 
    }}>
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => useContext(AuthContext);
