import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bestFaq } from "../../../shared/assistant";
import type { AdminFaq, PublicFaq } from "../../../shared/types";
import { useConfirm } from "../../components/confirm";
import { Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { errorText, fieldErrors, send } from "./kit";

type Draft = Omit<AdminFaq, "id"> & { id: number | null };
const BLANK: Draft = { id: null, topic: "General", question: "", answer: "", questionTa: "", answerTa: "", keywords: "", sortOrder: 0, isActive: true };

/** A few common questions the owner may want to answer (questions only: the answers are the business's own words). */
const IDEAS = ["Do you deliver to my area? What are the charges?", "Which payment methods do you accept?", "Do you give a GST invoice?", "How do warranty claims work?", "How long is a quotation valid?", "How do loyalty points work?"];

const toPublic = (f: AdminFaq): PublicFaq => ({ id: f.id, topic: f.topic, q: f.question, a: f.answer, qTa: f.questionTa || null, aTa: f.answerTa || null, k: f.keywords });

/** Admin → Settings → Questions & answers: shown on /faq and used by the website helper. */
export function FaqManager({ editable }: { editable: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { reload } = useCatalogue();
  const [faqs, setFaqs] = useState<AdminFaq[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tryQ, setTryQ] = useState("");

  useEffect(() => {
    api<{ faqs: AdminFaq[] }>("/api/admin/faqs")
      .then((r) => setFaqs(r.faqs))
      .catch(() => setFaqs([]));
  }, []);

  const done = (list: AdminFaq[], msg: string) => {
    setFaqs(list);
    reload();
    if (msg) toast(msg, "success");
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setErrs({});
    try {
      const { id, ...body } = draft;
      const r = await send<{ faqs: AdminFaq[] }>(id ? `/api/admin/faqs/${id}` : "/api/admin/faqs", id ? "PUT" : "POST", body);
      setDraft(null);
      done(r.faqs, "Saved. Live on the FAQ page and in the website helper.");
    } catch (e) {
      setErrs(fieldErrors(e));
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const update = async (f: AdminFaq, patch: Partial<AdminFaq>, msg: string) => {
    try {
      const { id, ...rest } = { ...f, ...patch };
      done((await send<{ faqs: AdminFaq[] }>(`/api/admin/faqs/${id}`, "PUT", rest)).faqs, msg);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const move = async (i: number, dir: -1 | 1) => {
    if (!faqs) return;
    const a = faqs[i];
    const b = faqs[i + dir];
    if (!a || !b) return;
    // give both a distinct place, then swap
    const sa = a.sortOrder || (i + 1) * 10;
    const sb = b.sortOrder || (i + dir + 1) * 10;
    await update(a, { sortOrder: sb === sa ? sa + dir : sb }, "");
    await update({ ...b }, { sortOrder: sa }, "Order changed.");
  };
  const remove = async (f: AdminFaq) => {
    if (!(await confirm({ title: "Delete this question?", message: `“${f.question}” will be removed from the FAQ page and the helper.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      done((await send<{ faqs: AdminFaq[] }>(`/api/admin/faqs/${f.id}`, "DELETE")).faqs, "Question deleted.");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const topics = useMemo(() => [...new Set((faqs ?? []).map((f) => f.topic))], [faqs]);
  const tried = useMemo(() => {
    if (!tryQ.trim() || !faqs) return null;
    const hit = bestFaq(faqs.filter((f) => f.isActive).map(toPublic), tryQ, /[஀-௿]/.test(tryQ) ? "ta" : "en");
    return hit && hit.score >= 0.4 ? faqs.find((f) => f.id === hit.faq.id) ?? null : null;
  }, [tryQ, faqs]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const err = (k: string) => errs[k] && <p className="mt-1 text-xs text-danger">{errs[k]}</p>;

  return (
    <section id="faqs" className="card mt-8 scroll-mt-24 p-5" aria-labelledby="faq-h" data-testid="faq-manager">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="faq-h" className="text-lg font-semibold">
            Questions &amp; answers
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Shown on the public FAQ page and used by the website helper to answer visitors. Write answers in your own words; a Tamil version is optional.</p>
        </div>
        {editable && !draft && (
          <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => (setErrs({}), setDraft({ ...BLANK }))} data-testid="faq-add">
            <Plus className="size-4" /> Add question
          </button>
        )}
      </div>

      {draft && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-verdi-200 bg-verdi-50/40 p-4 sm:grid-cols-2" data-testid="faq-editor">
          <div>
            <label className="label" htmlFor="faq-topic">Topic</label>
            <input id="faq-topic" list="faq-topics" className="field" value={draft.topic} onChange={(e) => set("topic", e.target.value)} placeholder="e.g. Delivery" />
            <datalist id="faq-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
            {err("topic")}
          </div>
          <div>
            <label className="label" htmlFor="faq-keywords">Other words people may use <span className="font-normal text-muted">(optional, comma separated)</span></label>
            <input id="faq-keywords" className="field" value={draft.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="e.g. shipping, transport, courier" />
            {err("keywords")}
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="faq-q">Question</label>
            <input id="faq-q" className="field" value={draft.question} onChange={(e) => set("question", e.target.value)} list="faq-ideas" data-testid="faq-question" />
            <datalist id="faq-ideas">{IDEAS.map((t) => <option key={t} value={t} />)}</datalist>
            {err("question")}
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="faq-a">Answer</label>
            <textarea id="faq-a" rows={4} className="field" value={draft.answer} onChange={(e) => set("answer", e.target.value)} data-testid="faq-answer" />
            {err("answer")}
          </div>
          <details className="sm:col-span-2" open={!!(draft.questionTa || draft.answerTa)}>
            <summary className="tap inline-flex cursor-pointer items-center text-sm font-medium text-verdi-700">Tamil version (optional)</summary>
            <div className="mt-2 grid gap-3">
              <div>
                <label className="label" htmlFor="faq-qta">கேள்வி (Tamil question)</label>
                <input id="faq-qta" className="field" value={draft.questionTa} onChange={(e) => set("questionTa", e.target.value)} data-testid="faq-question-ta" />
                {err("questionTa")}
              </div>
              <div>
                <label className="label" htmlFor="faq-ata">பதில் (Tamil answer)</label>
                <textarea id="faq-ata" rows={4} className="field" value={draft.answerTa} onChange={(e) => set("answerTa", e.target.value)} data-testid="faq-answer-ta" />
                {err("answerTa")}
              </div>
            </div>
          </details>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Show on the website
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-ghost btn-sm max-lg:tap" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => void save()} disabled={busy} data-testid="faq-save">
              {busy ? <Spinner className="size-4" /> : <Save className="size-4" />} Save question
            </button>
          </div>
        </div>
      )}

      {faqs === null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : faqs.length === 0 ? (
        !draft && <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">No questions yet. Add the questions customers ask most (delivery, payment, GST invoice, warranty) with your answers.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line" data-testid="faq-rows">
          {faqs.map((f, i) => (
            <li key={f.id} className={`flex items-start gap-3 p-3 ${f.isActive ? "" : "opacity-60"}`} data-testid="faq-row">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{f.question}</p>
                <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted">{f.answer}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-paper-2 px-2 py-0.5">{f.topic}</span>
                  {f.questionTa && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-600">தமிழ்</span>}
                  {!f.isActive && <span className="rounded-full bg-paper-2 px-2 py-0.5">Hidden</span>}
                </p>
              </div>
              {editable && (
                <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
                  <button type="button" className="tap grid place-items-center rounded-full text-muted hover:bg-paper-2 disabled:opacity-30" aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ChevronUp className="size-4" />
                  </button>
                  <button type="button" className="tap grid place-items-center rounded-full text-muted hover:bg-paper-2 disabled:opacity-30" aria-label="Move down" disabled={i === faqs.length - 1} onClick={() => void move(i, 1)}>
                    <ChevronDown className="size-4" />
                  </button>
                  <button type="button" className="tap grid place-items-center rounded-full text-muted hover:bg-paper-2" aria-label={f.isActive ? "Hide from the website" : "Show on the website"} onClick={() => void update(f, { isActive: !f.isActive }, f.isActive ? "Hidden from the website." : "Shown on the website.")}>
                    {f.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button type="button" className="tap grid place-items-center rounded-full text-muted hover:bg-paper-2" aria-label="Edit" onClick={() => (setErrs({}), setDraft({ ...f }))} data-testid="faq-edit">
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" className="tap grid place-items-center rounded-full text-danger hover:bg-paper-2" aria-label="Delete" onClick={() => void remove(f)} data-testid="faq-delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!!faqs?.length && (
        <div className="mt-4 rounded-2xl bg-paper-2/60 p-3">
          <label className="label" htmlFor="faq-try">Try a question the way a customer would type it</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input id="faq-try" className="field !pl-9" value={tryQ} onChange={(e) => setTryQ(e.target.value)} placeholder="e.g. do u deliver to madurai" data-testid="faq-try" />
          </div>
          {tryQ.trim() && (
            <p className="mt-2 text-sm" data-testid="faq-try-result">
              {tried ? (
                <>
                  The helper answers with: <span className="font-medium">{tried.question}</span>
                </>
              ) : (
                <span className="text-muted">No question matches. Add one, or add these words to an existing question's “other words”.</span>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
