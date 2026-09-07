import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

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
    .describe("Set true only if the user has explicitly confirmed sending in this turn"),
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

// ---- Anthropic tool-use definitions (name + description + JSON schema) ----
// Descriptions are deliberately explicit about WHEN to call each tool -
// this is what lets the model pick tools instead of us regex-matching intent.

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "searchEmails",
    description:
      "Search or filter the inbox/sent emails by keyword, sender, date range, or read status, and update the main email list UI with the results. Use this for requests like 'show emails from the last 10 days', 'show unread emails from Sarah', 'find the email about the project'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text keyword to search subject/body/snippet" },
        from: { type: "string", description: "Sender name or email address to filter by" },
        after: { type: "string", description: "ISO date YYYY-MM-DD, inclusive lower bound" },
        before: { type: "string", description: "ISO date YYYY-MM-DD, inclusive upper bound" },
        isRead: { type: "boolean", description: "true = only read, false = only unread" },
        folder: { type: "string", enum: ["inbox", "sent"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "openEmail",
    description:
      "Open a specific email in the detail view. Use for 'open the latest email from David', 'show me the email about the meeting'. Provide emailId if already known from a prior search result in this conversation, otherwise provide matchFrom/matchSubject so the backend can resolve it.",
    input_schema: {
      type: "object",
      properties: {
        emailId: { type: "string" },
        matchFrom: { type: "string" },
        matchSubject: { type: "string" },
        mostRecent: { type: "boolean" },
      },
    },
  },
  {
    name: "composeEmail",
    description:
      "Open the compose view and pre-fill any of To/Cc/Bcc/Subject/Body. Use this whenever the user asks to write, compose, or send a NEW email (not a reply). Only fill fields the user actually specified or implied; leave others empty.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" } },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body: { type: "string" },
      },
    },
  },
  {
    name: "updateComposeDraft",
    description:
      "Update one or more fields of the CURRENTLY OPEN compose draft without resetting the others, e.g. when the user asks to change just the subject.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" } },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body: { type: "string" },
      },
    },
  },
  {
    name: "sendEmail",
    description:
      "Send the email currently in the compose draft. Only call this with confirm=true after the user has explicitly said to send it (e.g. after you've shown them the filled draft and they confirmed, or if their original message was an unambiguous, explicit send instruction with all required fields already given). If required fields are missing, do not call this — ask the user instead.",
    input_schema: {
      type: "object",
      properties: {
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "replyToEmail",
    description:
      "Reply to an email. If the user says 'reply to this' while an email is open, use the emailId from CURRENT CONTEXT rather than asking the user for it. Pre-fills the reply compose UI with correct recipient/subject and the given body.",
    input_schema: {
      type: "object",
      properties: {
        emailId: { type: "string" },
        body: { type: "string" },
      },
      required: ["body"],
    },
  },
  {
    name: "navigateTo",
    description: "Switch the main view, e.g. back to inbox, to sent, or to compose.",
    input_schema: {
      type: "object",
      properties: {
        view: { type: "string", enum: ["inbox", "sent", "compose", "email"] },
      },
      required: ["view"],
    },
  },
  {
    name: "markAsRead",
    description: "Mark a specific email as read or unread.",
    input_schema: {
      type: "object",
      properties: {
        emailId: { type: "string" },
        isRead: { type: "boolean" },
      },
      required: ["emailId"],
    },
  },
  {
    name: "refreshInbox",
    description: "Force a refresh of the inbox from the mail provider.",
    input_schema: { type: "object", properties: {} },
  },
];
