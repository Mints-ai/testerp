"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, User as UserIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/firebase";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

const SUGGESTIONS = [
  "What's my job title and department?",
  "What projects am I currently on?",
  "Look up Sarah's department",
];

export default function AssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !user) return;

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

      // Add an empty assistant bubble, then fill it in token-by-token as the
      // SSE stream arrives.
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
        buffer = parts.pop() || ""; // keep any incomplete trailing chunk for next read

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
            // ignore any malformed partial chunk -- next read will complete it
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] text-foreground max-w-3xl mx-auto w-full">
      <div className="mb-6 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> ERP Assistant
        </h1>
        <p className="text-xs text-foreground/40 mt-1">
          Ask about your job details, department, or current projects.
        </p>
      </div>

      <Card className="flex-1 flex flex-col border-border shadow-sm rounded-2xl overflow-hidden min-h-0">
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground/70">Ask the ERP Assistant</p>
                <p className="text-xs text-foreground/40 mt-1">Try one of these to get started:</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-4 py-2.5 rounded-xl border border-border text-xs text-foreground/70 hover:text-foreground hover:border-primary/30 transition-all text-left cursor-pointer"
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex items-start gap-3", m.role === "user" && "flex-row-reverse")}
                >
                  <Avatar className="w-7 h-7 border border-border shrink-0 mt-0.5">
                    <AvatarFallback
                      className={cn(
                        "text-xs font-bold",
                        m.role === "assistant" ? "bg-primary/20 text-primary/80" : "bg-muted text-foreground/70"
                      )}
                    >
                      {m.role === "assistant" ? <Bot className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
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
            <div className="flex items-start gap-3">
              <Avatar className="w-7 h-7 border border-border shrink-0 mt-0.5">
                <AvatarFallback className="bg-primary/20 text-primary/80">
                  <Bot className="w-3.5 h-3.5" />
                </AvatarFallback>
              </Avatar>
              <div className="border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </CardContent>

        <form onSubmit={handleSubmit} className="border-t border-border p-4 flex items-center gap-2 shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your role, department, or projects..."
            maxLength={2000}
            disabled={isSending || !user}
            className="flex-1 h-10 rounded-xl border border-border px-4 text-sm text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary bg-background disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim() || !user}
            className="h-10 w-10 rounded-xl bg-primary hover:bg-primary disabled:opacity-40 text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </Card>
    </div>
  );
}