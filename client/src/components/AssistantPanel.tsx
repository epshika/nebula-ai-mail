import { useRef, useState } from "react";
import { Sparkles, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import type { ChatMessage } from "../types";

const SUGGESTIONS = [
  "Show me unread emails from this week",
  "Compose an email to john@example.com about Meeting Tomorrow",
  "Find the email from David about the project",
  "Reply to this saying that works for me",
];

export function AssistantPanel() {
  const { state, applyUIActions, dispatch } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi! I can compose emails, search your inbox, open messages, and reply — just tell me what you need.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    scrollToBottom();

    try {
      const { reply, toolsUsed, uiActions } = await api.chat(text, [...messages, userMsg], {
        currentView: state.view,
        selectedEmailId: state.selectedEmailId,
        currentFilter: state.filter,
        composeDraft: state.composeDraft ?? null,
      });

      applyUIActions(uiActions);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", text: reply, toolsUsed },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: `Error: ${message}` }]);
      dispatch({ type: "TOAST", message: "Assistant request failed.", variant: "error" });
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  return (
    <aside className="w-96 shrink-0 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col">
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--accent)]" />
        <span className="text-sm font-semibold">Assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col gap-1 animate-fade-in ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--text)]"
              }`}
            >
              {m.text}
            </div>
            {m.toolsUsed && m.toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {m.toolsUsed.map((t, i) => (
                  <span
                    key={i}
                    className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border ${
                      t.status === "success"
                        ? "border-[var(--success)]/40 text-[var(--success)]"
                        : "border-[var(--danger)]/40 text-[var(--danger)]"
                    }`}
                  >
                    {t.status === "success" ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 size={12} className="animate-spin" /> Thinking...
          </div>
        )}

        {state.pendingSendConfirmation && (
          <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/10 rounded-lg p-3 flex flex-col gap-2 animate-fade-in">
            <p className="text-xs text-[var(--text-muted)]">
              Ready to send to <span className="text-white">{state.pendingSendConfirmation.to?.join(", ")}</span>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => send("Yes, send it.")}
                className="text-xs bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg"
              >
                Send email
              </button>
              <button
                onClick={() => dispatch({ type: "SEND_FAILED", error: "cancelled" })}
                className="text-xs bg-[var(--surface-2)] px-3 py-1.5 rounded-lg"
              >
                Keep editing
              </button>
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-left text-xs text-[var(--text-muted)] hover:text-white bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-[var(--border)] flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask the assistant..."
          className="flex-1 bg-[var(--surface-2)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="p-2 rounded-lg bg-[var(--accent)] disabled:opacity-50 text-white transition"
        >
          <Send size={14} />
        </button>
      </div>
    </aside>
  );
}
