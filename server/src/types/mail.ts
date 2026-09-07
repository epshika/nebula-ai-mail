export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string[];
  subject: string;
  snippet: string;
  date: string; // ISO string
  isRead: boolean;
  folder: "inbox" | "sent";
}

export interface EmailDetail extends EmailSummary {
  bodyHtml: string;
  bodyText: string;
  cc?: string[];
  bcc?: string[];
}

export interface SearchQuery {
  query?: string;
  from?: string;
  after?: string; // ISO date
  before?: string; // ISO date
  isRead?: boolean;
  limit?: number;
  folder?: "inbox" | "sent";
}

export interface ComposeInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyToId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Every mail backend (real Gmail, or the local dev fixture) implements this
 * interface. The rest of the application never talks to Gmail directly —
 * it only depends on this contract. This is what lets us swap in
 * MockMailService for local development without touching routes, tools,
 * or the AI service.
 */
export interface MailProvider {
  listEmails(query: SearchQuery): Promise<EmailSummary[]>;
  getEmail(id: string): Promise<EmailDetail | null>;
  sendEmail(input: ComposeInput): Promise<SendResult>;
  markAsRead(id: string, isRead: boolean): Promise<void>;
  /** Optional: start push/watch mechanism. No-op for providers that don't support it. */
  watch?(): Promise<void>;
}
