"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, MoveLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-foreground px-6 relative overflow-hidden select-none">
      {/* Decorative Grid and Glow Background */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,var(--color-bg-card border border-border shadow-sm-15)_0%,transparent_70%)]" />
      
      <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-6">
        {/* Animated Compass / Error Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="p-5 rounded-3xl border border-primary/25 bg-card shadow-sm flex items-center justify-center text-primary"
        >
          <Compass className="h-14 w-14 animate-[spin_12s_linear_infinite]" />
        </motion.div>

        {/* 404 Title */}
        <div className="space-y-2">
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-6xl font-black font-mono tracking-tighter text-primary"
          >
            404
          </motion.h1>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-xl font-bold uppercase tracking-wider text-foreground/80"
          >
            Lost in Coordinates
          </motion.h2>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-xs text-foreground/50 leading-relaxed max-w-xs mx-auto"
          >
            The link or module path you are trying to access does not exist or has been secure-vaulted.
          </motion.p>
        </div>

        {/* Navigation Buttons */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex items-center gap-3 w-full"
        >
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="flex-1 h-11 text-xs font-semibold border-border bg-card hover:bg-muted text-foreground/75 hover:text-foreground rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <MoveLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Link href="/dashboard" className="flex-1">
            <Button
              className="w-full h-11 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm border-0 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
