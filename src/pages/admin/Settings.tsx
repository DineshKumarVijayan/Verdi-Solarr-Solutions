import { RotateCcw, Save } from "lucide-react";
import { fillMessage, MESSAGE_TEMPLATES, MessageSettingsSchema, PLACEHOLDERS, REVIEW_LINK_KEY, type MessageSettings } from "../../../shared/messages";
import { resetTemplateCache } from "./WhatsAppMenu";
import { useEffect, useState } from "react";
import { SITE_SETTING_KEYS, type SiteSettingKey } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { SITE } from "../../site";
import { useAdmin } from "./AdminLayout";
import { canManage, errorText, fieldErrors, PageHead, ReadOnlyNote, send } from "./kit";

const FIELDS: { k: SiteSettingKey; label: string; hint?: string; area?: boolean; placeholder?: string }[] = [
  { k: "announcement", label: "Announcement bar", hint: "Scrolling ribbon at the top of every page. Separate several messages with | . Leave empty to hide it.", placeholder: "e.g. New stock of TOPCon modules has arrived" },
  { k: "announcementLink", label: "Announcement link", hint: "Optional. A page on this site (e.g. /products) or a full https:// link." },
  { k: "phone", label: "Phone number (for calls)", placeholder: "+91 89392 77997" },
  { k: "whatsapp", label: "WhatsApp number", hint: "Enquiries are sent to this number. Leave empty to use the phone number.", placeholder: "+91 89392 77997" },
  { k: "email", label: "Email", placeholder: SITE.email },
  { k: "address", label: "Address (one line per row)", area: true, placeholder: SITE.address.join("\n") },
  { k: "businessHours", label: "Business hours", placeholder: "e.g. Mon–Sat, 9:30 am – 7 pm" },
  { k: "instagramUrl", label: "Instagram", placeholder: "https://www.instagram.com/…" },
  { k: "facebookUrl", label: "Facebook", placeholder: "https://www.facebook.com/…" },
  { k: "youtubeUrl", label: "YouTube", placeholder: "https://www.youtube.com/@…" },
  { k: "linkedinUrl", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/…" },
];

export default function Settings() {
  const admin = useAdmin();
  const editable = canManage(admin);
  const toast = useToast();
  const { reload } = useCatalogue();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: Record<string, string> }>("/api/admin/settings").then((r) => {
      setValues(r.settings);
      setSaved(r.settings);
    });
  }, []);

  const save = async () => {
    if (!values) return;
    setBusy(true);
    setErrs({});
    try {
      const changed = Object.fromEntries(SITE_SETTING_KEYS.filter((k) => (values[k] ?? "") !== (saved[k] ?? "")).map((k) => [k, values[k] ?? ""]));
      const r = await send<{ settings: Record<string, string> }>("/api/admin/settings", "PUT", { settings: changed });
      setValues(r.settings);
      setSaved(r.settings);
      reload();
      toast("Settings saved. Live on the website.", "success");
    } catch (e) {
      setErrs(fieldErrors(e));
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!values)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  const dirty = SITE_SETTING_KEYS.some((k) => (values[k] ?? "") !== (saved[k] ?? ""));

  return (
    <div className="container-x py-10">
      <PageHead
        title="Site settings"
        intro="Contact details, social links and the announcement bar. Empty fields use the built-in default (shown faintly)."
        actions={
          editable && (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setValues(saved)} disabled={busy || !dirty} data-testid="cancel-settings">
                Cancel
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy || !dirty} data-testid="save-settings">
                {busy ? <Spinner className="size-4" /> : <Save className="size-4" />} Save settings
              </button>
            </div>
          )
        }
      />
      <ReadOnlyNote admin={admin} />
      <div className="card mt-6 grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.k} className={f.area || f.k === "announcement" ? "sm:col-span-2" : ""}>
            <label htmlFor={`st-${f.k}`} className="label">
              {f.label}
            </label>
            {f.area ? (
              <textarea id={`st-${f.k}`} rows={4} className={`field ${errs[f.k] ? "!border-danger" : ""}`} value={values[f.k] ?? ""} placeholder={f.placeholder} disabled={!editable} onChange={(e) => setValues({ ...values, [f.k]: e.target.value })} />
            ) : (
              <input id={`st-${f.k}`} className={`field ${errs[f.k] ? "!border-danger" : ""}`} value={values[f.k] ?? ""} placeholder={f.placeholder} disabled={!editable} onChange={(e) => setValues({ ...values, [f.k]: e.target.value })} />
            )}
            {errs[f.k] ? <p className="mt-1 text-xs text-danger">{errs[f.k]}</p> : f.hint && <p className="mt-1 text-xs text-subtle">{f.hint}</p>}
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-xs text-subtle">Search engines read the business name, phone and address from the built-in defaults at build time. If you change them here, also update src/site.ts at the next release so the structured data matches.</p>
      <MessageTemplates editable={editable} />
    </div>
  );
}

