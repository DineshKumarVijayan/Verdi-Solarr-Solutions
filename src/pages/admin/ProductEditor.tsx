import { AvailabilityCard } from "./Availability";
import { useConfirm, useConfirmDiscard } from "../../components/confirm";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, FileText, Plus, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { slugify, specKeyFrom } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import { GST_RATES, rupeesToPaise } from "../../../shared/schemas";
import type { AdminBrand, AdminCategory, AdminMedia, AdminProductDetail, AdminSpec } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { useAdmin } from "./AdminLayout";
import { canManage, errorText, FileDrop, fieldErrors, ReadOnlyNote, send, Toggle, uploadFile, useUnsavedWarning } from "./kit";
import { ActionBar } from "../../components/mobile/kit";

const UNITS = ["per piece", "per metre", "per 100 m coil", "per 500 m coil", "per 2000 m drum", "per set", "per kit"];

interface Form {
  name: string;
  sku: string;
  slug: string;
  brandId: number;
  categoryId: number;
  model: string;
  seriesName: string;
  seriesKey: string;
  variant: string;
  short: string;
  description: string;
  highlights: string;
  isActive: boolean;
  isFeatured: boolean;
  specs: AdminSpec[];
}

const empty: Form = { name: "", sku: "", slug: "", brandId: 0, categoryId: 0, model: "", seriesName: "", seriesKey: "", variant: "", short: "", description: "", highlights: "", isActive: true, isFeatured: false, specs: [] };

