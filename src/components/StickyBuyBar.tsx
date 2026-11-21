import { Minus, Plus } from "lucide-react";
import { Link } from "react-router";
import { formatPaise } from "../../shared/money";
import type { PublicProduct } from "../../shared/types";
import { useBasket } from "../lib/basket";
import { ActionBar } from "./mobile/kit";
import { useToast } from "./ui";
import { WhatsAppIcon } from "./WhatsAppIcon";

/** Text used when sharing a product (name, brand, model, listed price). */
export function shareText(p: PublicProduct, brandName: string): string {
  const price = p.price.sellingPaise != null ? `${formatPaise(p.price.sellingPaise)} ${p.price.unit}` : "Price on request";
  return `${p.name}${brandName ? ` · ${brandName}` : ""}${p.model ? ` · Model ${p.model}` : ""}\n${price} — VERDI SOLARR SOLUTION`;
}

/**
 * Phones only (< lg): bottom action bar on the product page, always visible above the tab bar:
 * quantity stepper, "Add to enquiry" (primary) and a WhatsApp enquiry button.
 */
export function StickyBuyBar({ product, qty, setQty, whatsappHref }: { product: PublicProduct; qty: number; setQty: (fn: (q: number) => number) => void; whatsappHref: string }) {
  const basket = useBasket();
  const toast = useToast();
  return (
    <ActionBar testId="sticky-buy-bar">
      <div className="flex shrink-0 items-center rounded-full border border-line bg-paper" role="group" aria-label="Quantity">
        <button type="button" className="tap grid place-items-center text-muted" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
          <Minus className="size-4" />
        </button>
        <input
          aria-label="Quantity"
          className="num w-9 bg-transparent text-center text-sm outline-none"
          inputMode="numeric"
          value={qty}
          onChange={(e) => {
            const v = Math.max(1, Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 1));
            setQty(() => v);
          }}
          data-testid="bar-qty"
        />
        <button type="button" className="tap grid place-items-center text-muted" onClick={() => setQty((q) => Math.min(100000, q + 1))} aria-label="Increase quantity">
          <Plus className="size-4" />
        </button>
      </div>
      <button
        type="button"
        className="btn-primary tap min-w-0 flex-1"
        onClick={() => {
          basket.add(product.id, qty, { sellingPaise: product.price.sellingPaise, version: product.price.version });
          toast(
            <span>
              Added {qty} to enquiry ·{" "}
              <Link to="/enquiry" className="underline">
                View basket
              </Link>
            </span>,
            "success",
          );
        }}
      >
        <Plus className="size-4 shrink-0" /> <span className="truncate">Add to enquiry</span>
      </button>
      <a href={whatsappHref} target="_blank" rel="noopener" className="tap grid shrink-0 place-items-center rounded-full bg-[#1f9e4f] text-white" aria-label="Enquire on WhatsApp">
        <WhatsAppIcon className="size-5" />
      </a>
    </ActionBar>
  );
}
