import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { ArrowLeft, Reply } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import type { EmailDetail as EmailDetailType } from "../types";

export function EmailDetail({ emailId, onBack }: { emailId: string; onBack: () => void }) {
  const { dispatch } = useAppStore();
  const [email, setEmail] = useState<EmailDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getEmail(emailId)
      .then(({ email }) => {
        if (cancelled) return;
        setEmail(email);
        dispatch({ type: "MARK_READ", emailId: email.id, isRead: true });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load email"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [emailId, dispatch]);

  function handleReply() {
    if (!email) return;
    dispatch({
      type: "SET_COMPOSE_DRAFT",
      draft: {
        to: [email.fromEmail],
        subject: email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`,
        body: "",
      },
      aiPopulatedFields: [],
    });
    dispatch({ type: "SET_VIEW", view: "compose" });
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="border-b border-[var(--border)] p-3 flex items-center gap-2 bg-[var(--surface)]">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-[var(--surface-2)] transition">
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm text-[var(--text-muted)]">Back</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && <div className="h-40 rounded-lg bg-[var(--surface-2)]/60 animate-pulse" />}
        {!loading && error && <p className="text-sm text-[var(--danger)]">Couldn't load email: {error}</p>}

        {!loading && email && (
          <div className="max-w-3xl animate-fade-in">
            <h1 className="text-xl font-semibold mb-3">{email.subject}</h1>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-sm font-medium text-[var(--accent)]">
                  {email.from[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{email.from}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    to {email.to.join(", ")} · {new Date(email.date).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReply}
                className="flex items-center gap-1.5 text-sm bg-[var(--surface-2)] hover:bg-[var(--border)] px-3 py-1.5 rounded-lg transition"
              >
                <Reply size={14} /> Reply
              </button>
            </div>
            <div
              className="prose prose-invert prose-sm max-w-none text-[var(--text)] leading-relaxed"
              // email.bodyHtml is sanitized server-side (sanitize-html) and again
              // client-side here (DOMPurify) before being rendered - never trust
              // raw email HTML.
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.bodyHtml || email.bodyText) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
