import { useEffect, useState } from "react";
import { AppStoreProvider, useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { EmailList } from "./components/EmailList";
import { EmailDetail } from "./components/EmailDetail";
import { Compose } from "./components/Compose";
import { AssistantPanel } from "./components/AssistantPanel";
import { Toasts } from "./components/Toasts";
import { api, subscribeToRealtime } from "./lib/api";
import type { ViewName } from "./types";

function Shell() {
  const { state, dispatch } = useAppStore();
  const [mailMode, setMailMode] = useState<"gmail" | "mock" | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    api.mailStatus().then((s) => setMailMode(s.mode)).catch(() => setMailMode("mock"));
    api.authStatus().then((s) => setGoogleConfigured(s.googleConfigured)).catch(() => {});
    api
      .me()
      .then((m) => setAuthed(m.authenticated))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToRealtime((email) => {
      dispatch({ type: "PREPEND_INBOX_EMAIL", email });
      dispatch({ type: "TOAST", message: `New email from ${email.from}`, variant: "info" });
    });
    return unsubscribe;
  }, [dispatch]);

  function navigate(view: ViewName) {
    dispatch({ type: "MANUAL_SET_VIEW", view });
  }

  function openEmail(id: string) {
    dispatch({ type: "SET_SELECTED_EMAIL", emailId: id });
    navigate("email");
  }

  if (checkingAuth) return null;

  return (
    <div className="h-full flex">
      <Sidebar mailMode={mailMode} onNavigate={navigate} />

      {state.view === "inbox" && <EmailList folder="inbox" onOpenEmail={openEmail} />}
      {state.view === "sent" && <EmailList folder="sent" onOpenEmail={openEmail} />}
      {state.view === "email" && state.selectedEmailId && (
        <EmailDetail emailId={state.selectedEmailId} onBack={() => navigate("inbox")} />
      )}
      {state.view === "compose" && <Compose onDone={() => navigate("inbox")} />}

      <AssistantPanel />
      <Toasts />

      {!authed && googleConfigured && (
        <div className="fixed top-4 right-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm flex items-center gap-3 shadow-lg">
          <span>Sign in with Google to use your real Gmail account.</span>
          <a href={api.googleLoginUrl()} className="text-[var(--accent)] font-medium">
            Sign in
          </a>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <Shell />
    </AppStoreProvider>
  );
}
