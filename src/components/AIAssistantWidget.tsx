import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageCircle, Sparkles, X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const EDGE_URL = "https://tvmpuswuxrpxayktmgwf.supabase.co/functions/v1/ai-assistant";

const STARTER_PROMPTS = [
  "What's my sprint health?",
  "Which metrics are at risk?",
  "How do I add a story?",
  "What does WSJF mean?",
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

export default function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pulse, setPulse] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => textareaRef.current?.focus(), 100);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  }, [inputValue]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      role: "user",
      content: trimmed,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInputValue("");
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = next
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ messages: payload }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Request failed");

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID?.() ?? Date.now().toString(),
          role: "assistant",
          content: json.message ?? "",
        },
      ]);
    } catch (err) {
      console.error("[AIAssistant]", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID?.() ?? Date.now().toString(),
          role: "assistant",
          content: "Sorry, I couldn't get a response. Please try again.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const onTextareaKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const canSend = inputValue.trim().length > 0 && !isLoading;

  return (
    <>
      {/* Animations */}
      <style>{`
        @keyframes ai-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(27,79,114,0.5); }
          50% { box-shadow: 0 0 0 12px rgba(27,79,114,0); }
        }
        @keyframes ai-slide-up {
          from { transform: translateY(20px) scale(0.96); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes ai-slide-down {
          from { transform: translateY(0) scale(1); opacity: 1; }
          to { transform: translateY(20px) scale(0.96); opacity: 0; }
        }
        @keyframes ai-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        .ai-fab-pulse { animation: ai-pulse 1.5s ease-out infinite; }
        .ai-panel-open { animation: ai-slide-up 300ms ease-out; }
        .ai-dot { width: 6px; height: 6px; border-radius: 50%; background: #0E7A65; display: inline-block; animation: ai-bounce 1.2s infinite ease-in-out; }
        .ai-tooltip { position: absolute; right: 70px; top: 50%; transform: translateY(-50%); background: #1B4F72; color: white; font-size: 12px; padding: 6px 10px; border-radius: 6px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 150ms; }
        .ai-fab-wrap:hover .ai-tooltip { opacity: 1; }
      `}</style>

      {!isOpen && (
        <div
          className="ai-fab-wrap"
          style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50 }}
        >
          <span className="ai-tooltip">PHOENIX Assistant</span>
          <button
            type="button"
            aria-label="Open PHOENIX Assistant"
            onClick={() => { setIsOpen(true); setPulse(false); }}
            className={pulse ? "ai-fab-pulse" : ""}
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "#1B4F72", color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            }}
          >
            <MessageCircle size={24} color="white" />
          </button>
        </div>
      )}

      {isOpen && (
        <div
          ref={panelRef}
          className="ai-panel-open"
          role="dialog"
          aria-label="PHOENIX Assistant"
          style={{
            position: "fixed",
            zIndex: 50,
            background: "white",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            ...(typeof window !== "undefined" && window.innerWidth < 640
              ? { inset: 0, borderRadius: "16px 16px 0 0" }
              : { bottom: 24, right: 24, width: 380, height: 560, borderRadius: 16 }),
          }}
        >
          {/* Header */}
          <div
            style={{
              flexShrink: 0,
              minHeight: 48,
              background: "#1B4F72",
              borderRadius: "16px 16px 0 0",
              padding: "8px 14px",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={18} color="white" />
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>PHOENIX Assistant</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  Ask me anything about your initiatives
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close assistant"
              onClick={() => setIsOpen(false)}
              style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div
            role="log"
            aria-live="polite"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 ? (
              <div style={{ margin: "auto", textAlign: "center", maxWidth: 300 }}>
                <Sparkles size={32} color="#1B4F72" style={{ margin: "0 auto 8px" }} />
                <div style={{ fontSize: 14, color: "#1B4F72", fontWeight: 600 }}>
                  Hi, I'm your PHOENIX Assistant
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Ask me about your initiatives, metrics, or how to use the platform.
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginTop: 16,
                  }}
                >
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => sendMessage(p)}
                      style={{
                        border: "1px solid #E2E8F0",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 11,
                        color: "#1B4F72",
                        background: "white",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#F0F7FF";
                        e.currentTarget.style.borderColor = "#1B4F72";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.borderColor = "#E2E8F0";
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "80%" }}>
                    <div
                      style={{
                        background: "#1B4F72",
                        color: "white",
                        borderRadius: "12px 12px 2px 12px",
                        padding: "10px 14px",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} style={{ alignSelf: "flex-start", maxWidth: "80%" }}>
                    <Sparkles size={14} color="#0E7A65" style={{ marginBottom: 2 }} />
                    <div
                      style={{
                        background: m.isError ? "#FEF2F2" : "#F1F5F9",
                        color: m.isError ? "#DC2626" : "#1e293b",
                        borderRadius: "12px 12px 12px 2px",
                        padding: "10px 14px",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ),
              )
            )}
            {isLoading && (
              <div style={{ alignSelf: "flex-start", maxWidth: "80%" }}>
                <Sparkles size={14} color="#0E7A65" style={{ marginBottom: 2 }} />
                <div
                  style={{
                    background: "#F1F5F9",
                    borderRadius: "12px 12px 12px 2px",
                    padding: "12px 14px",
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <span className="ai-dot" style={{ animationDelay: "0s" }} />
                  <span className="ai-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="ai-dot" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ flexShrink: 0, borderTop: "1px solid #E2E8F0", padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={textareaRef}
                aria-label="Message PHOENIX Assistant"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onTextareaKey}
                placeholder="Ask about your initiatives..."
                rows={1}
                style={{
                  flex: 1,
                  border: "1px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 13,
                  resize: "none",
                  minHeight: 40,
                  maxHeight: 100,
                  outline: "none",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px #0E7A65")}
                onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
              />
              <button
                type="button"
                aria-label="Send message"
                onClick={() => sendMessage(inputValue)}
                disabled={!canSend}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#0E7A65",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canSend ? "pointer" : "not-allowed",
                  opacity: canSend ? 1 : 0.5,
                }}
                onMouseEnter={(e) => { if (canSend) e.currentTarget.style.background = "#0a6354"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#0E7A65"; }}
              >
                <Send size={16} color="white" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              flexShrink: 0,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "#94a3b8",
            }}
          >
            Powered by Claude
          </div>
        </div>
      )}
    </>
  );
}
