"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Zap } from "lucide-react";
import { sendDiscordNotification } from "@/lib/utils";

export default function LoginPage() {
  const { user, loginWithGoogle, loading, authError, setAuthError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (authError) {
      setError(authError);
      setIsLoggingIn(false);
      setAuthError(null);
    }
  }, [authError, setAuthError]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setError("");
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google.");
      setIsLoggingIn(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoggingIn(true);
      setError("");
      
      const finalEmail = email.includes("@") ? email.trim() : `${email.trim()}@mintsglobal.ae`;
      
      const cred = await signInWithEmailAndPassword(auth, finalEmail, password);
      await sendDiscordNotification(`🔓 **${cred.user.displayName || finalEmail}** logged in to the ERP.`);
    } catch (err: any) {
      setError("Invalid username or password.");
      setIsLoggingIn(false);
    }
  };

  if (loading || user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#030712] relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl animate-pulse" />
        <Zap className="h-8 w-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm font-semibold text-white/50 tracking-wider uppercase font-mono">Verifying Credentials...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full relative justify-center items-center p-4 bg-[#030712]">
      {/* Decorative Orbs */}
      <div className="absolute top-[10%] left-[20%] w-[320px] h-[320px] rounded-full bg-blue-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[20%] w-[350px] h-[350px] rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      <Card className="w-full max-w-md bg-white/[0.03] backdrop-blur-[24px] border border-white/[0.08] shadow-xl rounded-2xl overflow-hidden p-6 relative group animate-scale-in">
        {/* Border blue glow on hover */}
        <div className="absolute inset-0 border border-blue-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        <CardHeader className="space-y-3 text-center pb-6">
          {/* Logo container */}
          <div className="flex justify-center items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-glow-blue">
              <Zap className="h-5 w-5 text-white fill-white/20 animate-pulse" />
            </div>
            <div className="text-left">
              <h2 className="text-base font-extrabold text-white tracking-tight leading-tight">Mints Global</h2>
              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest leading-none">Internal ERP Platform</p>
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-white tracking-tight">Welcome Back</CardTitle>
          <CardDescription className="text-white/40 text-xs">
            Sign in to access your Mints Global workspace
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-500/20 rounded-xl text-center font-medium">
              {error}
            </div>
          )}
          
          <Button 
            className="w-full h-11 text-xs font-semibold btn-primary relative overflow-hidden" 
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
          >
            Continue with Google
            <span className="ml-1.5 text-[10px] text-blue-200 font-normal opacity-85">via Gmail / Google</span>
          </Button>
          
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-[#0c1322] px-2 text-white/30 font-bold tracking-wider">
                Or secure login
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="email" className="text-xs font-semibold text-white/70">Username or Email</Label>
                <span className="text-[9px] text-white/30 font-medium">auto-appends @mintsglobal.ae</span>
              </div>
              <Input 
                id="email" 
                type="text" 
                placeholder="e.g. anand or username@mintsglobal.ae" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoggingIn}
                className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-white/70">Password</Label>
              <Input 
                id="password" 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                className="glass-input h-10 text-xs border-white/10 px-3 placeholder:text-white/20 focus:border-blue-500/60 focus:ring-0"
              />
            </div>

            <Button 
              type="submit" 
              variant="outline" 
              className="w-full h-11 text-xs font-semibold btn-ghost cursor-pointer"
              disabled={isLoggingIn}
            >
              Sign In to ERP
            </Button>
          </form>
          
          <p className="text-[10px] text-center text-white/20 font-medium mt-6 leading-relaxed">
            Corporate Operating Center. Unauthorized access is subject to local cyber laws.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
