import type { MailProvider } from "../types/mail.js";
import type { AppContext, ToolExecutionResult, UIAction } from "../types/ai.js";
import {
  composeEmailSchema,
  filterInboxSchema,
  markAsReadSchema,
  navigateToSchema,
  openEmailSchema,
  replyToEmailSchema,
  searchEmailsSchema,
  sendEmailSchema,
  updateComposeDraftSchema,
} from "./definitions.js";

/**
 * The single place that turns "the model decided to call tool X with args Y"
 * into (a) a real mail-provider side effect where relevant and (b) a list of
 * UIAction objects the frontend will apply to its state. Nothing here does
 * string/regex intent matching - the LLM already decided the tool and args;
 * this layer only validates input and executes it.
 */
export async function executeTool(
  toolName: string,
  rawInput: unknown,
  provider: MailProvider,
  context: AppContext
): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case "searchEmails": {
        const input = searchEmailsSchema.parse(rawInput ?? {});
        const emails = await provider.listEmails(input);
        const uiActions: UIAction[] = [
          { type: "SET_FILTER", filter: input },
          { type: "SET_EMAIL_LIST", folder: input.folder ?? "inbox", emails },
          { type: "SET_VIEW", view: input.folder === "sent" ? "sent" : "inbox" },
        ];
        return {
          toolName,
          resultForModel: `Found ${emails.length} email(s) matching the filter. Top results: ${emails
            .slice(0, 5)
            .map((e) => `"${e.subject}" from ${e.from}`)
            .join("; ") || "none"}.`,
          uiActions,
        };
      }

      case "filterInbox": {
        const input = filterInboxSchema.parse(rawInput ?? {});
        const emails = await provider.listEmails(input);
        return {
          toolName,
          resultForModel: `Filtered inbox to ${emails.length} email(s).`,
          uiActions: [
            { type: "SET_FILTER", filter: input },
            { type: "SET_EMAIL_LIST", folder: input.folder ?? "inbox", emails },
            { type: "SET_VIEW", view: "inbox" },
          ],
        };
      }

      case "openEmail": {
        const input = openEmailSchema.parse(rawInput ?? {});
        let emailId = input.emailId;

        if (!emailId) {
          const candidates = await provider.listEmails({
            from: input.matchFrom,
            query: input.matchSubject,
            folder: "inbox",
            limit: 10,
          });
          if (!candidates.length) {
            return {
              toolName,
              resultForModel: `No email found matching sender="${input.matchFrom ?? ""}" subject="${
                input.matchSubject ?? ""
              }".`,
              uiActions: [
                { type: "TOAST", message: "No matching email found.", variant: "info" },
              ],
            };
          }
          emailId = candidates[0].id;
        }

        const email = await provider.getEmail(emailId);
        if (!email) {
          return {
            toolName,
            resultForModel: `Email id ${emailId} could not be found.`,
            uiActions: [{ type: "TOAST", message: "That email could not be found.", variant: "error" }],
          };
        }

        await provider.markAsRead(email.id, true);

        return {
          toolName,
          resultForModel: `Opened email "${email.subject}" from ${email.from}, dated ${email.date}.`,
          uiActions: [
            { type: "SET_SELECTED_EMAIL", emailId: email.id },
            { type: "SET_VIEW", view: "email" },
            { type: "MARK_READ", emailId: email.id, isRead: true },
          ],
        };
      }

      case "composeEmail": {
        const input = composeEmailSchema.parse(rawInput ?? {});
        const populated = Object.entries(input)
          .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
          .map(([k]) => k);
        return {
          toolName,
          resultForModel: `Compose view opened and pre-filled: ${JSON.stringify(input)}.`,
          uiActions: [
            { type: "SET_VIEW", view: "compose" },
            { type: "SET_COMPOSE_DRAFT", draft: input, aiPopulatedFields: populated },
          ],
        };
      }

      case "updateComposeDraft": {
        const input = updateComposeDraftSchema.parse(rawInput ?? {});
        const populated = Object.entries(input)
          .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
          .map(([k]) => k);
        return {
          toolName,
          resultForModel: `Compose draft updated: ${JSON.stringify(input)}.`,
          uiActions: [{ type: "PATCH_COMPOSE_DRAFT", draft: input, aiPopulatedFields: populated }],
        };
      }

      case "sendEmail": {
        const input = sendEmailSchema.parse(rawInput ?? {});
        const draft = context.composeDraft;

        if (!draft?.to?.length || !draft?.subject) {
          return {
            toolName,
            resultForModel:
              "Cannot send: the compose draft is missing a recipient or subject. Ask the user for the missing field(s).",
            uiActions: [],
          };
        }
        if (!input.confirm) {
          return {
            toolName,
            resultForModel:
              "Send requires explicit user confirmation. Ask the user to confirm before calling sendEmail again with confirm=true.",
            uiActions: [{ type: "REQUEST_SEND_CONFIRMATION", draft }],
          };
        }

        const result = await provider.sendEmail({
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject ?? "",
          body: draft.body ?? "",
        });

        if (!result.success) {
          return {
            toolName,
            resultForModel: `Send FAILED: ${result.error}. Do not tell the user it was sent.`,
            uiActions: [
              { type: "SEND_FAILED", error: result.error ?? "Unknown error" },
              { type: "TOAST", message: `Failed to send: ${result.error}`, variant: "error" },
            ],
          };
        }

        return {
          toolName,
          resultForModel: `Email sent successfully. Message id: ${result.messageId}.`,
          uiActions: [
            { type: "EMAIL_SENT", messageId: result.messageId ?? "" },
            { type: "TOAST", message: "Email sent.", variant: "success" },
            { type: "SET_VIEW", view: "sent" },
          ],
        };
      }

      case "replyToEmail": {
        const input = replyToEmailSchema.parse(rawInput ?? {});
        const emailId = input.emailId ?? context.selectedEmailId ?? undefined;
        if (!emailId) {
          return {
            toolName,
            resultForModel:
              "No email is currently open and no emailId was given, so I don't know what to reply to. Ask the user which email.",
            uiActions: [],
          };
        }
        const original = await provider.getEmail(emailId);
        if (!original) {
          return {
            toolName,
            resultForModel: `Could not find the original email (id ${emailId}) to reply to.`,
            uiActions: [],
          };
        }

        const draft = {
          to: [original.fromEmail],
          subject: original.subject.toLowerCase().startsWith("re:")
            ? original.subject
            : `Re: ${original.subject}`,
          body: input.body,
        };

        return {
          toolName,
          resultForModel: `Reply drafted to ${original.fromEmail} re: "${draft.subject}".`,
          uiActions: [
            { type: "SET_VIEW", view: "compose" },
            { type: "SET_COMPOSE_DRAFT", draft, aiPopulatedFields: ["to", "subject", "body"] },
          ],
        };
      }

      case "navigateTo": {
        const input = navigateToSchema.parse(rawInput ?? {});
        return {
          toolName,
          resultForModel: `Navigated to ${input.view}.`,
          uiActions: [{ type: "SET_VIEW", view: input.view }],
        };
      }

      case "markAsRead": {
        const input = markAsReadSchema.parse(rawInput ?? {});
        await provider.markAsRead(input.emailId, input.isRead);
        return {
          toolName,
          resultForModel: `Marked email ${input.emailId} as ${input.isRead ? "read" : "unread"}.`,
          uiActions: [{ type: "MARK_READ", emailId: input.emailId, isRead: input.isRead }],
        };
      }

      case "refreshInbox": {
        const emails = await provider.listEmails({ folder: "inbox", limit: 50 });
        return {
          toolName,
          resultForModel: `Inbox refreshed, ${emails.length} email(s) loaded.`,
          uiActions: [{ type: "SET_EMAIL_LIST", folder: "inbox", emails }],
        };
      }

      default:
        return {
          toolName,
          resultForModel: `Unknown tool "${toolName}".`,
          uiActions: [],
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown tool execution error";
    return {
      toolName,
      resultForModel: `Tool "${toolName}" failed: ${message}`,
      uiActions: [{ type: "TOAST", message: `Action failed: ${message}`, variant: "error" }],
    };
  }
}
