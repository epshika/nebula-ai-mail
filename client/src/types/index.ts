export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string[];
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
  folder: "inbox" | "sent";
}

export interface EmailDetail extends EmailSummary {
  bodyHtml: string;
  bodyText: string;
  cc?: string[];
  bcc?: string[];
}

export interface ComposeDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export type ViewName = "inbox" | "sent" | "compose" | "email";

export interface Filter {
  query?: string;
  from?: string;
  after?: string;
  before?: string;
  isRead?: boolean;
  folder?: "inbox" | "sent";
}

export type UIAction =
  | { type: "SET_VIEW"; view: ViewName }
  | { type: "SET_EMAIL_LIST"; folder: "inbox" | "sent"; emails: EmailSummary[] }
  | { type: "SET_SELECTED_EMAIL"; emailId: string }
  | { type: "SET_COMPOSE_DRAFT"; draft: Partial<ComposeDraft>; aiPopulatedFields: string[] }
  | { type: "PATCH_COMPOSE_DRAFT"; draft: Partial<ComposeDraft>; aiPopulatedFields: string[] }
  | { type: "REQUEST_SEND_CONFIRMATION"; draft: Partial<ComposeDraft> }
  | { type: "EMAIL_SENT"; messageId: string }
  | { type: "SEND_FAILED"; error: string }
  | { type: "SET_FILTER"; filter: Filter }
  | { type: "MARK_READ"; emailId: string; isRead: boolean }
  | { type: "TOAST"; message: string; variant: "success" | "error" | "info" };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolsUsed?: { name: string; status: "success" | "error" }[];
}
