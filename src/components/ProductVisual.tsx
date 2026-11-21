import { categoryRole } from "../../shared/category-role";
import { fallbackToOriginal, srcSetFor } from "../lib/img";
import type { PublicProduct } from "../../shared/types";

/**
 * Shows the real product photograph when one exists in the catalogue.
 * Otherwise renders a clearly-labelled category ILLUSTRATION (never a fake photo).
 */
export function ProductVisual({ product, categorySlug, size = "card", label }: { product: PublicProduct; categorySlug: string; size?: "card" | "hero" | "thumb"; label?: string }) {
  const img = product.images[0];
  const h = size === "hero" ? "aspect-[4/3]" : size === "thumb" ? "aspect-square" : "aspect-[4/3]";
  if (img) return <ProductImage url={img.url} alt={img.alt ?? product.name} className={h} eager={size === "hero"} />;
  return (
    <div className={`relative ${h} overflow-hidden rounded-2xl bg-linear-to-br from-ink-3 to-ink`} role="img" aria-label={`Illustration of ${categoryNoun(categorySlug)} — product photo coming soon`}>
      <div className="absolute inset-0 grid-bg opacity-70" />
      <div className="absolute inset-0 flex items-center justify-center p-[12%]">
        <Illustration slug={categorySlug} />
      </div>
      {size !== "thumb" && (
        <span className="absolute bottom-2.5 left-3 font-mono text-[9px] tracking-[0.2em] text-paper/45 uppercase">{label ?? "Illustration"}</span>
      )}
    </div>
  );
}

/** Transparent studio cut-outs get a soft backdrop + shadow; photographs fill the frame. */
export function isCutout(url: string) {
  return /inverter|optimizer\.|mono-perc/.test(url);
}

export function ProductImage({ url, alt, className = "aspect-[4/3]", eager = false, sizes = "(max-width: 640px) 92vw, 420px" }: { url: string; alt: string; className?: string; eager?: boolean; sizes?: string }) {
  const cutout = isCutout(url);
  return (
    <div className={`relative ${className} overflow-hidden rounded-2xl ${cutout ? "bg-[radial-gradient(120%_90%_at_50%_15%,#ffffff_0%,#eef3ea_55%,#dfe7da_100%)]" : "bg-ink"}`}>
      {cutout && <div className="absolute inset-x-[18%] bottom-[7%] h-[8%] rounded-[50%] bg-ink/25 blur-xl" aria-hidden="true" />}
      <img
        src={url}
        srcSet={srcSetFor(url)}
        sizes={sizes}
        onError={fallbackToOriginal}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`absolute inset-0 size-full transition-transform duration-700 ease-out group-hover:scale-[1.05] ${cutout ? "object-contain p-[9%] drop-shadow-[0_18px_22px_rgba(10,24,34,0.22)]" : "object-cover"}`}
      />
    </div>
  );
}

function categoryNoun(slug: string) {
  return slug.replace(/-/g, " ");
}

const ROLE_ART: Record<string, string> = { panels: "solar-panels", inverters: "solar-inverters", optimisers: "power-optimisers", "dc-cables": "solar-dc-cables", "street-lights": "solar-street-lights" };

function Illustration({ slug }: { slug: string }) {
  const stroke = "#3aa56c";
  const sun = "#f5ad2e";
  switch (ROLE_ART[categoryRole({ slug })] ?? slug) {
    case "solar-panels":
      return (
        <svg viewBox="0 0 120 90" className="h-full max-h-40 w-full" aria-hidden="true">
          <g transform="skewX(-12) translate(18 6)">
            <rect x="0" y="0" width="76" height="76" rx="3" fill="#13241c" stroke={stroke} strokeWidth="1.5" />
            {Array.from({ length: 6 }).map((_, r) =>
              Array.from({ length: 6 }).map((_, c) => <rect key={`${r}${c}`} x={3 + c * 12} y={3 + r * 12} width="10.5" height="10.5" rx="1" fill="#1d3b5c" opacity={0.75 + ((r + c) % 3) * 0.08} />),
            )}
            <line x1="0" y1="38" x2="76" y2="38" stroke={stroke} strokeWidth="1.2" />
          </g>
          <circle cx="104" cy="12" r="7" fill={sun} />
        </svg>
      );
    case "solar-inverters":
      return (
        <svg viewBox="0 0 120 90" className="h-full max-h-40 w-full" aria-hidden="true">
          <rect x="30" y="8" width="60" height="70" rx="10" fill="#f6f4ee" />
          <rect x="47" y="30" width="26" height="22" rx="6" fill="#0d1813" />
          <path d="M56 41 q4 -8 8 0" stroke={stroke} strokeWidth="2" fill="none" />
          <rect x="36" y="78" width="10" height="5" rx="1" fill="#848b84" />
          <rect x="74" y="78" width="10" height="5" rx="1" fill="#848b84" />
          <path d="M8 44 h18" stroke={sun} strokeWidth="2.5" strokeDasharray="4 4" className="animate-flow" />
          <path d="M94 44 h18" stroke={stroke} strokeWidth="2.5" strokeDasharray="4 4" className="animate-flow" />
        </svg>
      );
    case "power-optimisers":
      return (
        <svg viewBox="0 0 120 90" className="h-full max-h-40 w-full" aria-hidden="true">
          <rect x="30" y="18" width="60" height="44" rx="5" fill="#1b1f1d" stroke="#3a3f3c" />
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1={36 + i * 6} y1="22" x2={36 + i * 6} y2="58" stroke="#2b302d" strokeWidth="2" />
          ))}
          <rect x="34" y="8" width="52" height="12" rx="2" fill="#c9ccc8" />
          <path d="M44 62 v14 M54 62 v20 M68 62 v20 M78 62 v14" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "solar-dc-cables":
    case "ac-cables":
    case "single-core-cables":
      return (
        <svg viewBox="0 0 120 90" className="h-full max-h-40 w-full" aria-hidden="true">
          {[34, 28, 22, 16].map((r, i) => (
            <ellipse key={r} cx="60" cy="45" rx={r * 1.35} ry={r} fill="none" stroke={i % 2 ? "#c0392b" : "#222"} strokeWidth="5" />
          ))}
          <path d="M100 52 q10 6 14 20" stroke="#222" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="114" cy="74" r="3" fill="#c98b4a" />
        </svg>
      );
    case "solar-street-lights":
      return (
        <svg viewBox="0 0 120 90" className="h-full max-h-40 w-full" aria-hidden="true">
          <rect x="56" y="20" width="5" height="68" fill="#848b84" />
          <rect x="30" y="10" width="58" height="16" rx="3" fill="#1d3b5c" stroke={stroke} />
          <path d="M40 26 L30 70 L88 70 L78 26 Z" fill={sun} opacity="0.12" />
          <rect x="42" y="26" width="34" height="4" rx="2" fill={sun} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 90" className="h-full max-h-40 w-full" aria-hidden="true">
          <circle cx="60" cy="40" r="16" fill={sun} opacity="0.9" />
          <path d="M20 78 L60 52 L100 78" stroke={stroke} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
