import { useEffect, useState } from "react";
import { fillMessage, MESSAGE_TEMPLATES, REVIEW_LINK_KEY, templateText, type MessageKey, type MessageSettings, type MessageVars } from "../../../shared/messages";
import { BottomSheet, useIsPhone } from "../../components/mobile/kit";
import { Modal } from "../../components/ui";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { api } from "../../lib/api";

// Saved wording is loaded once per page view and shared by every menu on the page.
let cache: Promise<MessageSettings> | null = null;
const loadTemplates = () => (cache ??= api<{ templates: MessageSettings }>("/api/admin/message-templates").then((r) => r.templates).catch(() => ({})));
/** Call after saving templates so menus use the new wording. */
export const resetTemplateCache = () => void (cache = null);

/**
 * WhatsApp button that offers ready messages for this stage (filled with the customer's details), plus a blank
 * chat. Opens WhatsApp with the chosen text; staff can still edit it there before sending.
 */
export function WhatsAppMenu({ phone, vars, keys, className, label = "WhatsApp", testId }: { phone: string; vars: MessageVars; keys: MessageKey[]; className: string; label?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<MessageSettings | null>(null);
  const isPhone = useIsPhone();
  useEffect(() => {
    if (open && !saved) void loadTemplates().then(setSaved);
  }, [open, saved]);
  const digits = phone.replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  const all: MessageVars = { ...vars, reviewLink: saved?.[REVIEW_LINK_KEY] ?? "" };
  const go = (text: string) => {
    window.open(`https://wa.me/${to}${text ? `?text=${encodeURIComponent(text)}` : ""}`, "_blank", "noopener");
    setOpen(false);
  };
  const list = (
    <ul className="grid gap-2" data-testid="wa-templates">
      {MESSAGE_TEMPLATES.filter((t) => keys.includes(t.key)).map((t) => {
        const text = saved ? fillMessage(templateText(t.key, saved), all) : "";
        return (
          <li key={t.key}>
            <button type="button" className="w-full rounded-2xl border border-line p-3 text-left hover:border-verdi-300 hover:bg-paper max-lg:min-h-11" disabled={!saved} onClick={() => go(text)} data-testid={`wa-${t.key}`}>
              <span className="block text-sm font-semibold">{t.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{saved ? text : "Loading…"}</span>
            </button>
          </li>
        );
      })}
      <li>
        <button type="button" className="w-full rounded-2xl border border-dashed border-line p-3 text-left text-sm hover:bg-paper max-lg:min-h-11" onClick={() => go("")} data-testid="wa-blank">
          Blank message
        </button>
      </li>
    </ul>
  );
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid={testId}>
        <WhatsAppIcon className="size-4 shrink-0" /> {label}
      </button>
      {isPhone ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Send on WhatsApp" testId="wa-sheet">
          <p className="mb-2 text-xs text-muted">Pick a message. WhatsApp opens with it ready; you can still edit it before sending.</p>
          {list}
        </BottomSheet>
      ) : (
        <Modal open={open} onClose={() => setOpen(false)} title="Send on WhatsApp" description="Pick a message. WhatsApp opens with it ready; you can still edit it before sending.">
          <div className="p-5 pt-0">{list}</div>
        </Modal>
      )}
    </>
  );
}
