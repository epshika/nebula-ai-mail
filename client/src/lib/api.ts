import type { ChatMessage, EmailDetail, EmailSummary, Filter, UIAction, ViewName } from "../types";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  authStatus: () => request<{ googleConfigured: boolean }>("/api/auth/status"),
  me: () =>
    request<{ authenticated: boolean; user?: { email: string; name: string | null; picture: string | null } }>(
      "/api/auth/me"
    ),
  logout: () => request<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
  googleLoginUrl: () => `${BASE}/api/auth/google/login`,

  mailStatus: () => request<{ live: boolean; mode: "gmail" | "mock" }>("/api/mail/status"),

  listEmails: (filter: Filter) => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    });
    return request<{ emails: EmailSummary[] }>(`/api/mail/emails?${params.toString()}`);
  },

  getEmail: (id: string) => request<{ email: EmailDetail }>(`/api/mail/emails/${id}`),

  markRead: (id: string, isRead: boolean) =>
    request<{ success: boolean }>(`/api/mail/emails/${id}/read`, {
      method: "PATCH",
      body: JSON.stringify({ isRead }),
    }),

  sendEmail: (input: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string }) =>
    request<{ success: boolean; messageId?: string; error?: string }>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  chat: (
    message: string,
    history: ChatMessage[],
    context: {
      currentView: ViewName;
      selectedEmailId: string | null;
      currentFilter: Filter | null;
      composeDraft: Record<string, unknown> | null;
    }
  ) =>
    request<{ reply: string; toolsUsed: { name: string; status: "success" | "error" }[]; uiActions: UIAction[] }>(
      "/api/assistant/chat",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          history: history.map((h) => ({ role: h.role, content: h.text })),
          context,
        }),
      }
    ),

  simulateIncoming: () =>
    request<{ success: boolean; email: EmailSummary }>("/api/realtime/simulate-incoming", {
      method: "POST",
    }),
};

export function subscribeToRealtime(onNewMail: (email: EmailSummary) => void): () => void {
  const source = new EventSource(`${BASE}/api/realtime/stream`, { withCredentials: true });
  source.addEventListener("new-mail", (event) => {
    try {
      onNewMail(JSON.parse((event as MessageEvent).data));
    } catch {
      // ignore malformed event
    }
  });
  return () => source.close();
}
