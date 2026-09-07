import { createContext, useCallback, useContext, useReducer } from "react";
import type { ReactNode } from "react";
import type { ComposeDraft, EmailSummary, Filter, UIAction, ViewName } from "../types";

interface Toast {
  id: string;
  message: string;
  variant: "success" | "error" | "info";
}

interface AppState {
  view: ViewName;
  inbox: EmailSummary[];
  sent: EmailSummary[];
  selectedEmailId: string | null;
  filter: Filter | null;
  composeDraft: Partial<ComposeDraft> | null;
  aiPopulatedFields: string[];
  pendingSendConfirmation: Partial<ComposeDraft> | null;
  lastSentMessageId: string | null;
  toasts: Toast[];
}

const initialState: AppState = {
  view: "inbox",
  inbox: [],
  sent: [],
  selectedEmailId: null,
  filter: null,
  composeDraft: null,
  aiPopulatedFields: [],
  pendingSendConfirmation: null,
  lastSentMessageId: null,
  toasts: [],
};

type Action =
  | UIAction
  | { type: "MANUAL_SET_VIEW"; view: ViewName }
  | { type: "MANUAL_SET_EMAIL_LIST"; folder: "inbox" | "sent"; emails: EmailSummary[] }
  | { type: "MANUAL_UPDATE_DRAFT"; draft: Partial<ComposeDraft> }
  | { type: "MANUAL_RESET_DRAFT" }
  | { type: "DISMISS_TOAST"; id: string }
  | { type: "PREPEND_INBOX_EMAIL"; email: EmailSummary };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_VIEW":
    case "MANUAL_SET_VIEW":
      return { ...state, view: action.view };

    case "SET_EMAIL_LIST":
    case "MANUAL_SET_EMAIL_LIST":
      return { ...state, [action.folder]: action.emails };

    case "SET_SELECTED_EMAIL":
      return { ...state, selectedEmailId: action.emailId };

    case "SET_COMPOSE_DRAFT":
      return {
        ...state,
        composeDraft: { to: [], subject: "", body: "", ...action.draft },
        aiPopulatedFields: action.aiPopulatedFields,
      };

    case "PATCH_COMPOSE_DRAFT":
      return {
        ...state,
        composeDraft: { ...state.composeDraft, ...action.draft },
        aiPopulatedFields: [...new Set([...state.aiPopulatedFields, ...action.aiPopulatedFields])],
      };

    case "MANUAL_UPDATE_DRAFT":
      return { ...state, composeDraft: { ...state.composeDraft, ...action.draft } };

    case "MANUAL_RESET_DRAFT":
      return { ...state, composeDraft: null, aiPopulatedFields: [], pendingSendConfirmation: null };

    case "REQUEST_SEND_CONFIRMATION":
      return { ...state, pendingSendConfirmation: action.draft };

    case "EMAIL_SENT":
      return {
        ...state,
        lastSentMessageId: action.messageId,
        composeDraft: null,
        aiPopulatedFields: [],
        pendingSendConfirmation: null,
      };

    case "SEND_FAILED":
      return { ...state, pendingSendConfirmation: null };

    case "SET_FILTER":
      return { ...state, filter: action.filter };

    case "MARK_READ":
      return {
        ...state,
        inbox: state.inbox.map((e) => (e.id === action.emailId ? { ...e, isRead: action.isRead } : e)),
      };

    case "PREPEND_INBOX_EMAIL":
      return { ...state, inbox: [action.email, ...state.inbox] };

    case "TOAST":
      return {
        ...state,
        toasts: [...state.toasts, { id: crypto.randomUUID(), message: action.message, variant: action.variant }],
      };

    case "DISMISS_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}

interface AppStoreContextValue {
  state: AppState;
  dispatch: (action: Action) => void;
  applyUIActions: (actions: UIAction[]) => void;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const applyUIActions = useCallback((actions: UIAction[]) => {
    actions.forEach((action) => dispatch(action));
  }, []);

  return (
    <AppStoreContext.Provider value={{ state, dispatch, applyUIActions }}>{children}</AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
