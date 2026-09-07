import { beforeEach, describe, expect, it } from "vitest";
import { MockMailService } from "../services/mockMailService.js";
import { executeTool } from "../tools/executor.js";
import type { AppContext } from "../types/ai.js";

function baseContext(): AppContext {
  return {
    currentView: "inbox",
    selectedEmailId: null,
    currentFilter: null,
    composeDraft: null,
  };
}

describe("executeTool: searchEmails", () => {
  it("produces a SET_EMAIL_LIST action reflecting the real filtered data", async () => {
    const provider = new MockMailService();
    const result = await executeTool("searchEmails", { from: "David" }, provider, baseContext());
    const setList = result.uiActions.find((a) => a.type === "SET_EMAIL_LIST");
    expect(setList).toBeDefined();
    if (setList?.type === "SET_EMAIL_LIST") {
      expect(setList.emails.length).toBeGreaterThan(0);
      expect(setList.emails.every((e) => e.from.toLowerCase().includes("david"))).toBe(true);
    }
  });
});

describe("executeTool: openEmail", () => {
  it("resolves by sender name and marks the email read", async () => {
    const provider = new MockMailService();
    const result = await executeTool("openEmail", { matchFrom: "David", mostRecent: true }, provider, baseContext());
    const setSelected = result.uiActions.find((a) => a.type === "SET_SELECTED_EMAIL");
    expect(setSelected).toBeDefined();
    const markRead = result.uiActions.find((a) => a.type === "MARK_READ");
    expect(markRead).toBeDefined();
  });

  it("reports no match cleanly instead of throwing", async () => {
    const provider = new MockMailService();
    const result = await executeTool(
      "openEmail",
      { matchFrom: "NobodyAtAll" },
      provider,
      baseContext()
    );
    expect(result.resultForModel).toMatch(/no email found/i);
    expect(result.uiActions.some((a) => a.type === "TOAST")).toBe(true);
  });
});

describe("executeTool: composeEmail", () => {
  it("opens compose and pre-fills only the given fields, tracked as ai-populated", async () => {
    const provider = new MockMailService();
    const result = await executeTool(
      "composeEmail",
      { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" },
      provider,
      baseContext()
    );
    const setDraft = result.uiActions.find((a) => a.type === "SET_COMPOSE_DRAFT");
    expect(setDraft).toBeDefined();
    if (setDraft?.type === "SET_COMPOSE_DRAFT") {
      expect(setDraft.aiPopulatedFields).toEqual(expect.arrayContaining(["to", "subject", "body"]));
    }
    expect(result.uiActions.some((a) => a.type === "SET_VIEW" && a.view === "compose")).toBe(true);
  });
});

describe("executeTool: sendEmail confirmation gating", () => {
  let provider: MockMailService;
  beforeEach(() => {
    provider = new MockMailService();
  });

  it("refuses to send without confirm=true, even with a valid draft", async () => {
    const context = baseContext();
    context.composeDraft = { to: ["a@b.com"], subject: "Hi", body: "test" };
    const result = await executeTool("sendEmail", { confirm: false }, provider, context);
    expect(result.uiActions.some((a) => a.type === "REQUEST_SEND_CONFIRMATION")).toBe(true);
    expect(result.uiActions.some((a) => a.type === "EMAIL_SENT")).toBe(false);
  });

  it("refuses to send when required fields are missing, regardless of confirm", async () => {
    const context = baseContext();
    context.composeDraft = { subject: "", body: "test" };
    const result = await executeTool("sendEmail", { confirm: true }, provider, context);
    expect(result.resultForModel).toMatch(/cannot send/i);
    expect(result.uiActions.some((a) => a.type === "EMAIL_SENT")).toBe(false);
  });

  it("sends when confirm=true and the draft is complete, and reflects real success", async () => {
    const context = baseContext();
    context.composeDraft = { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "3pm" };
    const result = await executeTool("sendEmail", { confirm: true }, provider, context);
    expect(result.uiActions.some((a) => a.type === "EMAIL_SENT")).toBe(true);

    const sent = await provider.listEmails({ folder: "sent" });
    expect(sent.some((e) => e.subject === "Meeting Tomorrow")).toBe(true);
  });
});

describe("executeTool: replyToEmail context awareness", () => {
  it("uses the currently selected email from context when no emailId is given", async () => {
    const provider = new MockMailService();
    const context = baseContext();
    context.selectedEmailId = "m1"; // David Chen's kickoff email in the fixture

    const result = await executeTool("replyToEmail", { body: "Sounds good." }, provider, context);
    const setDraft = result.uiActions.find((a) => a.type === "SET_COMPOSE_DRAFT");
    expect(setDraft).toBeDefined();
    if (setDraft?.type === "SET_COMPOSE_DRAFT") {
      expect(setDraft.draft.to).toEqual(["david.chen@example.com"]);
      expect(setDraft.draft.subject).toMatch(/^Re:/);
      expect(setDraft.draft.body).toBe("Sounds good.");
    }
  });

  it("asks for clarification when nothing is open and no emailId given", async () => {
    const provider = new MockMailService();
    const result = await executeTool("replyToEmail", { body: "hi" }, provider, baseContext());
    expect(result.resultForModel).toMatch(/no email is currently open/i);
    expect(result.uiActions.length).toBe(0);
  });
});

describe("executeTool: unknown tool", () => {
  it("fails gracefully instead of throwing", async () => {
    const provider = new MockMailService();
    const result = await executeTool("notARealTool", {}, provider, baseContext());
    expect(result.resultForModel).toMatch(/unknown tool/i);
  });
});

describe("executeTool: invalid input handling", () => {
  it("catches schema validation errors instead of crashing the process", async () => {
    const provider = new MockMailService();
    const result = await executeTool("navigateTo", { view: "not-a-view" }, provider, baseContext());
    expect(result.resultForModel).toMatch(/failed/i);
    expect(result.uiActions.some((a) => a.type === "TOAST" && a.variant === "error")).toBe(true);
  });
});
