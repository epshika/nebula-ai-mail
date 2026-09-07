import { randomUUID } from "node:crypto";
import type {
  ComposeInput,
  EmailDetail,
  EmailSummary,
  MailProvider,
  SearchQuery,
  SendResult,
} from "../types/mail.js";

/**
 * IMPORTANT: This is a clearly-labeled local development fallback, NOT a
 * substitute for real Gmail integration. It exists so the application's
 * UI + AI-tool-control loop can be exercised end-to-end without live
 * Google OAuth credentials during development. See README "Limitations".
 *
 * GmailService (services/gmailService.ts) implements the same MailProvider
 * interface against the real Gmail API and is used automatically once
 * valid OAuth credentials are configured (USE_MOCK_MAIL=false, the default
 * once GOOGLE_CLIENT_ID/SECRET are set).
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const seedInbox: EmailDetail[] = [
  {
    id: "m1",
    threadId: "t1",
    from: "David Chen",
    fromEmail: "david.chen@example.com",
    to: ["me@example.com"],
    subject: "Project Meeting - Kickoff Notes",
    snippet: "Here are the notes from today's kickoff meeting...",
    bodyText:
      "Hi,\n\nHere are the notes from today's kickoff meeting. We agreed to start the sprint on Monday and review scope on Friday.\n\nLet me know if you can make the Friday review.\n\nDavid",
    bodyHtml:
      "<p>Hi,</p><p>Here are the notes from today's kickoff meeting. We agreed to start the sprint on Monday and review scope on Friday.</p><p>Let me know if you can make the Friday review.</p><p>David</p>",
    date: daysAgo(1),
    isRead: false,
    folder: "inbox",
  },
  {
    id: "m2",
    threadId: "t2",
    from: "Sarah Miller",
    fromEmail: "sarah.miller@example.com",
    to: ["me@example.com"],
    subject: "Project Update - Q3 Milestones",
    snippet: "Quick update on where we stand with the Q3 milestones...",
    bodyText:
      "Hey,\n\nQuick update on where we stand with the Q3 milestones - we're on track for the Oct 15 deadline. Two items are at risk, flagged in the doc.\n\nSarah",
    bodyHtml:
      "<p>Hey,</p><p>Quick update on where we stand with the Q3 milestones — we're on track for the Oct 15 deadline. Two items are at risk, flagged in the doc.</p><p>Sarah</p>",
    date: daysAgo(3),
    isRead: true,
    folder: "inbox",
  },
  {
    id: "m3",
    threadId: "t3",
    from: "David Chen",
    fromEmail: "david.chen@example.com",
    to: ["me@example.com"],
    subject: "Re: Project Meeting - Kickoff Notes",
    snippet: "One more thing - can you also loop in the design team?",
    bodyText: "One more thing — can you also loop in the design team for Friday?",
    bodyHtml: "<p>One more thing — can you also loop in the design team for Friday?</p>",
    date: daysAgo(0),
    isRead: false,
    folder: "inbox",
  },
  {
    id: "m4",
    threadId: "t4",
    from: "GitHub",
    fromEmail: "notifications@github.com",
    to: ["me@example.com"],
    subject: "[nebula-ai-mail] New issue opened",
    snippet: "A new issue was opened in nebula-ai-mail: Add dark mode",
    bodyText: "A new issue was opened in nebula-ai-mail: Add dark mode",
    bodyHtml: "<p>A new issue was opened in nebula-ai-mail: Add dark mode</p>",
    date: daysAgo(12),
    isRead: true,
    folder: "inbox",
  },
  {
    id: "m5",
    threadId: "t5",
    from: "Priya Nair",
    fromEmail: "priya.nair@example.com",
    to: ["me@example.com"],
    subject: "Lunch next week?",
    snippet: "Are you free for lunch sometime next week?",
    bodyText: "Are you free for lunch sometime next week? Let me know what works.",
    bodyHtml: "<p>Are you free for lunch sometime next week? Let me know what works.</p>",
    date: daysAgo(6),
    isRead: false,
    folder: "inbox",
  },
];

const seedSent: EmailDetail[] = [
  {
    id: "s1",
    threadId: "t2",
    from: "Me",
    fromEmail: "me@example.com",
    to: ["sarah.miller@example.com"],
    subject: "Re: Project Update - Q3 Milestones",
    snippet: "Thanks Sarah, can you flag the at-risk items in the standup?",
    bodyText: "Thanks Sarah, can you flag the at-risk items in the standup?",
    bodyHtml: "<p>Thanks Sarah, can you flag the at-risk items in the standup?</p>",
    date: daysAgo(2),
    isRead: true,
    folder: "sent",
  },
];

export class MockMailService implements MailProvider {
  private inbox: EmailDetail[] = [...seedInbox];
  private sent: EmailDetail[] = [...seedSent];

  async listEmails(query: SearchQuery): Promise<EmailSummary[]> {
    const source = query.folder === "sent" ? this.sent : this.inbox;
    let results = [...source];

    if (query.from) {
      const needle = query.from.toLowerCase();
      results = results.filter(
        (e) =>
          e.from.toLowerCase().includes(needle) ||
          e.fromEmail.toLowerCase().includes(needle)
      );
    }
    if (query.query) {
      const needle = query.query.toLowerCase();
      results = results.filter(
        (e) =>
          e.subject.toLowerCase().includes(needle) ||
          e.snippet.toLowerCase().includes(needle) ||
          e.bodyText.toLowerCase().includes(needle)
      );
    }
    if (query.after) {
      const after = new Date(query.after).getTime();
      results = results.filter((e) => new Date(e.date).getTime() >= after);
    }
    if (query.before) {
      const before = new Date(query.before).getTime();
      results = results.filter((e) => new Date(e.date).getTime() <= before);
    }
    if (typeof query.isRead === "boolean") {
      results = results.filter((e) => e.isRead === query.isRead);
    }

    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (query.limit) results = results.slice(0, query.limit);

    return results.map(({ bodyHtml, bodyText, ...rest }) => rest);
  }

  async getEmail(id: string): Promise<EmailDetail | null> {
    return (
      this.inbox.find((e) => e.id === id) ?? this.sent.find((e) => e.id === id) ?? null
    );
  }

  async sendEmail(input: ComposeInput): Promise<SendResult> {
    if (!input.to?.length) return { success: false, error: "Recipient (To) is required." };
    if (!input.subject?.trim()) return { success: false, error: "Subject is required." };

    const id = randomUUID();
    const sentEmail: EmailDetail = {
      id,
      threadId: input.inReplyToId
        ? this.inbox.find((e) => e.id === input.inReplyToId)?.threadId ?? id
        : id,
      from: "Me",
      fromEmail: "me@example.com",
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      snippet: input.body.slice(0, 120),
      bodyText: input.body,
      bodyHtml: `<p>${input.body.replace(/\n/g, "</p><p>")}</p>`,
      date: new Date().toISOString(),
      isRead: true,
      folder: "sent",
    };
    this.sent.unshift(sentEmail);
    return { success: true, messageId: id };
  }

  async markAsRead(id: string, isRead: boolean): Promise<void> {
    const email = this.inbox.find((e) => e.id === id);
    if (email) email.isRead = isRead;
  }

  /** Simulates a new inbound email arriving, for demonstrating the SSE real-time path. */
  simulateIncoming(): EmailSummary {
    const id = randomUUID();
    const email: EmailDetail = {
      id,
      threadId: id,
      from: "Priya Nair",
      fromEmail: "priya.nair@example.com",
      to: ["me@example.com"],
      subject: "Following up",
      snippet: "Just checking in on the timeline.",
      bodyText: "Just checking in on the timeline.",
      bodyHtml: "<p>Just checking in on the timeline.</p>",
      date: new Date().toISOString(),
      isRead: false,
      folder: "inbox",
    };
    this.inbox.unshift(email);
    const { bodyHtml, bodyText, ...summary } = email;
    return summary;
  }
}
