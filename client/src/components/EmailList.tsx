import { useEffect, useState } from "react";
import { Search, RefreshCw, Filter as FilterIcon } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import type { EmailSummary, Filter } from "../types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function EmailList({
  folder,
  onOpenEmail,
}: {
  folder: "inbox" | "sent";
  onOpenEmail: (id: string) => void;
}) {
  const { state, dispatch } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [days, setDays] = useState<number | "">("");

  const emails = state[folder];

  async function load(filter: Filter = {}) {
    setLoading(true);
    setError(null);
    try {
      const merged: Filter = { folder, ...filter };
      const { emails } = await api.listEmails(merged);
      dispatch({ type: "MANUAL_SET_EMAIL_LIST", folder, emails });
      dispatch({ type: "SET_FILTER", filter: merged });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [folder]);

  function applyFilters() {
    const filter: Filter = {};
    if (searchInput.trim()) filter.query = searchInput.trim();
    if (unreadOnly) filter.isRead = false;
    if (days) {
      const after = new Date();
      after.setDate(after.getDate() - Number(days));
      filter.after = after.toISOString();
    }
    load(filter);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="border-b border-[var(--border)] p-3 flex flex-col gap-2 bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold capitalize mr-2">{folder}</h1>
          <div className="flex-1 flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-3 py-1.5">
            <Search size={14} className="text-[var(--text-muted)]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder={`Search ${folder}...`}
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-[var(--text-muted)]"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition ${
              showFilters ? "bg-[var(--surface-2)]" : ""
            }`}
            title="Filters"
          >
            <FilterIcon size={14} />
          </button>
          <button
            onClick={() => load()}
            className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] px-1 animate-fade-in">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <label className="flex items-center gap-1.5">
              Last
              <select
                value={days}
                onChange={(e) => setDays(e.target.value ? Number(e.target.value) : "")}
                className="bg-[var(--surface-2)] rounded px-1.5 py-1 border border-[var(--border)]"
              >
                <option value="">any time</option>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="10">10 days</option>
                <option value="30">30 days</option>
              </select>
            </label>
            <button onClick={applyFilters} className="text-[var(--accent)] font-medium">
              Apply
            </button>
            <button
              onClick={() => {
                setSearchInput("");
                setUnreadOnly(false);
                setDays("");
                load({});
              }}
              className="text-[var(--text-muted)]"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-1 p-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-[var(--surface-2)]/60 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="p-6 text-sm text-[var(--danger)]">
            Couldn't load {folder}: {error}
          </div>
        )}

        {!loading && !error && emails.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2">
            <p className="text-sm">No emails match this view.</p>
            <button onClick={() => load({})} className="text-xs text-[var(--accent)]">
              Reset filters
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          emails.map((email: EmailSummary) => (
            <button
              key={email.id}
              onClick={() => onOpenEmail(email.id)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)]/60 flex items-start gap-3 hover:bg-[var(--surface-2)]/50 transition ${
                state.selectedEmailId === email.id ? "bg-[var(--surface-2)]" : ""
              }`}
            >
              <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!email.isRead ? "bg-[var(--accent)]" : "bg-transparent"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm truncate ${!email.isRead ? "font-semibold text-white" : "text-[var(--text-muted)]"}`}>
                    {folder === "sent" ? `To: ${email.to.join(", ")}` : email.from}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">{formatDate(email.date)}</span>
                </div>
                <p className={`text-sm truncate ${!email.isRead ? "text-white" : "text-[var(--text-muted)]"}`}>
                  {email.subject}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">{email.snippet}</p>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
