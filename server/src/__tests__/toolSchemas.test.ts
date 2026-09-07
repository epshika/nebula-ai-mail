import { describe, expect, it } from "vitest";
import {
  composeEmailSchema,
  markAsReadSchema,
  navigateToSchema,
  openEmailSchema,
  replyToEmailSchema,
  searchEmailsSchema,
  sendEmailSchema,
} from "../tools/definitions.js";

describe("searchEmailsSchema", () => {
  it("applies defaults when given an empty object", () => {
    const parsed = searchEmailsSchema.parse({});
    expect(parsed.folder).toBe("inbox");
    expect(parsed.limit).toBe(25);
  });

  it("accepts a full filter", () => {
    const parsed = searchEmailsSchema.parse({
      query: "project",
      from: "sarah",
      after: "2026-01-01",
      isRead: false,
      folder: "sent",
      limit: 10,
    });
    expect(parsed.from).toBe("sarah");
    expect(parsed.isRead).toBe(false);
  });

  it("rejects a limit above the max", () => {
    expect(() => searchEmailsSchema.parse({ limit: 500 })).toThrow();
  });

  it("rejects a limit of zero or negative", () => {
    expect(() => searchEmailsSchema.parse({ limit: 0 })).toThrow();
    expect(() => searchEmailsSchema.parse({ limit: -5 })).toThrow();
  });
});

describe("composeEmailSchema", () => {
  it("defaults missing fields to empty rather than throwing", () => {
    const parsed = composeEmailSchema.parse({ subject: "Hi" });
    expect(parsed.to).toEqual([]);
    expect(parsed.subject).toBe("Hi");
    expect(parsed.body).toBe("");
  });
});

describe("sendEmailSchema", () => {
  it("defaults confirm to false so an unconfirmed send never slips through", () => {
    expect(sendEmailSchema.parse({}).confirm).toBe(false);
  });

  it("respects an explicit true", () => {
    expect(sendEmailSchema.parse({ confirm: true }).confirm).toBe(true);
  });
});

describe("replyToEmailSchema", () => {
  it("requires a body", () => {
    expect(() => replyToEmailSchema.parse({})).toThrow();
  });

  it("allows emailId to be omitted (resolved from context instead)", () => {
    const parsed = replyToEmailSchema.parse({ body: "Sounds good." });
    expect(parsed.emailId).toBeUndefined();
    expect(parsed.body).toBe("Sounds good.");
  });
});

describe("navigateToSchema", () => {
  it("only accepts known views", () => {
    expect(() => navigateToSchema.parse({ view: "inbox" })).not.toThrow();
    expect(() => navigateToSchema.parse({ view: "trash" })).toThrow();
  });
});

describe("openEmailSchema", () => {
  it("defaults mostRecent to true", () => {
    expect(openEmailSchema.parse({ matchFrom: "David" }).mostRecent).toBe(true);
  });
});

describe("markAsReadSchema", () => {
  it("requires emailId", () => {
    expect(() => markAsReadSchema.parse({ isRead: true })).toThrow();
  });

  it("defaults isRead to true", () => {
    expect(markAsReadSchema.parse({ emailId: "m1" }).isRead).toBe(true);
  });
});
