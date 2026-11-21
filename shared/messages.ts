import { z } from "zod";

/**
 * One-tap WhatsApp messages for staff. Owner/admin can change the wording in Settings; an empty value
 * means the default below. Placeholders in {curly braces} are filled from the enquiry or quotation.
 */
export const MESSAGE_TEMPLATES = [
  {
    key: "waFirstContact",
    label: "First contact",
    use: "New enquiries",
    text: "Hello {name}, this is {staff} from VERDI SOLARR SOLUTION about your enquiry {reference}. When is a good time to talk?",
  },
  {
    key: "waFollowUp",
    label: "Follow-up",
    use: "Any open enquiry",
    text: "Hello {name}, following up on your enquiry {reference} with VERDI SOLARR SOLUTION. Do you have any questions? We are happy to help.",
  },
  {
    key: "waQuoteReminder",
    label: "Quotation reminder",
    use: "Quoted enquiries and sent quotations",
    text: "Hello {name}, a gentle reminder about our quotation {quote} for {amount}, valid until {validUntil}. Shall we go ahead?",
  },
  {
    key: "waThanks",
    label: "Thank you for the order",
    use: "Won enquiries",
    text: "Hello {name}, thank you for your order {reference} with VERDI SOLARR SOLUTION. We will keep you updated.",
  },
  {
    key: "waReview",
    label: "Ask for a review",
    use: "Won enquiries",
    text: "Hello {name}, we hope you are happy with your purchase. Could you spare a minute to review VERDI SOLARR SOLUTION? {reviewLink}",
  },
] as const;

export type MessageKey = (typeof MESSAGE_TEMPLATES)[number]["key"];
export const MESSAGE_KEYS = MESSAGE_TEMPLATES.map((t) => t.key) as MessageKey[];
/** Link used for {reviewLink} (e.g. the Google review link). */
export const REVIEW_LINK_KEY = "waReviewLink";
export const PLACEHOLDERS = ["name", "reference", "staff", "quote", "amount", "validUntil", "reviewLink"] as const;
export type MessageVars = Partial<Record<(typeof PLACEHOLDERS)[number], string | null>>;

/** Saved wording (only what differs from the defaults) and the review link. */
export type MessageSettings = Partial<Record<MessageKey | typeof REVIEW_LINK_KEY, string>>;

export const MessageSettingsSchema = z
  .object({
    templates: z.record(z.string(), z.string().max(1000, "Keep each message under 1,000 characters")),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [k, val] of Object.entries(v.templates)) {
      if (k !== REVIEW_LINK_KEY && !(MESSAGE_KEYS as string[]).includes(k)) ctx.addIssue({ code: "custom", path: [k], message: `Unknown message: ${k}` });
      if (k === REVIEW_LINK_KEY && val.trim() && !/^https:\/\/\S+$/.test(val.trim())) ctx.addIssue({ code: "custom", path: [k], message: "Enter a full https:// link" });
      const unknown = [...val.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
      if (unknown.length) ctx.addIssue({ code: "custom", path: [k], message: `Unknown placeholder {${unknown[0]}}. Use: ${PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}` });
    }
  });

/** The wording to use for a template (saved text, else the default). */
export function templateText(key: MessageKey, saved: MessageSettings): string {
  return saved[key]?.trim() || MESSAGE_TEMPLATES.find((t) => t.key === key)!.text;
}

/** Fill {placeholders}; a missing value leaves nothing behind (no stray braces or double spaces). */
export function fillMessage(text: string, vars: MessageVars): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => (vars as Record<string, string | null | undefined>)[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.?!])/g, "$1")
    .trim();
}
