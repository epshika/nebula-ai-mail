import Anthropic from "@anthropic-ai/sdk";
import type { MailProvider } from "../types/mail.js";
import type { AppContext, AssistantResponsePayload, ChatTurn, UIAction } from "../types/ai.js";
import { toolDefinitions } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(context: AppContext): string {
  return `You are the AI assistant embedded in Nebula AI Mail, a webmail client. You do not just chat - you control the application by calling tools. Every tool call produces a real, visible change in the user's UI (opening views, filling the compose form, updating the inbox list, sending mail).

Rules:
- Prefer calling a tool over describing what you would do. If the user's request maps to an action, call the tool.
- Never claim an email was sent unless the sendEmail tool result confirms success.
- For sendEmail, only pass confirm=true if the user has explicitly told you to send it in this message or a previous one in this conversation. If they only asked you to compose/draft it, call composeEmail and then ask if they'd like you to send it - do not send automatically.
- Resolve pronouns like "this" or "it" using CURRENT CONTEXT below (e.g. the currently open email) rather than asking the user to repeat themselves, whenever context makes it unambiguous.
- Keep replies short and conversational - a sentence or two confirming what you did. Do not dump raw JSON or tool internals to the user.
- If a tool result indicates failure, say so honestly; never claim success.

CURRENT CONTEXT:
- Current view: ${context.currentView}
- Selected email id: ${context.selectedEmailId ?? "none"}
- Active filter: ${context.currentFilter ? JSON.stringify(context.currentFilter) : "none"}
- Compose draft: ${context.composeDraft ? JSON.stringify(context.composeDraft) : "none"}`;
}

export async function runAssistantTurn(
  userMessage: string,
  history: ChatTurn[],
  context: AppContext,
  mailProvider: MailProvider
): Promise<AssistantResponsePayload> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      reply:
        "The AI assistant isn't configured yet (missing ANTHROPIC_API_KEY on the server). You can still use the app manually - Inbox, Sent, and Compose all work without AI.",
      toolsUsed: [],
      uiActions: [],
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
    { role: "user", content: userMessage },
  ];

  const allUiActions: UIAction[] = [];
  const toolsUsed: { name: string; status: "success" | "error" }[] = [];
  let finalText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(context),
        tools: toolDefinitions,
        messages,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      finalText = textBlocks.map((b) => b.text).join("\n").trim() || finalText;

      if (toolUseBlocks.length === 0) {
        break; // model is done, no more tools to run
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeTool(block.name, block.input, mailProvider, context);
        allUiActions.push(...result.uiActions);
        toolsUsed.push({
          name: block.name,
          status: result.resultForModel.toLowerCase().includes("failed") ? "error" : "success",
        });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.resultForModel,
        });

        // Keep context roughly in sync across a multi-tool-call round so a
        // later tool call in the SAME round (e.g. composeEmail then sendEmail)
        // sees the effect of the earlier one.
        if (block.name === "composeEmail" || block.name === "updateComposeDraft") {
          context.composeDraft = { ...context.composeDraft, ...(block.input as object) };
        }
        if (block.name === "openEmail") {
          const setSelected = result.uiActions.find((a) => a.type === "SET_SELECTED_EMAIL");
          if (setSelected && setSelected.type === "SET_SELECTED_EMAIL") {
            context.selectedEmailId = setSelected.emailId;
          }
        }
      }

      messages.push({ role: "user", content: toolResultBlocks });

      if (response.stop_reason !== "tool_use") break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI service error";
    return {
      reply: `I ran into an error talking to the AI service (${message}). You can still use the app manually.`,
      toolsUsed,
      uiActions: allUiActions,
    };
  }

  return {
    reply: finalText || "Done.",
    toolsUsed,
    uiActions: allUiActions,
  };
}
