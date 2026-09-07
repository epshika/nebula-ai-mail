import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { MailProvider } from "../types/mail.js";
import type {
  AppContext,
  AssistantResponsePayload,
  ChatTurn,
  UIAction,
} from "../types/ai.js";
import { toolDefinitions } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(context: AppContext): string {
  return `You are the AI assistant embedded in Nebula AI Mail, a webmail client.

You do not just chat - you control the application by calling tools. Every tool call produces a real, visible change in the user's UI such as opening views, filling the compose form, updating the inbox list, sending mail, or marking an email as read.

Rules:
- Prefer calling a tool over describing what you would do. If the user's request maps to an action, call the appropriate tool.
- Never claim an email was sent unless the sendEmail tool result confirms success.
- For sendEmail, only use confirm=true if the user has explicitly told you to send it in this message or a previous message in this conversation.
- If the user only asks you to compose or draft an email, call composeEmail and do not send it automatically.
- Resolve pronouns like "this" or "it" using CURRENT CONTEXT whenever the context makes the meaning unambiguous.
- Keep replies short and conversational.
- Do not dump raw JSON or tool internals to the user.
- If a tool result indicates failure, say so honestly and never claim success.
- For search requests, use searchEmails.
- For requests to open an email, use openEmail.
- For requests to go to Inbox, Sent, or Compose, use navigateTo.
- For requests to write a new email, use composeEmail.
- For requests to modify an existing draft, use updateComposeDraft.
- For requests to reply to the currently open email, use replyToEmail.
- For requests to mark an email read or unread, use markAsRead.
- For requests to refresh mail, use refreshInbox.

CURRENT CONTEXT:
- Current view: ${context.currentView}
- Selected email id: ${context.selectedEmailId ?? "none"}
- Active filter: ${
    context.currentFilter
      ? JSON.stringify(context.currentFilter)
      : "none"
  }
- Compose draft: ${
    context.composeDraft
      ? JSON.stringify(context.composeDraft)
      : "none"
  }`;
}

function mapHistory(history: ChatTurn[]): Content[] {
  return history.map((turn): Content => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

export async function runAssistantTurn(
  userMessage: string,
  history: ChatTurn[],
  context: AppContext,
  mailProvider: MailProvider
): Promise<AssistantResponsePayload> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      reply:
        "The AI assistant isn't configured yet (missing GEMINI_API_KEY on the server). You can still use the app manually - Inbox, Sent, and Compose all work without AI.",
      toolsUsed: [],
      uiActions: [],
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  const contents: Content[] = [
    ...mapHistory(history),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  const allUiActions: UIAction[] = [];

  const toolsUsed: {
    name: string;
    status: "success" | "error";
  }[] = [];

  let finalText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(context),
          tools: [
            {
              functionDeclarations: toolDefinitions,
            },
          ],
        },
      });

      const responseText = response.text?.trim();

      if (responseText) {
        finalText = responseText;
      }

      const functionCalls = response.functionCalls ?? [];

      if (functionCalls.length === 0) {
        break;
      }

      /*
       * IMPORTANT:
       * Keep the complete model response in the conversation.
       * Gemini requires the model's function-call content to be
       * followed by our function-response content.
       */
      const modelContent = response.candidates?.[0]?.content;

      if (modelContent) {
        contents.push(modelContent);
      }

      const functionResponseParts: Part[] = [];

      for (const call of functionCalls) {
        const toolName = call.name;

        if (!toolName) {
          continue;
        }

        const toolInput = (call.args ?? {}) as Record<string, unknown>;

        const result = await executeTool(
          toolName,
          toolInput,
          mailProvider,
          context
        );

        allUiActions.push(...result.uiActions);

        const failed = result.resultForModel
          .toLowerCase()
          .includes("failed");

        toolsUsed.push({
          name: toolName,
          status: failed ? "error" : "success",
        });

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: toolName,
            response: {
              result: result.resultForModel,
            },
          },
        });

        /*
         * Keep context synchronized across multiple tool calls.
         *
         * Example:
         * composeEmail -> updateComposeDraft -> sendEmail
         */
        if (
          toolName === "composeEmail" ||
          toolName === "updateComposeDraft"
        ) {
          context.composeDraft = {
            ...context.composeDraft,
            ...toolInput,
          };
        }

        if (toolName === "openEmail") {
          const setSelected = result.uiActions.find(
            (action) => action.type === "SET_SELECTED_EMAIL"
          );

          if (
            setSelected &&
            setSelected.type === "SET_SELECTED_EMAIL"
          ) {
            context.selectedEmailId = setSelected.emailId;
          }
        }
      }

      if (functionResponseParts.length > 0) {
        contents.push({
          role: "user",
          parts: functionResponseParts,
        });
      }
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown AI service error";

    console.error("[Gemini AI error]", err);

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