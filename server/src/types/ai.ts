import type { ComposeInput, EmailSummary } from "./mail.js";

/** The frontend's current state, sent to the AI on every turn so it has context. */
export interface AppContext {
  currentView: "inbox" | "sent" | "compose" | "email";
  selectedEmailId: string | null;
  currentFilter: Record<string, unknown> | null;
  composeDraft: Partial<ComposeInput> | null;
}

/**
 * A single instruction the backend sends to the frontend telling it exactly
 * how to change application state. The frontend applies these directly to
 * its store - this IS "the AI controlling the UI", not a text description of it.
 */
export type UIAction =
  | { type: "SET_VIEW"; view: "inbox" | "sent" | "compose" | "email" }
  | { type: "SET_EMAIL_LIST"; folder: "inbox" | "sent"; emails: EmailSummary[] }
  | { type: "SET_SELECTED_EMAIL"; emailId: string }
  | { type: "SET_COMPOSE_DRAFT"; draft: Partial<ComposeInput>; aiPopulatedFields: string[] }
  | { type: "PATCH_COMPOSE_DRAFT"; draft: Partial<ComposeInput>; aiPopulatedFields: string[] }
  | { type: "REQUEST_SEND_CONFIRMATION"; draft: Partial<ComposeInput> }
  | { type: "EMAIL_SENT"; messageId: string }
  | { type: "SEND_FAILED"; error: string }
  | { type: "SET_FILTER"; filter: Record<string, unknown> }
  | { type: "MARK_READ"; emailId: string; isRead: boolean }
  | { type: "TOAST"; message: string; variant: "success" | "error" | "info" };

export interface ToolExecutionResult {
  toolName: string;
  /** Short text summarizing what happened, fed back to the model as the tool result. */
  resultForModel: string;
  /** UI actions to stream to the frontend as a result of this tool call. */
  uiActions: UIAction[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResponsePayload {
  reply: string;
  toolsUsed: { name: string; status: "success" | "error" }[];
  uiActions: UIAction[];
}
