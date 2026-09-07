import { Type, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";

// ---- Zod schemas (single source of truth: validation + typing) ----

export const searchEmailsSchema = z.object({
  query: z.string().optional().describe("Free-text keyword to search subject/body/snippet"),
  from: z.string().optional().describe("Sender name or email address to filter by"),
  after: z.string().optional().describe("ISO date (YYYY-MM-DD) - only emails on/after this date"),
  before: z.string().optional().describe("ISO date (YYYY-MM-DD) - only emails on/before this date"),
  isRead: z.boolean().optional().describe("Filter by read (true) or unread (false) status"),
  folder: z.enum(["inbox", "sent"]).optional().default("inbox"),
  limit: z.number().int().positive().max(100).optional().default(25),
});

export const openEmailSchema = z.object({
  emailId: z.string().optional().describe("Exact email id if already known"),
  matchFrom: z.string().optional().describe("Sender name to match, e.g. 'David'"),
  matchSubject: z.string().optional().describe("Subject keyword to match"),
  mostRecent: z.boolean().optional().default(true).describe("Pick the most recent match"),
});

export const composeEmailSchema = z.object({
  to: z.array(z.string()).optional().default([]),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional().default(""),
  body: z.string().optional().default(""),
});

export const updateComposeDraftSchema = z.object({
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export const sendEmailSchema = z.object({
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Set true only if the user has explicitly confirmed sending in this turn"
    ),
});

export const replyToEmailSchema = z.object({
  emailId: z.string().optional().describe("Defaults to the currently open email if omitted"),
  body: z.string().describe("The reply message body"),
});

export const filterInboxSchema = searchEmailsSchema;

export const navigateToSchema = z.object({
  view: z.enum(["inbox", "sent", "compose", "email"]),
});

export const markAsReadSchema = z.object({
  emailId: z.string(),
  isRead: z.boolean().default(true),
});

export const refreshInboxSchema = z.object({});

// ---- Gemini function-calling definitions ----

export const toolDefinitions: FunctionDeclaration[] = [
  {
    name: "searchEmails",
    description:
      "Search the user's emails. Use this for finding emails by keywords, sender, dates, read/unread status, or folder.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Free-text keyword to search subject, body, or snippet",
        },
        from: {
          type: Type.STRING,
          description: "Sender name or email address",
        },
        after: {
          type: Type.STRING,
          description: "ISO date YYYY-MM-DD. Only emails on or after this date.",
        },
        before: {
          type: Type.STRING,
          description: "ISO date YYYY-MM-DD. Only emails on or before this date.",
        },
        isRead: {
          type: Type.BOOLEAN,
          description: "Filter by read=true or unread=false",
        },
        folder: {
          type: Type.STRING,
          enum: ["inbox", "sent"],
          description: "Mail folder to search",
        },
        limit: {
          type: Type.INTEGER,
          description: "Maximum number of results, up to 100",
        },
      },
    },
  },

  {
    name: "openEmail",
    description:
      "Open and display an email. Use when the user asks to open, read, inspect, or view an email.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        emailId: {
          type: Type.STRING,
          description: "Exact email id if already known",
        },
        matchFrom: {
          type: Type.STRING,
          description: "Sender name to match",
        },
        matchSubject: {
          type: Type.STRING,
          description: "Subject keyword to match",
        },
        mostRecent: {
          type: Type.BOOLEAN,
          description: "Whether to select the most recent matching email",
        },
      },
    },
  },

  {
    name: "composeEmail",
    description:
      "Open the compose UI and fill a new email draft. Use when the user asks to write, draft, or compose an email. Do not send automatically.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Recipient email addresses",
        },
        cc: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "CC email addresses",
        },
        bcc: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "BCC email addresses",
        },
        subject: {
          type: Type.STRING,
          description: "Email subject",
        },
        body: {
          type: Type.STRING,
          description: "Email body",
        },
      },
    },
  },

  {
    name: "updateComposeDraft",
    description:
      "Modify the currently open compose draft. Use when the user asks to change the recipient, subject, or body of an existing draft.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Recipient email addresses",
        },
        cc: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "CC email addresses",
        },
        bcc: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "BCC email addresses",
        },
        subject: {
          type: Type.STRING,
          description: "Updated email subject",
        },
        body: {
          type: Type.STRING,
          description: "Updated email body",
        },
      },
    },
  },

  {
    name: "sendEmail",
    description:
      "Send the currently composed email. Only call this with confirm=true after the user has explicitly confirmed sending.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirm: {
          type: Type.BOOLEAN,
          description:
            "Must be true only when the user explicitly confirmed sending",
        },
      },
    },
  },

  {
    name: "replyToEmail",
    description:
      "Reply to an email. Use when the user asks to reply to the currently open email or another specified email.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        emailId: {
          type: Type.STRING,
          description:
            "Email id to reply to. Defaults to the currently open email.",
        },
        body: {
          type: Type.STRING,
          description: "The reply message body",
        },
      },
      required: ["body"],
    },
  },

  {
    name: "navigateTo",
    description:
      "Navigate the mail application to Inbox, Sent, Compose, or an email view.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        view: {
          type: Type.STRING,
          enum: ["inbox", "sent", "compose", "email"],
          description: "Application view to navigate to",
        },
      },
      required: ["view"],
    },
  },

  {
    name: "markAsRead",
    description:
      "Mark a specific email as read or unread.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        emailId: {
          type: Type.STRING,
          description: "Email id",
        },
        isRead: {
          type: Type.BOOLEAN,
          description: "true to mark read, false to mark unread",
        },
      },
      required: ["emailId"],
    },
  },

  {
    name: "refreshInbox",
    description:
      "Refresh the inbox and synchronize the latest mail from the provider.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];