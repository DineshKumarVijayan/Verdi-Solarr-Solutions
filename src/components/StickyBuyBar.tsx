import { Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { formatPaise } from "../../shared/money";
import type { PublicProduct } from "../../shared/types";
import { useBasket } from "../lib/basket";
import { m } from "./motion";
import { PriceTag } from "./PriceTag";
import { ShareButton } from "./ShareButton";
import { useToast } from "./ui";

/** Text used when sharing a product (name, brand, model, listed price). */
export function shareText(p: PublicProduct, brandName: string): string {
  const price = p.price.sellingPaise != null ? `${formatPaise(p.price.sellingPaise)} ${p.price.unit}` : "Price on request";
  return `${p.name}${brandName ? ` · ${brandName}` : ""}${p.model ? ` · Model ${p.model}` : ""}\n${price} — VERDI SOLARR SOLUTION`;
}

/**
 * Phones only: once the main "Add to enquiry" box (#buy-box) scrolls out of view, keep price,
 * share and "Add to enquiry" pinned to the bottom of the screen.
 */
export function StickyBuyBar({ product, brandName }: { product: PublicProduct; brandName: string }) {
  const [show, setShow] = useState(false);
  const basket = useBasket();
  const toast = useToast();

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const box = document.getElementById("buy-box");
      setShow(!!box && box.getBoundingClientRect().bottom < 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [product.id]);

  useEffect(() => {
    // Keep the footer reachable above the bar on phones.
    document.body.style.paddingBottom = show && window.innerWidth < 1024 ? "4.5rem" : "";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <m.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-line bg-card shadow-[0_-8px_30px_rgba(10,24,34,0.12)] lg:hidden"
          data-testid="sticky-buy-bar"
        >
          <div className="container-x flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted">{product.name}</p>
              <PriceTag price={product.price} size="sm" />
            </div>
            <ShareButton variant="icon" title={product.name} text={shareText(product, brandName)} path={`/products/${product.slug}`} />
            <button
              type="button"
              className="btn-primary btn-sm shrink-0"
              onClick={() => {
                basket.add(product.id, 1, { sellingPaise: product.price.sellingPaise, version: product.price.version });
                toast(
                  <span>
                    Added to enquiry ·{" "}
                    <Link to="/enquiry" className="underline">
                      View basket
                    </Link>
                  </span>,
                  "success",
                );
              }}
            >
              <Plus className="size-4" /> Add to enquiry
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
