import { StockPill } from "../components/StockBadge";
import { AlertTriangle, ArrowRight, Check, ClipboardCopy, ClipboardList, Minus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { formatPaise, gstLabel, lineTotalPaise } from "../../shared/money";
import { EnquiryCustomerSchema, type EnquiryCustomer } from "../../shared/schemas";
import type { RevalidatedItem } from "../../shared/types";
import { buildEnquiryMessage, enquiryTotalPaise, whatsappUrl, type EnquiryLine } from "../../shared/whatsapp";
import { ProductVisual } from "../components/ProductVisual";
import { Disclaimer, Modal, Spinner, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useBasket } from "../lib/basket";
import { useCatalogue } from "../lib/catalogue";
import { usePageMeta } from "../lib/seo";
import { useAccount } from "../lib/account";
import { useSite } from "../lib/site";
import { readStore, writeStore } from "../lib/storage";
import { ActionBar, BottomSheet, ClampText, useIsPhone, useSwipeToRemove } from "../components/mobile/kit";
import { formatMobile } from "../../shared/admin-schemas";

const CUSTOMER_KEY = "verdi.customer.v1";
type Errors = Partial<Record<keyof EnquiryCustomer, string>>;

export default function Enquiry() {
  usePageMeta("Enquiry basket", "Review your product enquiry and send it to VERDI SOLARR SOLUTION on WhatsApp.");
  const basket = useBasket();
  const { byId, brand, category, loading } = useCatalogue();
  const toast = useToast();
  const [customer, setCustomer] = useState<EnquiryCustomer>(() => readStore(CUSTOMER_KEY, { name: "", business: "", mobile: "", location: "", comments: "" }));
  const [errors, setErrors] = useState<Errors>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ items: Map<number, RevalidatedItem>; checkedAt: string } | null>(null);
  const [preview, setPreview] = useState<{ customer: EnquiryCustomer; lines: Parameters<typeof buildEnquiryMessage>[1]; message: string; verified: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const { customer: account } = useAccount();
  const SITE = useSite();
  const isPhone = useIsPhone();
  // The last enquiry saved to our records, so re-opening the same preview doesn't create duplicates.
  const [recorded, setRecorded] = useState<{ key: string; reference: string } | null>(null);

  // Signed-in customers: pre-fill empty fields from their profile.
  useEffect(() => {
    if (!account) return;
    setCustomer((c) => ({
      ...c,
      name: c.name || account.name,
      business: c.business || account.business || "",
      mobile: c.mobile || formatMobile(account.mobile),
      location: c.location || account.city || "",
    }));
  }, [account]);

  /** Save the enquiry (server re-reads prices) and return its reference. Failure never blocks WhatsApp. */
  const record = async (c: EnquiryCustomer, pricesVerified: boolean): Promise<string | undefined> => {
    const items = basket.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
    const key = JSON.stringify([c, items, pricesVerified, account?.id ?? null]);
    if (recorded?.key === key) return recorded.reference;
    try {
      const r = await api<{ reference: string }>("/api/enquiries", { method: "POST", body: JSON.stringify({ customer: c, items, pricesVerified }) });
      setRecorded({ key, reference: r.reference });
      return r.reference;
    } catch {
      return undefined;
    }
  };

  // Any change to WHICH products are in the basket invalidates a previous price check.
  const idKey = basket.lines.map((l) => l.productId).join(",");
  useEffect(() => setVerified(null), [idKey]);

  const rows = useMemo(
    () =>
      basket.lines.map((l) => {
        const p = byId(l.productId);
        const v = verified?.items.get(l.productId);
        const price = v?.price ?? p?.price ?? null;
        return { line: l, product: p, verifiedItem: v, price };
      }),
    [basket.lines, byId, verified],
  );

  const totals = useMemo(() => {
    let total = 0;
    let unpriced = 0;
    for (const r of rows) {
      if (r.price?.sellingPaise != null) total += lineTotalPaise(r.price.sellingPaise, r.line.quantity);
      else unpriced++;
    }
    return { total, unpriced };
  }, [rows]);

  const setField = (k: keyof EnquiryCustomer, v: string) => {
    const next = { ...customer, [k]: v };
    setCustomer(next);
    writeStore(CUSTOMER_KEY, next);
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  const validate = (): EnquiryCustomer | null => {
    const r = EnquiryCustomerSchema.safeParse(customer);
    if (r.success) return r.data;
    const e: Errors = {};
    for (const i of r.error.issues) e[i.path[0] as keyof EnquiryCustomer] ??= i.message;
    setErrors(e);
    document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
    return null;
  };

  const buildLines = (items: Map<number, RevalidatedItem> | null): EnquiryLine[] =>
    basket.lines.map((l) => {
      const p = byId(l.productId);
      const v = items?.get(l.productId);
      const price = v?.price;
      return {
        name: v?.name ?? p?.name ?? `Product #${l.productId}`,
        brand: v?.brand ?? (p ? brand(p.brandId)?.name ?? null : null),
        model: v?.model ?? p?.model ?? null,
        quantity: l.quantity,
        // Only verified prices are ever quoted in the message.
        unitPaise: v && v.found && v.active ? price?.sellingPaise ?? null : null,
        unit: price?.unit ?? p?.price.unit ?? "per piece",
        gstIncluded: price?.gstIncluded ?? false,
        gstRate: price?.gstRate ?? null,
      };
    });

  const checkAndPreview = async () => {
    const c = validate();
    if (!c || basket.lines.length === 0) return;
    setChecking(true);
    setCheckError(null);
    try {
      const res = await api<{ items: RevalidatedItem[]; checkedAt: string }>("/api/enquiry/revalidate", {
        method: "POST",
        body: JSON.stringify({
          items: basket.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, seenSellingPaise: l.seenSellingPaise })),
        }),
      });
      const map = new Map(res.items.map((i) => [i.productId, i]));
      setVerified({ items: map, checkedAt: res.checkedAt });
      const changed = res.items.filter((i) => i.changed && i.found);
      const gone = res.items.filter((i) => !i.found || !i.active);
      if (changed.length || gone.length) {
        // Show the differences first; the customer re-confirms before preview.
        toast(`${changed.length + gone.length} item(s) changed since you added them. Please review.`, "error");
        return;
      }
      const lines = buildLines(map);
      setPreview({ customer: c, lines, message: buildEnquiryMessage(c, lines, new Date()), verified: true });
    } catch (e) {
      setCheckError(e instanceof ApiError ? e.message : "Could not verify prices.");
    } finally {
      setChecking(false);
    }
  };

  const acceptChangesAndPreview = async () => {
    const c = validate();
    if (!c || !verified) return;
    // Acknowledge: record the verified prices as "seen" so they are no longer flagged.
    const acknowledged = new Map<number, RevalidatedItem>();
    for (const [id, v] of verified.items) {
      if (v.price) basket.updateSeen(id, { sellingPaise: v.price.sellingPaise, version: v.price.version });
      acknowledged.set(id, { ...v, changed: false });
    }
    setVerified({ items: acknowledged, checkedAt: verified.checkedAt });
    const lines = buildLines(acknowledged);
    setPreview({ customer: c, lines, message: buildEnquiryMessage(c, lines, new Date()), verified: true });
  };

  const previewWithoutPrices = async () => {
    const c = validate();
    if (!c) return;
    const lines = buildLines(null);
    setPreview({ customer: c, lines, message: buildEnquiryMessage(c, lines, new Date()), verified: false });
  };

  /** The enquiry is saved only when the customer actually sends it (Open WhatsApp / Copy message). */
  const finalMessage = async (): Promise<string> => {
    if (!preview) return "";
    const ref = await record(preview.customer, preview.verified);
    return ref ? buildEnquiryMessage(preview.customer, preview.lines, new Date(), ref) : preview.message;
  };

  const openWhatsApp = async () => {
    if (!preview || sending) return;
    setSending(true);
    const w = window.open("about:blank", "_blank"); // opened inside the click so it is not blocked
    try {
      const url = whatsappUrl(await finalMessage(), SITE.whatsappNumber);
      if (w) w.location.href = url;
      else location.href = url;
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (!preview) return;
    try {
      const text = finalMessage();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        // Safari needs the clipboard write to start inside the click; the text arrives when saved.
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy failed — please select the text and copy it manually.", "error");
    }
  };

  const hasFlags = verified && [...verified.items.values()].some((i) => (i.changed && i.found) || !i.found || !i.active);

  if (basket.lines.length === 0) {
    return (
      <div className="container-x py-24 text-center">
        <ClipboardList className="mx-auto size-10 text-subtle" />
        <h1 className="mt-4 text-3xl font-semibold">Your enquiry basket is empty</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">Add products from the catalogue, then send everything to us on WhatsApp in one message.</p>
        <Link to="/products" className="btn-primary mt-6">
          Browse products <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="container-x py-10 max-lg:pt-4 max-lg:pb-24">
      <h1 className="text-4xl font-semibold max-sm:text-2xl sm:text-5xl">Enquiry basket</h1>
      <ClampText className="mt-2 text-muted max-lg:mt-1 max-lg:text-sm">This is not a checkout. Nothing is ordered or paid online. We confirm final prices, taxes, availability and delivery with you directly.</ClampText>

      <div className="mt-8 grid gap-8 max-lg:mt-4 max-lg:gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section aria-label="Products in your enquiry">
          {loading && <Spinner />}
          <ul className="grid gap-3" data-testid="basket-lines">
            {rows.map(({ line, product, verifiedItem, price }) => {
              const flagChanged = verifiedItem?.found && verifiedItem.changed;
              const flagGone = verifiedItem && (!verifiedItem.found || !verifiedItem.active);
              return (
                <SwipeRow key={line.productId} onRemove={() => basket.remove(line.productId)} className={`card flex gap-4 p-3 max-lg:gap-3 ${flagChanged || flagGone ? "!border-sun-400" : ""}`}>
                  <div className="w-20 shrink-0 max-lg:w-14 sm:w-28">{product && <ProductVisual product={product} categorySlug={category(product.categoryId)?.slug ?? ""} size="thumb" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {product ? (
                          <Link to={`/products/${product.slug}`} className="font-semibold hover:underline max-lg:line-clamp-2 max-lg:text-sm">
                            {product.name}
                          </Link>
                        ) : (
                          <p className="font-semibold">Product #{line.productId}</p>
                        )}
                        <p className="truncate text-xs text-muted">
                          {product && brand(product.brandId)?.name}
                          {product?.model ? ` · ${product.model}` : ""}
                        </p>
                        {product && <StockPill stock={product.stock ?? "in_stock"} compact className="mt-0.5 !text-[11px]" />}
                        {product?.stock === "out_of_stock" && <p className="mt-0.5 text-[11px] text-muted">Out of stock now: we will confirm when it is available.</p>}
                      </div>
                      <button type="button" className="rounded-full p-1.5 text-subtle hover:bg-danger-bg hover:text-danger max-lg:-m-2 max-lg:p-3" onClick={() => basket.remove(line.productId)} aria-label={`Remove ${product?.name ?? "item"}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 max-lg:mt-2 max-lg:gap-2">
                      <div className="flex items-center rounded-full border border-line bg-paper" role="group" aria-label="Quantity">
                        <button type="button" className="p-2 text-muted hover:text-ink max-lg:p-3" onClick={() => basket.setQty(line.productId, line.quantity - 1)} aria-label="Decrease quantity">
                          <Minus className="size-3.5" />
                        </button>
                        <input
                          aria-label={`Quantity for ${product?.name ?? "item"}`}
                          className="num w-14 bg-transparent text-center text-sm outline-none max-lg:w-10"
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => basket.setQty(line.productId, Number(e.target.value.replace(/\D/g, "")) || 1)}
                        />
                        <button type="button" className="p-2 text-muted hover:text-ink max-lg:p-3" onClick={() => basket.setQty(line.productId, line.quantity + 1)} aria-label="Increase quantity">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        {price?.sellingPaise != null ? (
                          <>
                            <p className="num text-sm font-semibold">{formatPaise(lineTotalPaise(price.sellingPaise, line.quantity))}</p>
                            <p className="num text-[11px] text-muted">
                              {formatPaise(price.sellingPaise)} {price.unit} · {gstLabel(price)}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted">Price on request</p>
                        )}
                      </div>
                    </div>
                    {flagChanged && (
                      <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-sun-100 px-2.5 py-1.5 text-xs text-ink">
                        <AlertTriangle className="size-3.5 text-sun-600" />
                        Listed price changed: {formatPaise(line.seenSellingPaise)} → <strong>{formatPaise(verifiedItem!.price?.sellingPaise ?? null)}</strong>
                      </p>
                    )}
                    {flagGone && (
                      <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs text-danger">
                        <AlertTriangle className="size-3.5" /> This product is no longer listed. We’ll confirm alternatives, or you can remove it.
                      </p>
                    )}
                  </div>
                </SwipeRow>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-between text-sm">
            <Link to="/products" className="font-semibold text-verdi-700 hover:underline">
              + Add more products
            </Link>
            <button type="button" className="text-muted hover:text-danger" onClick={() => basket.clear()}>
              Clear basket
            </button>
          </div>
        </section>

        <section aria-label="Your details" className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Indicative total</h2>
              <p className="num text-2xl font-semibold" data-testid="basket-total">
                {formatPaise(totals.total)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted">
              Based on listed prices{totals.unpriced > 0 ? `; ${totals.unpriced} item(s) priced on request` : ""}. GST as shown per item.
            </p>

            <form
              id="enquiry-form"
              className="mt-5 grid gap-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (hasFlags) void acceptChangesAndPreview();
                else void checkAndPreview();
              }}
            >
              {(
                [
                  ["name", "Your name", "text", "name", true],
                  ["business", "Business name", "text", "organization", false],
                  ["mobile", "Mobile number", "tel", "tel", true],
                  ["location", "Delivery location (city / district)", "text", "address-level2", true],
                ] as const
              ).map(([k, label, type, ac, req]) => (
                <div key={k}>
                  <label htmlFor={`f-${k}`} className="label">
                    {label} {req && <span className="text-danger">*</span>}
                  </label>
                  <input
                    id={`f-${k}`}
                    type={type}
                    autoComplete={ac}
                    className={`field ${errors[k] ? "!border-danger" : ""}`}
                    value={customer[k] ?? ""}
                    onChange={(e) => setField(k, e.target.value)}
                    aria-invalid={!!errors[k]}
                    aria-describedby={errors[k] ? `e-${k}` : undefined}
                  />
                  {errors[k] && (
                    <p id={`e-${k}`} className="mt-1 text-xs text-danger">
                      {errors[k]}
                    </p>
                  )}
                </div>
              ))}
              <div>
                <label htmlFor="f-comments" className="label">
                  Additional requirements
                </label>
                <textarea id="f-comments" rows={3} className="field" value={customer.comments ?? ""} onChange={(e) => setField("comments", e.target.value)} placeholder="e.g. delivery timeline, DCR requirement, cable colour, project size" />
              </div>
              {checkError && (
                <div className="rounded-xl bg-danger-bg p-3 text-xs text-danger">
                  <p className="font-semibold">{checkError}</p>
                  <p className="mt-1">You can still send your enquiry without listed prices. We will quote you directly.</p>
                  <button type="button" className="mt-2 font-semibold underline" onClick={previewWithoutPrices}>
                    Continue without prices
                  </button>
                </div>
              )}
              <button type="submit" className="btn-primary mt-1 w-full max-lg:hidden" disabled={checking} data-testid="check-prices">
                {checking ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />}
                {hasFlags ? "Accept updated prices & preview" : "Check latest prices & preview"}
              </button>
              <p className="text-[11px] leading-snug text-subtle" data-testid="enquiry-record-note">
                We keep a copy of your enquiry so our team can follow up (see our{" "}
                <Link to="/privacy" className="underline">
                  privacy policy
                </Link>
                ).{" "}
                {account ? (
                  <>
                    It will appear under{" "}
                    <Link to="/account" className="underline">
                      My account
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    <Link to="/account?next=/enquiry" className="font-semibold text-verdi-700 underline">
                      Sign in
                    </Link>{" "}
                    to track your enquiries and reward points.
                  </>
                )}
              </p>
              {verified && !hasFlags && (
                <p className="flex items-center gap-1.5 text-xs text-verdi-700">
                  <Check className="size-3.5" /> Prices verified {new Date(verified.checkedAt).toLocaleTimeString("en-IN")}
                </p>
              )}
            </form>
          </div>
          <div className="mt-4">
            <Disclaimer>Listed prices are indicative. Final prices, taxes, availability and delivery terms are confirmed by VERDI SOLARR SOLUTION.</Disclaimer>
          </div>
        </section>
      </div>

      <ActionBar testId="enquiry-bar">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted">Indicative total</p>
          <p className="num truncate text-sm font-semibold">{formatPaise(totals.total)}</p>
        </div>
        <button type="submit" form="enquiry-form" className="btn-primary tap shrink-0" disabled={checking} data-testid="m-send">
          {checking ? <Spinner className="size-4" /> : <WhatsAppIcon className="size-4" />}
          {hasFlags ? "Accept & preview" : "Send on WhatsApp"}
        </button>
      </ActionBar>
      <BottomSheet
        open={!!preview && isPhone}
        onClose={() => setPreview(null)}
        title="Your WhatsApp message"
        testId="preview-sheet"
        footer={
          preview && (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button type="button" className="btn-ghost tap" onClick={copy} data-testid="m-copy-message">
                {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" onClick={openWhatsApp} disabled={sending} className="btn-primary tap" data-testid="m-open-whatsapp">
                <WhatsAppIcon className="size-4" /> Send on WhatsApp
              </button>
            </div>
          )
        }
      >
        {preview && (
          <>
            <p className="mb-3 text-xs text-muted">WhatsApp opens with this text and a reference number. You still press Send.</p>
            {!preview.verified && <p className="mb-3 rounded-lg bg-sun-100 px-3 py-2 text-xs">Prices could not be verified just now, so this message lists products and quantities only.</p>}
            <pre className="rounded-2xl bg-[#e7f5df] p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink" data-testid="m-message-preview">
              {preview.message}
            </pre>
          </>
        )}
      </BottomSheet>
      <Modal
        open={!!preview && !isPhone}
        onClose={() => setPreview(null)}
        title="Preview your WhatsApp message"
        description="WhatsApp opens with this text filled in, plus a reference number. You still need to press Send."
        size="lg"
        fullscreenOnMobile
        footer={
          preview && (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={copy} data-testid="copy-message">
                {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? "Copied" : "Copy message"}
              </button>
              <button type="button" onClick={openWhatsApp} disabled={sending} className="btn-primary" data-testid="open-whatsapp">
                <WhatsAppIcon className="size-4" /> Open WhatsApp
              </button>
            </div>
          )
        }
      >
        {preview && (
          <div className="p-5">
            {!preview.verified && <p className="mb-3 rounded-lg bg-sun-100 px-3 py-2 text-xs">Prices could not be verified just now, so this message lists products and quantities only.</p>}
            <pre className="max-h-[55dvh] overflow-auto rounded-2xl bg-[#e7f5df] p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink" data-testid="message-preview">
              {preview.message}
            </pre>
            <p className="mt-3 text-xs text-muted">
              {enquiryTotalPaise(buildLines(verified?.items ?? null)).priced > 0 && preview.verified ? "Totals use prices verified moments ago." : ""}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Basket row; on phones it can be swiped left to remove. */
function SwipeRow({ onRemove, className, children }: { onRemove: () => void; className: string; children: React.ReactNode }) {
  const swipe = useSwipeToRemove(onRemove);
  return (
    <li className={className} {...swipe} data-testid="basket-line">
      {children}
    </li>
  );
}
