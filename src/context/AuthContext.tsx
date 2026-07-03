"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, updateDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { sendDiscordNotification } from "@/lib/utils";
import { setDynamicPermissions } from "@/lib/permissions";


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
  const [delegatedRole, setDelegatedRole] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Dynamic Permissions sync
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "permissions"), (docSnap) => {
      if (docSnap.exists()) {
        setDynamicPermissions(docSnap.data() as Record<string, string[]>);
      }
    }, (err) => {
      console.warn("Failed to load dynamic permissions from Firestore, using static defaults:", err);
    });
    return () => unsub();
  }, []);

  // Session Tracking & Revocation & Delegations listener
  useEffect(() => {
    if (!user) {
      setDelegatedRole(null);
      setCurrentSessionId(null);
      return;
    }

    let sessionUnsub = () => {};

    const initSession = async () => {
      let sessId = sessionStorage.getItem("mints_session_id");
      if (!sessId) {
        sessId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem("mints_session_id", sessId);
      }
      setCurrentSessionId(sessId);

      let userIp = "Unknown";
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        userIp = ipData.ip || "Unknown";
      } catch (e) {
        console.error("Failed to fetch IP for session:", e);
      }

      const ua = navigator.userAgent;
      const deviceType = /Mobi|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop";
      const browserName = (() => {
        if (/Edg\//.test(ua)) return "Edge";
        if (/Chrome\//.test(ua)) return "Chrome";
        if (/Firefox\//.test(ua)) return "Firefox";
        if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
        return "Unknown";
      })();
      const platform = (navigator as any).userAgentData?.platform || navigator.platform || "Unknown";

      const sessionDocRef = doc(db, "sessions", sessId);
      try {
        await setDoc(sessionDocRef, {
          id: sessId,
          uid: user.uid,
          email: user.email,
          fullName: user.fullName || user.displayName || "Mints User",
          ip: userIp,
          browser: browserName,
          device: deviceType,
          platform,
          status: "active",
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to register session in Firestore:", err);
      }

      sessionUnsub = onSnapshot(sessionDocRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === "revoked") {
            sessionUnsub();
            alert("Your session has been terminated by an administrator.");
            await signOut(auth);
            setUser(null);
            sessionStorage.removeItem("mints_session_id");
          }
        }
      }, (err) => {
        console.warn("Session snapshot listener error:", err);
      });
    };

    initSession();

    const todayStr = new Date().toISOString().split("T")[0];
    const qDelegations = query(
      collection(db, "delegations"),
      where("toUid", "==", user.uid),
      where("status", "==", "active")
    );

    const delegationsUnsub = onSnapshot(qDelegations, (snap) => {
      const activeDelegation = snap.docs.find(d => {
        const data = d.data();
        return data.startDate <= todayStr && data.endDate >= todayStr;
      });
      if (activeDelegation) {
        setDelegatedRole(activeDelegation.data().role);
      } else {
        setDelegatedRole(null);
      }
    }, (err) => {
      console.warn("Delegations snapshot listener error:", err);
    });

    return () => {
      sessionUnsub();
      delegationsUnsub();
    };
  }, [user]);

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
        const emailLower = firebaseUser.email?.toLowerCase().trim() || "";
        const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
        const adminEmails = adminEmailsEnv.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
        
        // Enforce restriction: Block public @gmail.com accounts except admin accounts
        if (emailLower.endsWith("@gmail.com") && !adminEmails.includes(emailLower)) {
          setAuthError("Access Denied: Logins with public @gmail.com accounts are restricted. Please use your corporate static email provided by your administrator.");
          
          (async () => {
            try {
              const ipResponse = await fetch("https://api.ipify.org?format=json");
              const ipData = await ipResponse.json();
              const userIp = ipData.ip || "Unknown";

              const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
              const platform = typeof navigator !== "undefined" ? (navigator as any).userAgentData?.platform || navigator.platform || "Unknown" : "Unknown";
              const browserName = (() => {
                if (/Edg\//.test(ua)) return "Edge";
                if (/Chrome\//.test(ua)) return "Chrome";
                if (/Firefox\//.test(ua)) return "Firefox";
                if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
                return "Unknown";
              })();
              const deviceType = /Mobi|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop";
              const loginTs = new Date().toISOString();

              const { addDoc: addLoginDoc } = await import("firebase/firestore");
              await addLoginDoc(collection(db, "loginActivity"), {
                uid: firebaseUser.uid,
                email: emailLower,
                fullName: firebaseUser.displayName || emailLower,
                role: "unauthorized",
                ip: userIp,
                browser: browserName,
                device: deviceType,
                platform,
                sessionType: "Google SSO",
                status: "failed",
                createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
                loginAt: loginTs,
              });

              const auditRef = doc(collection(db, "auditLog"));
              await setDoc(auditRef, {
                actorId: firebaseUser.uid,
                actorName: firebaseUser.displayName || emailLower,
                action: "BLOCKED_LOGIN",
                targetCollection: "employees",
                targetId: firebaseUser.uid,
                details: `Blocked public gmail login attempt from ${emailLower} at IP ${userIp} via ${browserName} on ${deviceType} (${platform})`,
                createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
              });
            } catch (err) {
              console.error("Error logging blocked public gmail login:", err);
            }
          })();

          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }

        // Enforce super admin self-healing credentials for key admin accounts
        const isSuperAdmin = adminEmails.includes(emailLower);
        
        const getAdminFallbackName = (email: string) => {
          if (email.startsWith("admin")) return "System Administrator";
          if (email.startsWith("arya")) return "Arya";
          if (email.includes("anand") || email.includes("binuarjun")) return "Anand Binuarjun";
          return "Binu Arjun Anand";
        };

        const getAdminFallbackRole = (email: string) => {
          if (email.startsWith("arya") || email.includes("binu") || email.includes("founder")) return "founder";
          return "system_admin";
        };

        const getAdminFallbackJobTitle = (email: string) => {
          if (email.includes("binu") && email.endsWith("@gmail.com")) return "Super Admin";
          if (email.includes("anand") || email.includes("binuarjun")) return "Director IT & Cyber Security";
          return "System Admin";
        };
        
        const userDocRef = doc(db, "employees", firebaseUser.uid);
        let userDoc = await getDoc(userDocRef);
        
        let appUser: AppUser = firebaseUser;
        
        if (isSuperAdmin) {
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              fullName: firebaseUser.displayName || getAdminFallbackName(emailLower),
              email: emailLower,
              role: getAdminFallbackRole(emailLower),
              department: "OPERATIONS",
              departments: ["OPERATIONS"],
              jobTitle: getAdminFallbackJobTitle(emailLower),
              phone: "",
              isIntern: false,
              isActive: true,
              dateJoined: new Date().toISOString(),
              createdAt: new Date().toISOString()
            });
            userDoc = await getDoc(userDocRef);
          } else {
            const data = userDoc.data();
            const expectedRole = getAdminFallbackRole(emailLower);
            if (data?.role !== expectedRole || data?.isActive !== true) {
              await setDoc(userDocRef, {
                ...data,
                role: expectedRole,
                isActive: true,
                fullName: data?.fullName || getAdminFallbackName(emailLower),
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
          // De-duplication: Ensure no other profiles share this email address
          try {
            const dupQuery = query(collection(db, "employees"), where("email", "==", emailLower));
            const dupSnap = await getDocs(dupQuery);
            if (dupSnap.size > 1) {
              for (const dupDoc of dupSnap.docs) {
                if (dupDoc.id !== firebaseUser.uid) {
                  await deleteDoc(doc(db, "employees", dupDoc.id));
                  console.log(`De-duplication deleted redundant profile: ${dupDoc.id}`);
                }
              }
            }
          } catch (dupErr) {
            console.error("Self-healing de-duplication error:", dupErr);
          }

          const data = userDoc.data();
          // Verify user is active
          if (data.isActive === false) {
            setAuthError("Access Denied: Your account has been deactivated.");
            
            (async () => {
              try {
                const ipResponse = await fetch("https://api.ipify.org?format=json");
                const ipData = await ipResponse.json();
                const userIp = ipData.ip || "Unknown";

                const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
                const platform = typeof navigator !== "undefined" ? (navigator as any).userAgentData?.platform || navigator.platform || "Unknown" : "Unknown";
                const browserName = (() => {
                  if (/Edg\//.test(ua)) return "Edge";
                  if (/Chrome\//.test(ua)) return "Chrome";
                  if (/Firefox\//.test(ua)) return "Firefox";
                  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
                  return "Unknown";
                })();
                const deviceType = /Mobi|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop";
                const loginTs = new Date().toISOString();

                const { addDoc: addLoginDoc } = await import("firebase/firestore");
                await addLoginDoc(collection(db, "loginActivity"), {
                  uid: firebaseUser.uid,
                  email: emailLower,
                  fullName: data.fullName || firebaseUser.displayName || emailLower,
                  role: data.role || "employee",
                  ip: userIp,
                  browser: browserName,
                  device: deviceType,
                  platform,
                  sessionType: "Google/Credentials",
                  status: "failed",
                  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
                  loginAt: loginTs,
                });

                const auditRef = doc(collection(db, "auditLog"));
                await setDoc(auditRef, {
                  actorId: firebaseUser.uid,
                  actorName: data.fullName || firebaseUser.displayName || emailLower,
                  action: "BLOCKED_LOGIN",
                  targetCollection: "employees",
                  targetId: firebaseUser.uid,
                  details: `Deactivated user attempt to sign-in from IP ${userIp} via ${browserName} on ${deviceType} (${platform})`,
                  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
                });
              } catch (err) {
                console.error("Error logging blocked deactivated user login:", err);
              }
            })();

            await signOut(auth);
            setUser(null);
          } else {
            appUser = { ...firebaseUser, role: data.role, department: data.department, departments: data.departments || (data.department ? [data.department] : []), fullName: data.fullName, jobTitle: data.jobTitle, photoURL: data.profilePhotoURL || firebaseUser.photoURL };
            setUser(appUser);

            // Fetch public IP address and record login trace asynchronously
            (async () => {
              try {
                const ipResponse = await fetch("https://api.ipify.org?format=json");
                const ipData = await ipResponse.json();
                const userIp = ipData.ip || "Unknown";

                const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
                const platform = typeof navigator !== "undefined" ? (navigator as any).userAgentData?.platform || navigator.platform || "Unknown" : "Unknown";
                const browserName = (() => {
                  if (/Edg\//.test(ua)) return "Edge";
                  if (/Chrome\//.test(ua)) return "Chrome";
                  if (/Firefox\//.test(ua)) return "Firefox";
                  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
                  return "Unknown";
                })();
                const deviceType = /Mobi|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop";
                const loginTs = new Date().toISOString();

                await updateDoc(userDocRef, {
                  lastLoginIP: userIp,
                  lastLoginAt: loginTs,
                  lastSeenAt: loginTs
                });

                // Write to dedicated loginActivity collection for the Login Activity Monitor
                const { addDoc: addLoginDoc } = await import("firebase/firestore");
                await addLoginDoc(collection(db, "loginActivity"), {
                  uid: firebaseUser.uid,
                  email: emailLower,
                  fullName: appUser.fullName || firebaseUser.displayName || emailLower,
                  role: (appUser as any).role || "employee",
                  ip: userIp,
                  browser: browserName,
                  device: deviceType,
                  platform,
                  sessionType: "Email/Password",
                  status: "success",
                  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
                  loginAt: loginTs,
                });

                // Record audit trace
                const auditRef = doc(collection(db, "auditLog"));
                await setDoc(auditRef, {
                  actorId: firebaseUser.uid,
                  actorName: appUser.fullName || firebaseUser.displayName || emailLower,
                  action: "USER_LOGIN",
                  targetCollection: "employees",
                  targetId: firebaseUser.uid,
                  details: `Successful sign-in from IP ${userIp} via ${browserName} on ${deviceType} (${platform})`,
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
              appUser = { ...firebaseUser, role: data.role, department: data.department, departments: data.departments || (data.department ? [data.department] : []), fullName: data.fullName, jobTitle: data.jobTitle, photoURL: data.profilePhotoURL || firebaseUser.photoURL };
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

  // Periodic Heartbeat to mark the user as online/active & update active session
  useEffect(() => {
    if (!user) return;
    
    const updateHeartbeat = async () => {
      try {
        const userDocRef = doc(db, "employees", user.uid);
        await updateDoc(userDocRef, {
          lastSeenAt: new Date().toISOString()
        });

        const sessId = sessionStorage.getItem("mints_session_id");
        if (sessId) {
          const sessionDocRef = doc(db, "sessions", sessId);
          await updateDoc(sessionDocRef, {
            lastActiveAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error("Heartbeat error:", err);
      }
    };
    
    updateHeartbeat();
    
    const interval = setInterval(updateHeartbeat, 60000); // once every minute
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

  const activeRole = simulatedRole !== null ? simulatedRole : (delegatedRole || user?.role || null);

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
