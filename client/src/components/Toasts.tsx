import { CheckCircle2, XCircle, Info } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useEffect } from "react";

export function Toasts() {
  const { state, dispatch } = useAppStore();

  useEffect(() => {
    const timers = state.toasts.map((t) =>
      setTimeout(() => dispatch({ type: "DISMISS_TOAST", id: t.id }), 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [state.toasts, dispatch]);

  const icon = {
    success: <CheckCircle2 size={14} className="text-[var(--success)]" />,
    error: <XCircle size={14} className="text-[var(--danger)]" />,
    info: <Info size={14} className="text-[var(--accent)]" />,
  };

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {state.toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm shadow-lg animate-fade-in"
        >
          {icon[t.variant]}
          {t.message}
        </div>
      ))}
    </div>
  );
}