function fromDetail(p: AdminProductDetail): Form {
  return {
    name: p.name,
    sku: p.sku,
    slug: p.slug,
    brandId: p.brandId,
    categoryId: p.categoryId,
    model: p.model ?? "",
    seriesName: p.seriesName ?? "",
    seriesKey: p.seriesKey ?? "",
    variant: p.variant ?? "",
    short: p.short ?? "",
    description: p.description ?? "",
    highlights: p.highlights.join("\n"),
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    specs: p.specs,
  };
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const admin = useAdmin();
  const editable = canManage(admin);
  const toast = useToast();
  const confirm = useConfirm();
  const confirmDiscard = useConfirmDiscard();
  const nav = useNavigate();
  const { data, reload } = useCatalogue();

  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [detail, setDetail] = useState<AdminProductDetail | null>(null);
  const [f, setF] = useState<Form>(empty);
  const [touchedSlug, setTouchedSlug] = useState(!isNew);
  const [slugEditing, setSlugEditing] = useState(false);
  // New product: images / datasheet uploaded now, attached right after "Create product".
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [price, setPrice] = useState({ selling: "", mrp: "", gstRate: "18", gstIncluded: false, unit: "per piece" });
  const [busy, setBusy] = useState(false);
  // Unsaved-changes tracking: snapshot of the form as last loaded/saved.
  const baseline = useRef<string | null>(null);
  const snapshot = JSON.stringify([f, price, pending.map((x) => x.storageKey)]);
  if (baseline.current === null && (isNew || detail)) baseline.current = snapshot;
  const dirty = editable && baseline.current !== null && snapshot !== baseline.current;
  useUnsavedWarning(dirty);
  const markSaved = () => {
    baseline.current = null; // re-snapshot on the next render
  };
  const cancel = async () => {
    if (await confirmDiscard(dirty)) nav("/admin/products");
  };
  const [errs, setErrs] = useState<Record<string, string>>({});
  // phones: Details · Specs · Price · Media tabs (desktop shows every section as before)
  const [tab, setTab] = useState<"details" | "specs" | "price" | "media">("details");
  const hide = (t: typeof tab) => (tab === t ? "" : "max-lg:hidden");
  const unsavedCount = (() => {
    if (!dirty || !baseline.current) return 0;
    const [bf, bp, bm] = JSON.parse(baseline.current) as [Record<string, unknown>, unknown, unknown];
    const cf = f as unknown as Record<string, unknown>;
    let n = Object.keys(cf).filter((k) => JSON.stringify(cf[k]) !== JSON.stringify(bf[k])).length;
    if (JSON.stringify(bp) !== JSON.stringify(price)) n++;
    if (JSON.stringify(bm) !== JSON.stringify(pending.map((x) => x.storageKey))) n++;
    return Math.max(1, n);
  })();
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set right after "Create": we already hold the saved product, so the URL change must not refetch it
  // (a late response could overwrite media added in the meantime).
  const created = useRef<number | null>(null);

  useEffect(() => {
    api<{ brands: AdminBrand[] }>("/api/admin/brands").then((r) => setBrands(r.brands)).catch(() => undefined);
    api<{ categories: AdminCategory[] }>("/api/admin/categories").then((r) => setCats(r.categories)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (isNew) {
      setDetail(null);
      setF(empty);
      return;
    }
    if (created.current === Number(id)) {
      created.current = null;
      return;
    }
    let alive = true;
    api<{ product: AdminProductDetail }>(`/api/admin/products/${id}`)
      .then((r) => {
        if (!alive) return;
        setDetail(r.product);
        setF(fromDetail(r.product));
        markSaved();
      markSaved();
      })
      .catch((e) => alive && setLoadError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  // All spec keys already used in the catalogue: keeps new products compatible with search, compare & calculators.
  const knownKeys = useMemo(() => {
    const m = new Map<string, { label: string; unit: string | null; group: string }>();
    for (const p of data?.products ?? []) for (const s of p.specs) if (!m.has(s.k)) m.set(s.k, { label: s.l, unit: s.u, group: s.g });
    return m;
  }, [data]);
  const templates = useMemo(() => (data?.products ?? []).filter((p) => p.categoryId === f.categoryId && p.specs.length > 0 && p.id !== detail?.id), [data, f.categoryId, detail]);

  const setSpec = (i: number, patch: Partial<AdminSpec>) =>
    set(
      "specs",
      f.specs.map((s, k) => (k === i ? { ...s, ...patch } : s)),
    );
  const moveSpec = (i: number, d: -1 | 1) => {
    const a = [...f.specs];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set("specs", a);
  };

  const save = async () => {
    setBusy(true);
    setErrs({});
    const payload: Record<string, unknown> = {
      sku: f.sku.trim(),
      slug: f.slug.trim(),
      name: f.name.trim(),
      brandId: Number(f.brandId),
      categoryId: Number(f.categoryId),
      model: f.model,
      seriesName: f.seriesName,
      seriesKey: f.seriesKey || (f.seriesName ? slugify(f.seriesName) : ""),
      variant: f.variant,
      short: f.short,
      description: f.description,
      highlights: f.highlights
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive: f.isActive,
      isFeatured: f.isFeatured,
      specs: f.specs.filter((s) => s.label.trim() || s.value.trim()).map((s) => ({ ...s, key: s.key || specKeyFrom(s.label), unit: s.unit || null })),
    };
    if (isNew) {
      const sp = rupeesToPaise(price.selling);
      const mrp = rupeesToPaise(price.mrp);
      if (Number.isNaN(sp) || Number.isNaN(mrp)) {
        setErrs({ price: "Enter prices like 12500 or 12,500.50" });
        setBusy(false);
        return;
      }
      payload.price = { sellingPricePaise: sp, mrpPaise: mrp, gstIncluded: price.gstIncluded, gstRate: price.gstRate === "" ? null : Number(price.gstRate), priceUnit: price.unit };
    } else payload.expectedUpdatedAt = detail!.updatedAt;
    try {
      const r = isNew ? await send<{ product: AdminProductDetail }>("/api/admin/products", "POST", payload) : await send<{ product: AdminProductDetail }>(`/api/admin/products/${id}`, "PUT", payload);
      let product = r.product;
      let failed = 0;
      if (isNew && pending.length) {
        // first image = cover; datasheet becomes the product's datasheet
        let firstImage = true;
        for (const m of pending) {
          try {
            product = (
              await send<{ product: AdminProductDetail }>(`/api/admin/products/${product.id}/media`, "POST", {
                type: m.type,
                storageKey: m.storageKey,
                alt: m.type === "image" ? product.name : null,
                title: m.type === "datasheet" ? `${product.name} datasheet` : null,
                isPrimary: m.type === "datasheet" || firstImage,
              })
            ).product;
            if (m.type === "image") firstImage = false;
          } catch {
            failed++;
          }
        }
        setPending([]);
      }
      setDetail(product);
      setF(fromDetail(product));
      markSaved();
      reload();
      if (failed) toast(`Product created, but ${failed} file(s) could not be attached. Please add them again under Images & datasheet.`, "error");
      else toast(isNew ? "Product created and published." : "Saved. Live on the website.", "success");
      if (isNew) {
        created.current = r.product.id;
        nav(`/admin/products/${r.product.id}`, { replace: true });
      }
    } catch (e) {
      setErrs({ ...fieldErrors(e), _: errorText(e) });
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !detail ||
      !(await confirm({
        title: `Permanently delete “${detail.name}”?`,
        message: "Its price history is removed too (a copy is kept in the audit log). To keep it but take it off the website, switch “Visible on website” off instead.",
        confirmLabel: "Delete product",
        tone: "danger",
      }))
    )
      return;
    try {
      await send(`/api/admin/products/${detail.id}`, "DELETE");
      reload();
      toast("Product deleted.", "success");
      nav("/admin/products");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  if (loadError) return <p className="container-x py-10 text-danger">{loadError}</p>;
  if (!isNew && !detail)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  const input = (k: keyof Form, label: string, opts: { req?: boolean; hint?: string; ph?: string; onChange?: (v: string) => void; className?: string } = {}) => (
    <div className={opts.className}>
      <label htmlFor={`pe-${k}`} className="label">
        {label} {opts.req && <span className="text-danger">*</span>}
      </label>
      <input id={`pe-${k}`} className={`field ${errs[k] ? "!border-danger" : ""}`} value={f[k] as string} placeholder={opts.ph} disabled={!editable} onChange={(e) => (opts.onChange ? opts.onChange(e.target.value) : set(k, e.target.value as never))} />
      {errs[k] ? <p className="mt-1 text-xs text-danger">{errs[k]}</p> : opts.hint && <p className="mt-1 text-xs text-subtle">{opts.hint}</p>}
    </div>
  );

  const specErrors = Object.entries(errs).filter(([k]) => k.startsWith("specs"));

  return (
    <div className="container-x py-10 max-lg:pt-3 max-lg:pb-24">
      <Link to="/admin/products" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink max-lg:min-h-11">
        <ArrowLeft className="size-4" /> All products
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold max-lg:line-clamp-2 max-lg:text-xl">{isNew ? "Add a product" : f.name || "Product"}</h1>
          {detail && (
            <p className="mt-1 text-xs text-muted">
              Last edited {new Date(detail.updatedAt).toLocaleString("en-IN")} {detail.updatedBy ? `by ${detail.updatedBy}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {detail?.isActive && (
            <a href={`/products/${detail.slug}`} target="_blank" rel="noopener" className="btn-ghost btn-sm">
              <ExternalLink className="size-4" /> View on website
            </a>
          )}
          {editable && (
            <button type="button" className="btn-ghost btn-sm max-lg:hidden" onClick={cancel} disabled={busy} data-testid="cancel-product">
              Cancel
            </button>
          )}
          {editable && (
            <button type="button" className="btn-primary btn-sm max-lg:hidden" onClick={save} disabled={busy || uploading > 0} data-testid="save-product">
              {busy ? <Spinner className="size-4" /> : <Save className="size-4" />} {isNew ? "Create product" : "Save changes"}
            </button>
          )}
        </div>
      </div>
      <ReadOnlyNote admin={admin} />
      {errs._ && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">
          {errs._}
        </p>
      )}

      <div role="tablist" aria-label="Product editor sections" className="m-tabs top-14 mt-3 lg:hidden" data-testid="editor-tabs">
        {(
          [
            ["details", "Details", Object.keys(errs).some((k) => !k.startsWith("specs") && !k.startsWith("price") && k !== "_") || !f.name.trim()],
            ["specs", "Specs", specErrors.length > 0 || f.specs.length === 0],
            ["price", "Price", !!(errs.price || errs["price.sellingPricePaise"]) || (isNew ? price.selling.trim() === "" : detail?.price?.sellingPaise == null)],
            ["media", "Media", isNew ? !pending.some((x) => x.type === "image") : !(detail?.media ?? []).some((m) => m.type === "image")],
          ] as const
        ).map(([id, label, dot]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="m-tab relative" onClick={() => setTab(id)} data-testid={`editor-tab-${id}`}>
            {label}
            {dot && <span className="absolute top-2.5 right-0.5 size-2 rounded-full bg-sun-500" aria-label="needs attention" data-testid="tab-dot" />}
          </button>
        ))}
      </div>
      {editable && (
        <ActionBar testId="editor-save-bar">
          <p className="min-w-0 flex-1 truncate text-xs text-muted" aria-live="polite">
            {dirty ? (
              <span className="font-semibold text-sun-600">● {unsavedCount} unsaved {unsavedCount === 1 ? "change" : "changes"}</span>
            ) : (
              <>
                <span className="min-[360px]:hidden">Saved</span>
                <span className="max-[359px]:hidden">All changes saved</span>
              </>
            )}
          </p>
          <button type="button" className="btn-ghost tap shrink-0" onClick={cancel} disabled={busy}>
            Discard
          </button>
          <button type="button" className="btn-primary tap shrink-0" onClick={save} disabled={busy || uploading > 0} data-testid="m-save-product">
            {busy ? <Spinner className="size-4" /> : <Save className="size-4" />} {isNew ? "Create" : "Save"}
          </button>
        </ActionBar>
      )}
      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 max-lg:mt-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          {/* ------------------------------------------------ basics */}
          <section className={`card grid grid-cols-1 gap-4 p-5 max-lg:p-4 ${hide("details")}`}>
            <h2 className="font-semibold">Product details</h2>
            {input("name", "Product name", {
              req: true,
              ph: "e.g. N-Type TOPCon Bifacial Module 600 Wp",
              onChange: (v) =>
                setF((x) => ({
                  ...x,
                  name: v,
                  ...(touchedSlug ? {} : { slug: slugify(v) }),
                })),
            })}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pe-brand" className="label">
                  Brand <span className="text-danger">*</span>
                </label>
                <select id="pe-brand" className={`field ${errs.brandId ? "!border-danger" : ""}`} value={f.brandId || ""} disabled={!editable} onChange={(e) => set("brandId", Number(e.target.value))}>
                  <option value="">Choose…</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.isActive ? "" : " (hidden)"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-subtle">
                  New brand?{" "}
                  <Link className="text-verdi-700 underline" to="/admin/catalogue">
                    Add it under Brands & categories
                  </Link>
                </p>
              </div>
              <div>
                <label htmlFor="pe-cat" className="label">
                  Category <span className="text-danger">*</span>
                </label>
                <select id="pe-cat" className={`field ${errs.categoryId ? "!border-danger" : ""}`} value={f.categoryId || ""} disabled={!editable} onChange={(e) => set("categoryId", Number(e.target.value))}>
                  <option value="">Choose…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? "" : " (hidden)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {input("sku", "SKU (your product code)", { req: true, ph: "e.g. VS-ANC-TOPCON-600", hint: "Unique. Letters, numbers, - _ . /" })}
              {input("model", "Manufacturer model number", { ph: "e.g. PE-132-600THGB-G12R" })}
            </div>
            {/* Page link: created automatically from the name. Editing is optional and tucked away. */}
            <div className="rounded-xl bg-paper-2/60 px-3 py-2.5 text-sm" data-testid="page-link">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted">Page link:</span>
                <span className="min-w-0 font-mono text-xs break-all">
                  {location.host}/products/<b>{f.slug || "…"}</b>
                </span>
                {editable && !slugEditing && (
                  <button type="button" className="text-xs font-semibold text-verdi-700 underline" onClick={() => setSlugEditing(true)}>
                    Edit
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-subtle">
                {isNew ? "Created automatically from the product name. Nothing to do here." : "Changing it breaks links customers may have already shared, so leave it unless needed."}
              </p>
              {slugEditing &&
                input("slug", "Page link (lowercase letters, numbers and dashes)", {
                  req: true,
                  className: "mt-2",
                  onChange: (v) => {
                    setTouchedSlug(true);
                    set("slug", v.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  },
                })}
              {errs.slug && !slugEditing && <p className="mt-1 text-xs text-danger">{errs.slug}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {input("seriesName", "Product family / series", { hint: "Products in the same series are grouped as variants.", ph: "e.g. TOPCon Bifacial 600–630 Wp" })}
              {input("variant", "Variant label", { ph: "e.g. 600 Wp" })}
            </div>
            {input("short", "Short description", { hint: "One line shown on product cards." })}
            <div>
              <label htmlFor="pe-desc" className="label">
                Full description
              </label>
              <textarea id="pe-desc" rows={5} className="field" value={f.description} disabled={!editable} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div>
              <label htmlFor="pe-hl" className="label">
                Highlights (one per line)
              </label>
              <textarea id="pe-hl" rows={4} className="field" value={f.highlights} disabled={!editable} onChange={(e) => set("highlights", e.target.value)} placeholder={"BIS certified\n12-year product warranty (per datasheet)"} />
              <p className="mt-1 text-xs text-subtle">Only state facts from the manufacturer datasheet.</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <Toggle id="pe-active" checked={f.isActive} onChange={(v) => editable && set("isActive", v)} label="Visible on website" />
              <Toggle id="pe-feat" checked={f.isFeatured} onChange={(v) => editable && set("isFeatured", v)} label="Featured" />
            </div>
          </section>

          {/* ------------------------------------------------ specs */}
          <section className={`card grid min-w-0 grid-cols-1 gap-4 p-5 max-lg:p-4 ${hide("specs")}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Specifications</h2>
              {editable && templates.length > 0 && (
                <select
                  aria-label="Copy specification fields from"
                  className="field !w-auto max-w-full min-w-0 !py-1.5 text-sm"
                  value=""
                  onChange={async (e) => {
                    const src = templates.find((p) => p.id === Number(e.target.value));
                    if (!src) return;
                    if (f.specs.length && !(await confirm({ title: "Replace the specification rows?", message: "The current rows are replaced with the fields from this product. Values are left blank for you to fill in.", confirmLabel: "Replace rows" }))) return;
                    set(
                      "specs",
                      src.specs.map((s) => ({ key: s.k, label: s.l, value: "", unit: s.u, group: s.g })),
                    );
                  }}
                >
                  <option value="">Copy fields from a similar product…</option>
                  {templates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="-mt-2 text-xs text-subtle">Copy values exactly from the manufacturer datasheet. Using the same field names as similar products keeps search, compare and the calculators working.</p>
            {specErrors.length > 0 && (
              <ul className="rounded-xl bg-danger-bg p-3 text-xs text-danger">
                {specErrors.map(([k, m]) => (
                  <li key={k}>
                    Row {Number(k.split(".")[1]) + 1}: {m}
                  </li>
                ))}
              </ul>
            )}
            <datalist id="spec-keys">
              {[...knownKeys.keys()].map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <div className="md:overflow-x-auto">
              <table className="rtable rtable-form w-full text-sm md:min-w-[640px]" data-testid="spec-table">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="pb-2 font-medium">Group</th>
                    <th className="pb-2 font-medium">Label</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 font-medium">Unit</th>
                    <th className="pb-2 font-medium">Field key</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {f.specs.map((s, i) => (
                    <tr key={i} className="align-top">
                      <td className="pr-1.5 pb-1.5" data-label="Group">
                        <input aria-label={`Group, row ${i + 1}`} className="field !px-2 !py-1.5" value={s.group} disabled={!editable} onChange={(e) => setSpec(i, { group: e.target.value })} />
                      </td>
                      <td className="pr-1.5 pb-1.5" data-label="Label">
                        <input
                          aria-label={`Label, row ${i + 1}`}
                          className="field !px-2 !py-1.5"
                          value={s.label}
                          disabled={!editable}
                          onChange={(e) => setSpec(i, { label: e.target.value, ...(s.key && s.key !== specKeyFrom(s.label) ? {} : { key: specKeyFrom(e.target.value) }) })}
                        />
                      </td>
                      <td className="pr-1.5 pb-1.5" data-label="Value">
                        <input aria-label={`Value, row ${i + 1}`} className="field !px-2 !py-1.5" value={s.value} disabled={!editable} onChange={(e) => setSpec(i, { value: e.target.value })} />
                      </td>
                      <td className="w-24 pr-1.5 pb-1.5" data-label="Unit">
                        <input aria-label={`Unit, row ${i + 1}`} className="field !px-2 !py-1.5" value={s.unit ?? ""} disabled={!editable} onChange={(e) => setSpec(i, { unit: e.target.value })} />
                      </td>
                      <td className="w-40 pr-1.5 pb-1.5" data-label="Field key">
                        <input
                          aria-label={`Field key, row ${i + 1}`}
                          list="spec-keys"
                          className="field num !px-2 !py-1.5 text-xs"
                          value={s.key}
                          disabled={!editable}
                          onChange={(e) => {
                            const key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                            const known = knownKeys.get(key);
                            setSpec(i, { key, ...(known && !s.label ? { label: known.label, unit: known.unit, group: known.group } : {}) });
                          }}
                        />
                      </td>
                      <td className="rt-actions pb-1.5 whitespace-nowrap">
                        {editable && (
                          <>
                            <button type="button" className="rounded p-1.5 text-subtle hover:text-ink" onClick={() => moveSpec(i, -1)} aria-label={`Move row ${i + 1} up`}>
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button type="button" className="rounded p-1.5 text-subtle hover:text-ink" onClick={() => moveSpec(i, 1)} aria-label={`Move row ${i + 1} down`}>
                              <ArrowDown className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-1.5 text-subtle hover:text-danger"
                              onClick={() =>
                                set(
                                  "specs",
                                  f.specs.filter((_, k) => k !== i),
                                )
                              }
                              aria-label={`Remove row ${i + 1}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editable && (
              <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={() => set("specs", [...f.specs, { key: "", label: "", value: "", unit: null, group: f.specs.at(-1)?.group ?? "Electrical" }])} data-testid="add-spec">
                <Plus className="size-4" /> Add specification
              </button>
            )}
          </section>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          {/* ------------------------------------------------ price */}
          <section className={`card grid grid-cols-1 gap-3 p-5 max-lg:p-4 ${hide("price")}`}>
            <h2 className="font-semibold">Price</h2>
            {isNew ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pe-price" className="label">
                      Selling price (₹)
                    </label>
                    <input id="pe-price" inputMode="decimal" className="field num" value={price.selling} onChange={(e) => setPrice({ ...price, selling: e.target.value })} placeholder="Leave blank = on request" data-testid="new-price" />
                  </div>
                  <div>
                    <label htmlFor="pe-mrp" className="label">
                      MRP (₹)
                    </label>
                    <input id="pe-mrp" inputMode="decimal" className="field num" value={price.mrp} onChange={(e) => setPrice({ ...price, mrp: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="pe-gst" className="label">
                      GST rate
                    </label>
                    <select id="pe-gst" className="field" value={price.gstRate} onChange={(e) => setPrice({ ...price, gstRate: e.target.value })}>
                      <option value="">Not set</option>
                      {GST_RATES.map((g) => (
                        <option key={g} value={g}>
                          {g}%
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pe-unit" className="label">
                      Unit
                    </label>
                    <select id="pe-unit" className="field" value={price.unit} onChange={(e) => setPrice({ ...price, unit: e.target.value })}>
                      {UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Toggle id="pe-gstinc" checked={price.gstIncluded} onChange={(v) => setPrice({ ...price, gstIncluded: v })} label="Price includes GST" />
                {(errs.price || errs["price.sellingPricePaise"]) && <p className="text-xs text-danger">{errs.price || errs["price.sellingPricePaise"]}</p>}
              </>
            ) : (
              <>
                <p className="num text-2xl font-semibold">{detail?.price?.sellingPaise != null ? formatPaise(detail.price.sellingPaise) : <span className="text-base text-muted">Price on request</span>}</p>
                <p className="text-xs text-muted">
                  {detail?.price?.unit}
                  {detail?.price?.gstRate != null ? ` · GST ${detail.price.gstRate}% ${detail.price.gstIncluded ? "incl." : "extra"}` : ""}
                </p>
                <Link to={`/admin/prices?q=${encodeURIComponent(f.sku)}`} className="btn-ghost btn-sm justify-self-start">
                  Change price (with history)
                </Link>
              </>
            )}
          </section>

          {detail && (
            <AvailabilityCard
              className={hide("price")}
              productId={detail.id}
              value={{ stock: detail.stock, onOffer: detail.onOffer, offerLabel: detail.offerLabel }}
              price={detail.price}
              editable={editable}
              onSaved={(v) => setDetail({ ...detail, ...v })}
            />
          )}

          {/* ------------------------------------------------ media */}
          <div className={`contents ${hide("media")}`}>
          {detail ? <MediaManager product={detail} editable={editable} onChange={(p) => (setDetail(p), reload())} /> : <NewProductMedia pending={pending} setPending={setPending} uploading={uploading} setUploading={setUploading} editable={editable} />}
          </div>

          {detail && editable && (
            <section className={`rounded-3xl border border-danger/30 p-5 ${hide("details")}`}>
              <h2 className="font-semibold text-danger">Remove product</h2>
              <p className="mt-1 text-xs text-muted">To take it off the website temporarily, switch “Visible on website” off. Deleting is permanent.</p>
              <button type="button" className="btn-ghost btn-sm mt-3 !border-danger/40 !text-danger" onClick={remove} data-testid="delete-product">
                <Trash2 className="size-4" /> Delete permanently
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

interface PendingFile {
  storageKey: string;
  url: string;
  type: "image" | "datasheet";
  name: string;
}

/** Add-product page: pick photos and the datasheet up front; they attach when the product is created. */
function NewProductMedia({
  pending,
  setPending,
  uploading,
  setUploading,
  editable,
}: {
  pending: PendingFile[];
  setPending: (u: (p: PendingFile[]) => PendingFile[]) => void;
  uploading: number;
  setUploading: (u: (n: number) => number) => void;
  editable: boolean;
}) {
  const toast = useToast();
  const images = pending.filter((m) => m.type === "image");
  const datasheet = pending.find((m) => m.type === "datasheet");
  const add = async (files: File[], type: "image" | "datasheet") => {
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const up = await uploadFile(file, type);
        const item: PendingFile = { storageKey: up.storageKey, url: up.url, type, name: file.name };
        setPending((p) => (type === "datasheet" ? [...p.filter((x) => x.type !== "datasheet"), item] : [...p, item]));
      } catch (e) {
        toast(`${file.name}: ${errorText(e, "upload failed")}`, "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const remove = (key: string) => setPending((p) => p.filter((x) => x.storageKey !== key));
  const makeCover = (key: string) =>
    setPending((p) => {
      const m = p.find((x) => x.storageKey === key)!;
      return [m, ...p.filter((x) => x.storageKey !== key)];
    });

  return (
    <section className="card grid gap-5 p-5" data-testid="new-product-media">
      <div>
        <h2 className="font-semibold">Images & datasheet</h2>
        <p className="mt-1 text-sm text-muted">Add them now. They are attached when you click Create product.</p>
      </div>
      <div>
        <p className="label">Product photos</p>
        {images.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="pending-images">
            {images.map((m, i) => (
              <li key={m.storageKey} className="group relative overflow-hidden rounded-xl border border-line bg-white">
                <img src={m.url} alt="" className="aspect-square w-full object-contain p-1.5" />
                {i === 0 ? (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold text-paper">Cover</span>
                ) : (
                  editable && (
                    <button type="button" className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink shadow" onClick={() => makeCover(m.storageKey)}>
                      Make cover
                    </button>
                  )
                )}
                {editable && (
                  <button type="button" aria-label={`Remove ${m.name}`} className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-white/90 text-danger shadow" onClick={() => remove(m.storageKey)}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <FileDrop
            accept="image/jpeg,image/png,image/webp"
            multiple
            label={images.length ? "Add more photos" : "Add product photos"}
            hint="JPG, PNG or WebP. The first photo is the cover. Large photos are resized automatically."
            busy={uploading > 0}
            onFiles={(fs) => void add(fs, "image")}
            testId="new-images"
          />
        )}
      </div>
      <div>
        <p className="label">Datasheet (PDF)</p>
        {datasheet && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-paper-2/50 px-3 py-2.5" data-testid="pending-datasheet">
            <FileText className="size-5 shrink-0 text-verdi-700" />
            <span className="min-w-0 flex-1 truncate text-sm" title={datasheet.name}>
              {datasheet.name}
            </span>
            {editable && (
              <button type="button" aria-label="Remove datasheet" className="rounded-full p-1.5 text-danger hover:bg-danger-bg" onClick={() => remove(datasheet.storageKey)}>
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
        {editable && (
          <FileDrop
            accept="application/pdf"
            label={datasheet ? "Replace datasheet" : "Add the datasheet PDF"}
            hint="The manufacturer's PDF. Customers can view and download it on the product page."
            busy={uploading > 0}
            onFiles={(fs) => void add(fs.slice(0, 1), "datasheet")}
            testId="new-datasheet"
          />
        )}
      </div>
      {uploading > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> Uploading {uploading} file{uploading === 1 ? "" : "s"}…
        </p>
      )}
    </section>
  );
}

function MediaManager({ product, editable, onChange }: { product: AdminProductDetail; editable: boolean; onChange: (p: AdminProductDetail) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"image" | "datasheet" | null>(null);
  const images = product.media.filter((m) => m.type === "image");
  const datasheet = product.media.find((m) => m.type === "datasheet" && m.isPrimary) ?? product.media.find((m) => m.type === "datasheet");

  const add = async (files: File[], type: "image" | "datasheet") => {
    setBusy(type);
    try {
      let latest = product;
      for (const file of files) {
        const up = await uploadFile(file, type);
        const r = await send<{ product: AdminProductDetail }>(`/api/admin/products/${product.id}/media`, "POST", {
          type,
          storageKey: up.storageKey,
          alt: type === "image" ? product.name : null,
          title: type === "datasheet" ? `${product.name} datasheet` : null,
          isPrimary: type === "image" && latest.media.every((m) => m.type !== "image"),
        });
        latest = r.product;
      }
      // Replacing: the new PDF is already primary, so drop the old one.
      if (type === "datasheet" && datasheet) latest = (await send<{ product: AdminProductDetail }>(`/api/admin/products/${product.id}/media/${datasheet.id}`, "DELETE")).product;
      onChange(latest);
      toast(type === "image" ? "Image added." : "Datasheet added.", "success");
    } catch (e) {
      toast(errorText(e, "Upload failed."), "error");
    } finally {
      setBusy(null);
    }
  };
  const patch = async (m: AdminMedia, body: Record<string, unknown>) => {
    try {
      const r = await send<{ product: AdminProductDetail }>(`/api/admin/products/${product.id}/media/${m.id}`, "PUT", { alt: m.alt, title: m.title, ...body });
      onChange(r.product);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const del = async (m: AdminMedia) => {
    if (!(await confirm({ title: m.type === "image" ? "Remove this image?" : "Remove this datasheet?", message: "It disappears from the product page straight away.", confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      const r = await send<{ product: AdminProductDetail }>(`/api/admin/products/${product.id}/media/${m.id}`, "DELETE");
      onChange(r.product);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <>
      <section className="card grid grid-cols-1 gap-3 p-5">
        <h2 className="font-semibold">Images</h2>
        <p className="-mt-1 text-xs text-subtle">Use real manufacturer or your own photos. Large photos are resized automatically. The starred image is shown first.</p>
        {images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2" data-testid="product-images">
            {images.map((m) => (
              <li key={m.id} className="group relative overflow-hidden rounded-2xl border border-line bg-white">
                <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full object-contain p-2" />
                <div className="absolute inset-x-1.5 top-1.5 flex justify-between">
                  <button
                    type="button"
                    disabled={!editable || m.isPrimary}
                    onClick={() => patch(m, { isPrimary: true })}
                    className={`rounded-full bg-white/90 p-1.5 shadow ${m.isPrimary ? "text-sun-500" : "text-subtle hover:text-sun-500"}`}
                    aria-label={m.isPrimary ? "Main image" : "Make main image"}
                    title={m.isPrimary ? "Main image" : "Make main image"}
                  >
                    <Star className={`size-3.5 ${m.isPrimary ? "fill-sun-400" : ""}`} />
                  </button>
                  {editable && (
                    <button type="button" onClick={() => del(m)} className="rounded-full bg-white/90 p-1.5 text-subtle shadow hover:text-danger" aria-label="Remove image">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <input
                  aria-label="Image description (alt text)"
                  className="w-full border-t border-line bg-paper px-2 py-1.5 text-xs outline-none"
                  defaultValue={m.alt ?? ""}
                  disabled={!editable}
                  placeholder="Describe the image"
                  onBlur={(e) => e.target.value !== (m.alt ?? "") && patch(m, { alt: e.target.value })}
                />
              </li>
            ))}
          </ul>
        )}
        {editable && <FileDrop accept="image/jpeg,image/png,image/webp" multiple label="Upload images" hint="JPEG, PNG or WebP · drag & drop" busy={busy === "image"} onFiles={(fs) => add(fs, "image")} testId="upload-image" />}
      </section>

      <section className="card grid grid-cols-1 gap-3 p-5">
        <h2 className="font-semibold">Datasheet (PDF)</h2>
        {datasheet ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3">
            <a href={datasheet.url} target="_blank" rel="noopener" className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline" data-testid="current-datasheet">
              <FileText className="size-5 shrink-0 text-danger" />
              <span className="truncate">{datasheet.title ?? datasheet.storageKey.split("/").pop()}</span>
            </a>
            {editable && (
              <button type="button" onClick={() => del(datasheet)} className="rounded-full p-1.5 text-subtle hover:text-danger" aria-label="Remove datasheet">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No datasheet yet.</p>
        )}
        {editable && <FileDrop accept="application/pdf" label={datasheet ? "Replace datasheet" : "Upload datasheet PDF"} hint="PDF up to 25 MB · shown in the website’s datasheet viewer" busy={busy === "datasheet"} onFiles={(fs) => add(fs, "datasheet")} testId="upload-datasheet" />}
      </section>
    </>
  );
}
