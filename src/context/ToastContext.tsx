"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "warning" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Overlay Container */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isWarning = toast.type === "warning";
          const isError = toast.type === "error";
          
          return (
            <div
              key={toast.id}
              className={cn("pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border animate-in slide-in-from-right duration-350 transition-all",
                // Glassmorphic Theme Variants
                isSuccess 
                  ? "bg-emerald-950/70 border-emerald-500/25 text-emerald-100 shadow-[0_8px_32px_0_rgba(16,185,129,0.12)]" 
                  : isWarning 
                  ? "bg-amber-950/70 border-amber-500/25 text-amber-100 shadow-[0_8px_32px_0_rgba(245,158,11,0.12)]" 
                  : isError 
                  ? "bg-red-950/70 border-red-500/25 text-red-100 shadow-[0_8px_32px_0_rgba(239,68,68,0.12)]" 
                  : "bg-slate-950/70 border-white/[0.08] text-slate-100 shadow-[0_8px_32px_0_rgba(99,102,241,0.12)]"
              )}
            >
              {/* Icon */}
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                {isWarning && <AlertTriangle className="h-5 w-5 text-amber-400" />}
                {isError && <XCircle className="h-5 w-5 text-red-400" />}
                {!isSuccess && !isWarning && !isError && <Info className="h-5 w-5 text-blue-400" />}
              </div>

              {/* Message */}
              <div className="flex-1 text-sm font-semibold leading-relaxed tracking-wide">
                {toast.message}
              </div>

              {/* Close Button */}
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-foreground/40 hover:text-foreground/80 transition-colors p-0.5 rounded-lg hover:bg-muted/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
