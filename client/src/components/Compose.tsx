import { useEffect, useState } from "react";
import { Sparkles, Send, X } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";

function parseRecipients(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function Compose({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useAppStore();
  const draft = state.composeDraft ?? { to: [], subject: "", body: "" };

  const [to, setTo] = useState((draft.to ?? []).join(", "));
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync local fields whenever the AI patches the shared draft.
  useEffect(() => {
    setTo((state.composeDraft?.to ?? []).join(", "));
    setSubject(state.composeDraft?.subject ?? "");
    setBody(state.composeDraft?.body ?? "");
  }, [state.composeDraft]);

  const aiFields = new Set(state.aiPopulatedFields);

  async function handleSend() {
    setError(null);
    const toList = parseRecipients(to);
    if (toList.length === 0) return setError("Please add at least one recipient.");
    if (!subject.trim()) return setError("Please add a subject.");

    setSending(true);
    try {
      const result = await api.sendEmail({ to: toList, subject, body });
      if (!result.success) {
        setError(result.error || "Send failed.");
        dispatch({ type: "TOAST", message: `Failed to send: ${result.error}`, variant: "error" });
        return;
      }
      dispatch({ type: "EMAIL_SENT", messageId: result.messageId ?? "" });
      dispatch({ type: "TOAST", message: "Email sent.", variant: "success" });
      dispatch({ type: "MANUAL_RESET_DRAFT" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  function handleCancel() {
    dispatch({ type: "MANUAL_RESET_DRAFT" });
    onDone();
  }

  const fieldClass = (field: string) =>
    `w-full bg-transparent outline-none text-sm py-2 border-b transition-colors ${
      aiFields.has(field) ? "border-[var(--accent)]/60" : "border-[var(--border)]"
    }`;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="border-b border-[var(--border)] p-3 flex items-center justify-between bg-[var(--surface)]">
        <h1 className="text-base font-semibold">New message</h1>
        <button onClick={handleCancel} className="p-2 rounded-lg hover:bg-[var(--surface-2)] transition">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl flex flex-col gap-3 animate-fade-in">
          {state.aiPopulatedFields.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1.5 rounded-lg w-fit">
              <Sparkles size={12} /> AI populated {state.aiPopulatedFields.join(", ")}
            </div>
          )}

          <label className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] w-14 shrink-0">To</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className={fieldClass("to")}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] w-14 shrink-0">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className={fieldClass("subject")}
            />
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={14}
            className={`w-full bg-[var(--surface-2)] rounded-lg p-4 text-sm outline-none mt-2 resize-none border ${
              aiFields.has("body") ? "border-[var(--accent)]/60" : "border-transparent"
            }`}
          />

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-1.5 bg-[var(--accent)] hover:brightness-110 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <Send size={14} /> {sending ? "Sending..." : "Send"}
            </button>
            <button onClick={handleCancel} className="text-sm text-[var(--text-muted)] hover:text-white transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