const SAMPLE = { name: "Ravi", reference: "VS-261121-AB12C", staff: "Priya", quote: "VSQ-2611-0007", amount: "₹1,25,000.00", validUntil: "6 Dec 2026", reviewLink: "" };

/** The one-tap WhatsApp messages staff send from enquiries and quotations. */
function MessageTemplates({ editable }: { editable: boolean }) {
  const toast = useToast();
  const [saved, setSaved] = useState<MessageSettings | null>(null);
  const [draft, setDraft] = useState<MessageSettings>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ templates: MessageSettings }>("/api/admin/message-templates")
      .then((r) => (setSaved(r.templates), setDraft(r.templates)))
      .catch(() => setSaved({}));
  }, []);
  if (!saved) return null;
  const keys = [...MESSAGE_TEMPLATES.map((t) => t.key), REVIEW_LINK_KEY] as const;
  const dirty = keys.some((k) => (draft[k] ?? "") !== (saved[k] ?? ""));
  const setK = (k: (typeof keys)[number], v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    const body = { templates: Object.fromEntries(keys.map((k) => [k, draft[k] ?? ""])) };
    const check = MessageSettingsSchema.safeParse(body);
    if (!check.success) {
      const e: Record<string, string> = {};
      for (const i of check.error.issues) e[String(i.path.at(-1))] ??= i.message;
      return setErrs(e);
    }
    setErrs({});
    setBusy(true);
    try {
      const r = await send<{ templates: MessageSettings }>("/api/admin/message-templates", "PUT", body);
      setSaved(r.templates);
      setDraft(r.templates);
      resetTemplateCache();
      toast("WhatsApp messages saved.", "success");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card mt-8 p-5" aria-labelledby="wa-h" data-testid="message-templates">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="wa-h" className="text-lg font-semibold">
            WhatsApp messages
          </h2>
          <p className="mt-1 text-sm text-muted">
            Ready messages staff send in one tap from an enquiry or quotation. Words in braces are filled in automatically: {PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}. Leave a box empty to use the default.
          </p>
        </div>
        {editable && (
          <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={busy || !dirty} data-testid="save-messages">
            <Save className="size-4" /> Save messages
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {MESSAGE_TEMPLATES.map((t) => {
          const text = (draft[t.key] ?? "").trim() || t.text;
          return (
            <div key={t.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`m-${t.key}`} className="label !mb-0">
                  {t.label} <span className="font-normal text-muted">· {t.use}</span>
                </label>
                {editable && draft[t.key] && (
                  <button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs text-verdi-700 hover:underline" onClick={() => setK(t.key, "")}>
                    <RotateCcw className="size-3.5" /> Default
                  </button>
                )}
              </div>
              <textarea id={`m-${t.key}`} rows={3} className={`field mt-1 ${errs[t.key] ? "!border-danger" : ""}`} placeholder={t.text} value={draft[t.key] ?? ""} disabled={!editable} onChange={(x) => setK(t.key, x.target.value)} data-testid={`m-${t.key}`} />
              {errs[t.key] ? <p className="mt-1 text-xs text-danger">{errs[t.key]}</p> : <p className="mt-1 text-xs text-subtle">Example: {fillMessage(text, { ...SAMPLE, reviewLink: draft[REVIEW_LINK_KEY] ?? "" })}</p>}
            </div>
          );
        })}
        <div>
          <label htmlFor="m-review" className="label">
            Review link <span className="font-normal text-muted">· used for {"{reviewLink}"}</span>
          </label>
          <input id="m-review" className={`field ${errs[REVIEW_LINK_KEY] ? "!border-danger" : ""}`} placeholder="https://g.page/r/…/review" value={draft[REVIEW_LINK_KEY] ?? ""} disabled={!editable} onChange={(x) => setK(REVIEW_LINK_KEY, x.target.value)} data-testid="m-review" />
          {errs[REVIEW_LINK_KEY] ? <p className="mt-1 text-xs text-danger">{errs[REVIEW_LINK_KEY]}</p> : <p className="mt-1 text-xs text-subtle">Your Google Business review link. Leave empty to send the review message without a link.</p>}
        </div>
      </div>
    </section>
  );
}
