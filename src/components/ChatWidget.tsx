"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, User as UserIcon, Sparkles, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

const SUGGESTIONS = [
  "What's my job title and department?",
  "What projects am I currently on?",
];

const GAP_ABOVE_TIMER = 16; // px breathing room between the timer and the button
const BUTTON_HEIGHT = 56; // matches h-14
const PANEL_GAP = 12; // px gap between button and panel when open

export function ChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [buttonBottom, setButtonBottom] = useState(96); // sane fallback before first measurement
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the GlobalTimer widget's live height so this button always sits
  // just above it, whether the timer is collapsed or expanded.
  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let timerEl = document.getElementById("global-timer-widget");

    const updatePosition = () => {
      const el = document.getElementById("global-timer-widget");
      if (el) {
        const rect = el.getBoundingClientRect();
        const heightFromViewportBottom = window.innerHeight - rect.top;
        setButtonBottom(heightFromViewportBottom + GAP_ABOVE_TIMER);
      } else {
        setButtonBottom(96); // Fallback if timer is hidden or not mounted
      }
    };

    if (timerEl) {
      updatePosition();
      observer = new ResizeObserver(updatePosition);
      observer.observe(timerEl);
    } else {
      // Keep trying to find it in case it renders later
      const intervalId = setInterval(() => {
        timerEl = document.getElementById("global-timer-widget");
        if (timerEl) {
          clearInterval(intervalId);
          updatePosition();
          observer = new ResizeObserver(updatePosition);
          observer.observe(timerEl);
        }
      }, 500);
      
      window.addEventListener("resize", updatePosition);
      
      return () => {
        clearInterval(intervalId);
        if (observer) observer.disconnect();
        window.removeEventListener("resize", updatePosition);
      };
    }

    window.addEventListener("resize", updatePosition);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  useEffect(() => {
    if (isOpen) scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, isOpen]);

  if (!user) return null;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not signed in.");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }

      if (!res.body) throw new Error("Empty response from assistant.");

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const payload = part.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const obj = JSON.parse(payload);
            if (obj.token) {
              accumulated += obj.token;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
              );
            }
          } catch {
            // partial chunk, wait for more data
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            err?.message === "Failed to fetch"
              ? "Couldn't reach the assistant. Please try again in a moment."
              : err?.message || "Something went wrong. Please try again.",
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const panelBottom = buttonBottom + BUTTON_HEIGHT + PANEL_GAP;

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{ bottom: buttonBottom }}
        className={cn(
          "fixed right-6 z-[100] h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer",
          "bg-primary hover:scale-105 active:scale-95"
        )}
        aria-label={isOpen ? "Close ERP Assistant" : "Open ERP Assistant"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-6 w-6 text-foreground" />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle className="h-6 w-6 text-foreground" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            style={{ bottom: panelBottom }}
            className="fixed right-6 z-[100] w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-14rem)] rounded-2xl border border-border bg-[#121813] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">ERP Assistant</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-xs text-foreground/40">
                    Ask about your role, department, or projects.
                  </p>
                  <div className="flex flex-col gap-1.5 w-full">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="px-3 py-2 rounded-lg border border-border text-[11px] text-foreground/70 hover:text-foreground hover:border-primary/30 transition-all text-left cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex items-start gap-2", m.role === "user" && "flex-row-reverse")}
                    >
                      <Avatar className="w-6 h-6 border border-border shrink-0 mt-0.5">
                        <AvatarFallback
                          className={cn(
                            "text-[10px] font-bold",
                            m.role === "assistant" ? "bg-primary/20 text-primary/80" : "bg-muted text-foreground/70"
                          )}
                        >
                          {m.role === "assistant" ? <Bot className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                          m.role === "user"
                            ? "bg-primary text-foreground rounded-tr-sm"
                            : m.isError
                              ? "bg-rose-950/40 border border-rose-500/20 text-rose-300 rounded-tl-sm"
                              : "border border-border text-foreground/90 rounded-tl-sm"
                        )}
                      >
                        {m.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}

              {isSending && (
                <div className="flex items-start gap-2">
                  <Avatar className="w-6 h-6 border border-border shrink-0 mt-0.5">
                    <AvatarFallback className="bg-primary/20 text-primary/80">
                      <Bot className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="border border-border rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-foreground/30 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-1 rounded-full bg-foreground/30 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-1 rounded-full bg-foreground/30 animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 border-t border-border p-3 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                maxLength={2000}
                disabled={isSending}
                className="flex-1 h-9 rounded-lg border border-border px-3 text-xs text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary bg-background disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="h-9 w-9 rounded-lg bg-primary hover:bg-primary disabled:opacity-40 text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}