import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type {
  ComposeInput,
  EmailDetail,
  EmailSummary,
  MailProvider,
  SearchQuery,
  SendResult,
} from "../types/mail.js";

function b64urlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): {
  text: string;
  html: string;
} {
  if (!payload) return { text: "", html: "" };

  let text = "";
  let html = "";

  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += Buffer.from(part.body.data, "base64").toString("utf-8");
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html += Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    part.parts?.forEach(walk);
  };
  walk(payload);

  return { text, html };
}

function buildGmailQuery(query: SearchQuery): string {
  const parts: string[] = [];
  if (query.query) parts.push(query.query);
  if (query.from) parts.push(`from:${query.from}`);
  if (query.after) parts.push(`after:${Math.floor(new Date(query.after).getTime() / 1000)}`);
  if (query.before) parts.push(`before:${Math.floor(new Date(query.before).getTime() / 1000)}`);
  if (query.isRead === true) parts.push("is:read");
  if (query.isRead === false) parts.push("is:unread");
  if (query.folder === "sent") parts.push("in:sent");
  else parts.push("in:inbox");
  return parts.join(" ");
}

/**
 * Real Gmail API integration. Requires a Google OAuth2Client that already
 * has valid (refreshed) credentials attached — see authService.ts.
 *
 * Scopes required (least-privilege for what's implemented):
 *   gmail.readonly  - list/read messages
 *   gmail.send      - send mail
 *   gmail.modify    - mark read/unread
 */
export class GmailService implements MailProvider {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async listEmails(query: SearchQuery): Promise<EmailSummary[]> {
    const q = buildGmailQuery(query);
    const list = await this.gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: query.limit ?? 25,
    });

    const messages = list.data.messages ?? [];
    const details = await Promise.all(
      messages.map((m) =>
        this.gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        })
      )
    );

    return details.map((res) => {
      const msg = res.data;
      const headers = msg.payload?.headers;
      const from = headerValue(headers, "From");
      const fromEmailMatch = from.match(/<(.+)>/);
      return {
        id: msg.id!,
        threadId: msg.threadId!,
        from: from.replace(/<.+>/, "").trim() || from,
        fromEmail: fromEmailMatch ? fromEmailMatch[1] : from,
        to: [headerValue(headers, "To")].filter(Boolean),
        subject: headerValue(headers, "Subject") || "(no subject)",
        snippet: msg.snippet ?? "",
        date: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
        isRead: !msg.labelIds?.includes("UNREAD"),
        folder: query.folder === "sent" ? "sent" : "inbox",
      } satisfies EmailSummary;
    });
  }

  async getEmail(id: string): Promise<EmailDetail | null> {
    const res = await this.gmail.users.messages.get({ userId: "me", id, format: "full" });
    const msg = res.data;
    if (!msg) return null;

    const headers = msg.payload?.headers;
    const from = headerValue(headers, "From");
    const fromEmailMatch = from.match(/<(.+)>/);
    const { text, html } = extractBody(msg.payload);

    return {
      id: msg.id!,
      threadId: msg.threadId!,
      from: from.replace(/<.+>/, "").trim() || from,
      fromEmail: fromEmailMatch ? fromEmailMatch[1] : from,
      to: headerValue(headers, "To").split(",").map((s) => s.trim()).filter(Boolean),
      subject: headerValue(headers, "Subject") || "(no subject)",
      snippet: msg.snippet ?? "",
      bodyText: text,
      bodyHtml: html,
      date: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
      isRead: !msg.labelIds?.includes("UNREAD"),
      folder: msg.labelIds?.includes("SENT") ? "sent" : "inbox",
    };
  }

  async sendEmail(input: ComposeInput): Promise<SendResult> {
    try {
      if (!input.to?.length) return { success: false, error: "Recipient (To) is required." };

      const headers = [
        `To: ${input.to.join(", ")}`,
        input.cc?.length ? `Cc: ${input.cc.join(", ")}` : null,
        input.bcc?.length ? `Bcc: ${input.bcc.join(", ")}` : null,
        `Subject: ${input.subject}`,
        "Content-Type: text/plain; charset=utf-8",
        input.inReplyToId ? `In-Reply-To: ${input.inReplyToId}` : null,
      ].filter(Boolean);

      const raw = b64urlEncode(`${headers.join("\r\n")}\r\n\r\n${input.body}`);

      const res = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          threadId: input.inReplyToId ? undefined : undefined,
        },
      });

      return { success: true, messageId: res.data.id ?? undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Gmail send error";
      return { success: false, error: message };
    }
  }

  async markAsRead(id: string, isRead: boolean): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: isRead
        ? { removeLabelIds: ["UNREAD"] }
        : { addLabelIds: ["UNREAD"] },
    });
  }

  /**
   * Gmail push notifications require:
   *  1. A Google Cloud Pub/Sub topic the Gmail API account has publish rights to.
   *  2. gmail.users.watch({ topicName }) to register push notifications, which
   *     expire after 7 days and must be renewed.
   *  3. A Pub/Sub push subscription pointed at a backend HTTPS endpoint
   *     (e.g. POST /api/gmail/webhook) that receives { historyId } and calls
   *     users.history.list to fetch what changed since the last known historyId.
   *  4. The backend then re-emits changes to connected clients over the
   *     existing SSE channel (see routes/events.ts).
   *
   * This requires a publicly reachable HTTPS URL and a configured GCP project,
   * which is a deployment-time concern, not something this dev sandbox can
   * stand up. See README "Real-Time Sync" for the documented production
   * architecture and the polling fallback used here instead.
   */
  async watch(): Promise<void> {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) {
      console.warn(
        "[GmailService] GMAIL_PUBSUB_TOPIC not configured — skipping Gmail watch() registration. Falling back to polling (see realtime.ts)."
      );
      return;
    }
    await this.gmail.users.watch({
      userId: "me",
      requestBody: { topicName, labelIds: ["INBOX"] },
    });
  }
}
