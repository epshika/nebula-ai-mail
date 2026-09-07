import { Inbox, Send, PenSquare, Sparkles, Moon } from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { ViewName } from "../types";

export function Sidebar({
  mailMode,
  onNavigate,
}: {
  mailMode: "gmail" | "mock" | null;
  onNavigate: (view: ViewName) => void;
}) {
  const { state, dispatch } = useAppStore();

  const navItem = (view: ViewName, icon: React.ReactNode, label: string, count?: number) => (
    <button
      onClick={() => onNavigate(view)}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
        state.view === view
          ? "bg-[var(--surface-2)] text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]/60 hover:text-white"
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </button>
  );

  const unreadCount = state.inbox.filter((e) => !e.isRead).length;

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col p-3 gap-2">
      <div className="flex items-center gap-2 px-2 py-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center">
          <Sparkles size={16} className="text-white" />
        </div>
        <span className="font-semibold tracking-tight">Nebula Mail</span>
      </div>

      <button
        onClick={() => {
          dispatch({ type: "MANUAL_RESET_DRAFT" });
          onNavigate("compose");
        }}
        className="flex items-center gap-2 justify-center bg-[var(--accent)] hover:brightness-110 text-white rounded-lg py-2 text-sm font-medium mb-2 transition"
      >
        <PenSquare size={15} /> Compose
      </button>

      <nav className="flex flex-col gap-1">
        {navItem("inbox", <Inbox size={16} />, "Inbox", unreadCount)}
        {navItem("sent", <Send size={16} />, "Sent")}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-center gap-2 px-2 text-xs text-[var(--text-muted)]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${mailMode === "gmail" ? "bg-[var(--success)]" : "bg-yellow-500"}`}
          />
          {mailMode === "gmail" ? "Connected to Gmail" : "Local dev mode (mock data)"}
        </div>
        <button className="flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white transition">
          <Moon size={14} /> Dark mode
        </button>
      </div>
    </aside>
  );
}
