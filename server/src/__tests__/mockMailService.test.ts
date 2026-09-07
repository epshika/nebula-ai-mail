import { beforeEach, describe, expect, it } from "vitest";
import { MockMailService } from "../services/mockMailService.js";

describe("MockMailService.listEmails filtering", () => {
  let service: MockMailService;

  beforeEach(() => {
    service = new MockMailService();
  });

  it("returns inbox emails sorted newest first by default", async () => {
    const emails = await service.listEmails({});
    const dates = emails.map((e) => new Date(e.date).getTime());
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });

  it("filters by sender name case-insensitively", async () => {
    const emails = await service.listEmails({ from: "david" });
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) {
      expect(e.from.toLowerCase()).toContain("david");
    }
  });

  it("filters by unread status", async () => {
    const unread = await service.listEmails({ isRead: false });
    expect(unread.every((e) => e.isRead === false)).toBe(true);
    const read = await service.listEmails({ isRead: true });
    expect(read.every((e) => e.isRead === true)).toBe(true);
  });

  it("filters by keyword across subject/snippet/body", async () => {
    const emails = await service.listEmails({ query: "kickoff" });
    expect(emails.length).toBeGreaterThan(0);
  });

  it("filters by date range (after)", async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    const emails = await service.listEmails({ after: cutoff.toISOString() });
    for (const e of emails) {
      expect(new Date(e.date).getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
  });

  it("respects limit", async () => {
    const emails = await service.listEmails({ limit: 2 });
    expect(emails.length).toBeLessThanOrEqual(2);
  });

  it("returns sent emails only when folder=sent", async () => {
    const sent = await service.listEmails({ folder: "sent" });
    expect(sent.every((e) => e.folder === "sent")).toBe(true);
  });

  it("does not leak bodyHtml/bodyText in list results", async () => {
    const emails = await service.listEmails({});
    for (const e of emails) {
      expect((e as unknown as Record<string, unknown>).bodyHtml).toBeUndefined();
      expect((e as unknown as Record<string, unknown>).bodyText).toBeUndefined();
    }
  });
});

describe("MockMailService.sendEmail", () => {
  let service: MockMailService;
  beforeEach(() => {
    service = new MockMailService();
  });

  it("rejects sending with no recipient", async () => {
    const result = await service.sendEmail({ to: [], subject: "Hi", body: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/recipient/i);
  });

  it("rejects sending with no subject", async () => {
    const result = await service.sendEmail({ to: ["a@b.com"], subject: "", body: "test" });
    expect(result.success).toBe(false);
  });

  it("succeeds and appears in the sent folder", async () => {
    const result = await service.sendEmail({
      to: ["john@example.com"],
      subject: "Meeting Tomorrow",
      body: "Let's meet at 3pm",
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    const sent = await service.listEmails({ folder: "sent" });
    expect(sent.some((e) => e.id === result.messageId)).toBe(true);
    expect(sent.some((e) => e.subject === "Meeting Tomorrow")).toBe(true);
  });
});

describe("MockMailService.markAsRead", () => {
  it("flips isRead on the target email only", async () => {
    const service = new MockMailService();
    const before = await service.listEmails({});
    const target = before.find((e) => !e.isRead);
    expect(target).toBeDefined();

    await service.markAsRead(target!.id, true);
    const after = await service.listEmails({});
    const updated = after.find((e) => e.id === target!.id);
    expect(updated?.isRead).toBe(true);

    const others = after.filter((e) => e.id !== target!.id);
    const othersBefore = before.filter((e) => e.id !== target!.id);
    expect(others.map((e) => e.isRead)).toEqual(othersBefore.map((e) => e.isRead));
  });
});
