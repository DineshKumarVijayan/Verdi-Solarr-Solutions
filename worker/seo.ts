import { STOCK_LABEL, STOCK_SCHEMA } from "../shared/stock";
// Search-engine & link-preview HTML for product pages, plus a live sitemap.xml and robots.txt.
//
// /products/* runs through the Worker so EVERY product (including ones added in the admin after
// the last build) gets correct <title>, description, Open Graph/Twitter preview tags with the
// product photo, and schema.org Product JSON-LD with the live listed price (Google rich results).
// Only data the business entered is used: no invented stock, ratings or reviews.

import { productsForCategorySlugs } from "../shared/category-role";
import { formatPaise } from "../shared/money";
import localPages from "../data/local-pages.json";
import type { PublicCatalogue, PublicProduct } from "../shared/types";
import { CATALOGUE_CACHE_KEY, handleCatalogue } from "./catalogue";
import { PAGE_SECURITY_HEADERS } from "./http";
import type { Env } from "./env";

const BUSINESS = "VERDI SOLARR SOLUTION";
type LocalPage = { slug: string; title: string; metaTitle: string; description: string; intro: string; categories: string[]; faqs: [string, string][] };
const LOCAL_PAGES = (localPages as unknown as { pages: LocalPage[] }).pages;
/** Paths filled from the live catalogue (also listed in wrangler.jsonc run_worker_first). */
export const LIVE_PATHS = ["/", "/products", "/faq", ...LOCAL_PAGES.map((p) => `/${p.slug}`)];
const localProducts = (slugs: string[], cat: PublicCatalogue) => productsForCategorySlugs(slugs, cat.categories, cat.products).slice(0, 60);
const DEFAULT_IMAGE = "/media/hero-solar-farm-golden-1200.webp";

let memo: { version: string; data: PublicCatalogue } | null = null;

/** Parsed public catalogue (edge-cached response; parsed once per isolate per version). */
async function catalogue(env: Env, ctx: ExecutionContext): Promise<PublicCatalogue> {
  const res = await handleCatalogue(new Request(CATALOGUE_CACHE_KEY), env, ctx);
  const version = res.headers.get("X-Catalogue-Version") ?? res.headers.get("ETag") ?? "";
  if (memo && memo.version === version) return memo.data;
  const data = (await res.json()) as PublicCatalogue;
  memo = { version, data };
  return data;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const absolute = (origin: string, u: string) => (u.startsWith("http") ? u : origin + u);

function productJsonLd(p: PublicProduct, cat: PublicCatalogue, origin: string) {
  const brand = cat.brands.find((b) => b.id === p.brandId)?.name;
  const category = cat.categories.find((c) => c.id === p.categoryId);
  const url = `${origin}/products/${p.slug}`;
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    ...(p.model && !p.model.includes("XXX") ? { mpn: p.model } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(category ? { category: category.name } : {}),
    url,
    description: p.description ?? p.short ?? p.name,
    image: p.images.length ? p.images.map((i) => absolute(origin, i.url)) : [absolute(origin, DEFAULT_IMAGE)],
    additionalProperty: p.specs.slice(0, 20).map((s) => ({ "@type": "PropertyValue", name: s.l, value: s.v, ...(s.u ? { unitText: s.u } : {}) })),
    // Offer only when a price is actually listed. No availability/ratings (never claimed).
    ...(p.price.sellingPaise != null
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "INR",
            price: (p.price.sellingPaise / 100).toFixed(2),
            availability: STOCK_SCHEMA[p.stock ?? "in_stock"],
            seller: { "@type": "Organization", name: BUSINESS },
          },
        }
      : {}),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      ["Home", "/"],
      ["Products", "/products"],
      ...(category ? [[category.name, `/category/${category.slug}`]] : []),
      [p.variant ?? p.name, `/products/${p.slug}`],
    ].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: origin + path })),
  };
  return [product, crumbs];
}

// ------------------------------------------------------------------ live pages
// Home, All products, every category, every product and the local landing pages are filled from the LIVE
// catalogue on each request (title, description, preview tags, JSON-LD and readable content for crawlers),
// so a catalogue rebuilt from scratch in the admin is what search engines and link previews see. A product
// or category that no longer exists answers 404 (noindex) instead of an old build-time page.

/** Crawler text stays in the HTML but is never shown (no flash of plain text before the app starts). */
const CRAWLER_TEXT_STYLE = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";

type Live = { title: string; description: string; canonical: string; image?: string; ogType?: string; jsonld: object[]; body: string; status?: number; noindex?: boolean; product?: PublicProduct };

const nav = `<nav aria-label="Site"><a href="/">Home</a> · <a href="/products">Products</a> · <a href="/learn">Learn</a> · <a href="/solar-tools">Solar tools</a> · <a href="/contact">Contact</a></nav>`;
const FALLBACK = { phone: "+91 8939277997", email: "Verdisolarrsolution@gmail.com", address: ["#229, Bajanai Koil Street", "Nemam", "Chennai – 600124", "Tamil Nadu, India"] };

/** Business details from the admin Settings (fallback: the built-in defaults). */
function business(cat: PublicCatalogue) {
  const s = cat.settings ?? {};
  const address = (s.address ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return { phone: s.phone || FALLBACK.phone, email: s.email || FALLBACK.email, address: address.length ? address : FALLBACK.address };
}
function contactHtml(cat: PublicCatalogue) {
  const b = business(cat);
  return `<address>${BUSINESS}, ${esc(b.address.join(", "))}. Phone / WhatsApp: <a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a>. Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>.</address>`;
}
function organization(cat: PublicCatalogue, origin: string) {
  const b = business(cat);
  return { "@context": "https://schema.org", "@type": "Organization", name: BUSINESS, url: origin, email: b.email, telephone: b.phone, address: { "@type": "PostalAddress", streetAddress: b.address.join(", "), addressCountry: "IN" } };
}
const crumbs = (origin: string, items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: origin + path })),
});
const fullTitle = (t: string) => (t.includes(BUSINESS) ? t : `${t} | ${BUSINESS}`);
const list = (cat: PublicCatalogue, items: PublicProduct[]) =>
  items.length ? `<ul>${items.map((p) => `<li><a href="/products/${esc(p.slug)}">${esc(p.name)}</a>${p.short ? `: ${esc(p.short)}` : ""}</li>`).join("")}</ul>` : `<p>New products are being added. Please contact us for availability.</p>`;

function notFound(origin: string, what: string): Live {
  return {
    title: `${what} not found`,
    description: `This ${what.toLowerCase()} is no longer listed. Browse the current catalogue.`,
    canonical: `${origin}/products`,
    jsonld: [],
    body: `${nav}<h1>${esc(what)} not found</h1><p>It may have been removed or renamed. <a href="/products">See all current products</a>.</p>`,
    status: 404,
    noindex: true,
  };
}

function productLive(p: PublicProduct, cat: PublicCatalogue, origin: string): Live {
  const brand = cat.brands.find((b) => b.id === p.brandId)?.name ?? "";
  const c = cat.categories.find((x) => x.id === p.categoryId);
  const price = p.price.sellingPaise != null ? `${formatPaise(p.price.sellingPaise)} ${p.price.unit}. ` : "";
  const groups = new Map<string, PublicProduct["specs"]>();
  for (const s of p.specs) groups.set(s.g, [...(groups.get(s.g) ?? []), s]);
  const specs = [...groups].map(([g, rows]) => `<h3>${esc(g)}</h3><table><tbody>${rows.map((s) => `<tr><th scope="row">${esc(s.l)}</th><td>${esc(s.v)}${s.u ? " " + esc(s.u) : ""}</td></tr>`).join("")}</tbody></table>`).join("");
  const siblings = p.seriesKey ? cat.products.filter((x) => x.seriesKey === p.seriesKey && x.id !== p.id) : [];
  return {
    title: `${p.name}${p.model ? ` (${p.model})` : ""}${brand ? ` — ${brand}` : ""} | ${BUSINESS}`,
    description: `${price}${brand} ${p.short ?? p.name}. Specifications, datasheet and WhatsApp enquiry.`.slice(0, 300),
    canonical: `${origin}/products/${p.slug}`,
    image: absolute(origin, p.images[0]?.url ?? DEFAULT_IMAGE),
    ogType: "product",
    jsonld: productJsonLd(p, cat, origin),
    product: p,
    body: `${nav}<article><p>${esc(brand)}${c ? ` · <a href="/category/${esc(c.slug)}">${esc(c.name)}</a>` : ""}</p><h1>${esc(p.name)}</h1>${p.model ? `<p>Model: ${esc(p.model)} · SKU: ${esc(p.sku)}</p>` : ""}${p.description ? `<p>${esc(p.description)}</p>` : ""}${p.highlights.length ? `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}${specs ? `<h2>Technical specifications</h2>${specs}` : ""}${p.datasheet ? `<p><a href="${esc(p.datasheet)}">Manufacturer datasheet (PDF)</a></p>` : ""}${siblings.length ? `<h2>Other ratings in this family</h2>${list(cat, siblings)}` : ""}<p>${p.price.sellingPaise != null ? `Price: ${esc(formatPaise(p.price.sellingPaise))} ${esc(p.price.unit)}.` : "Price on request."} ${esc(STOCK_LABEL[p.stock ?? "in_stock"])}.${p.offer ? ` ${esc(p.offer.label || "Special offer")}.` : ""} Send an enquiry for confirmed pricing.</p></article>${contactHtml(cat)}`,
  };
}

/** What to show for a path, from the live catalogue (null = not a catalogue page). */
function liveFor(path: string, cat: PublicCatalogue, origin: string): Live | null {
  const brandsOf = (items: PublicProduct[]) => [...new Set(items.map((p) => cat.brands.find((b) => b.id === p.brandId)?.name).filter(Boolean))].join(", ");
  if (path === "/") {
    const cats = cat.categories.filter((c) => cat.products.some((p) => p.categoryId === c.id));
    return {
      title: `${BUSINESS} — Solar panels, inverters & solar electricals for businesses`,
      description: "B2B supplier of solar panels, inverters, solar DC cables and solar electrical components in Chennai. Browse real datasheets, compare specifications and send a WhatsApp enquiry.",
      canonical: `${origin}/`,
      jsonld: [organization(cat, origin)],
      body: `${nav}<h1>Power your next solar project.</h1><p>B2B supplier of solar products for dealers, installers, EPC contractors and businesses${cat.brands.length ? ` (${esc(cat.brands.map((b) => b.name).join(", "))})` : ""}. Every model links to its manufacturer datasheet.</p>${cats.length ? `<h2>Product categories</h2><ul>${cats.map((c) => `<li><a href="/category/${esc(c.slug)}">${esc(c.name)}</a>${c.description ? `: ${esc(c.description)}` : ""}</li>`).join("")}</ul>` : ""}${contactHtml(cat)}`,
    };
  }
  if (path === "/products") {
    return {
      title: "Solar products catalogue",
      description: `${cat.products.length} solar products${cat.brands.length ? ` from ${cat.brands.map((b) => b.name).join(", ")}` : ""}: search by wattage, kW, phase and model, with manufacturer datasheets.`.slice(0, 300),
      canonical: `${origin}/products`,
      jsonld: [crumbs(origin, [["Home", "/"], ["Products", "/products"]])],
      body: `${nav}<h1>All products</h1>${list(cat, cat.products)}`,
    };
  }
  if (path === "/faq") {
    const faqs = cat.faqs ?? [];
    return {
      title: "Questions & answers",
      description: faqs.length ? `Answers from ${BUSINESS}: ${faqs.slice(0, 3).map((f) => f.q).join(" · ")}`.slice(0, 300) : `Questions about solar products from ${BUSINESS}? Ask us on WhatsApp or by phone.`,
      canonical: `${origin}/faq`,
      jsonld: [
        crumbs(origin, [["Home", "/"], ["Questions & answers", "/faq"]]),
        ...(faqs.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
      ],
      body: `${nav}<h1>Questions &amp; answers</h1>${faqs.map((f) => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join("")}${contactHtml(cat)}`,
    };
  }
  const m = path.match(/^\/(category|products)\/([^/]+)\/?$/);
  if (m) {
    const slug = decodeURIComponent(m[2]);
    if (m[1] === "products") {
      const p = cat.products.find((x) => x.slug === slug);
      return p ? productLive(p, cat, origin) : notFound(origin, "Product");
    }
    const c = cat.categories.find((x) => x.slug === slug);
    if (!c) return notFound(origin, "Category");
    const items = cat.products.filter((p) => p.categoryId === c.id);
    return {
      title: `${c.name} — products & prices`,
      description: (items.length ? `${c.name} from ${brandsOf(items)}: ${items.length} models with specifications and manufacturer datasheets. ${c.description ?? ""}` : `${c.name}: ${c.description ?? ""} Contact ${BUSINESS} for current availability and pricing.`).trim().slice(0, 300),
      canonical: `${origin}/category/${c.slug}`,
      image: absolute(origin, items.find((p) => p.images[0])?.images[0]?.url ?? DEFAULT_IMAGE),
      jsonld: [crumbs(origin, [["Home", "/"], ["Products", "/products"], [c.name, `/category/${c.slug}`]])],
      body: `${nav}<h1>${esc(c.name)}</h1>${c.description ? `<p>${esc(c.description)}</p>` : ""}${list(cat, items)}`,
    };
  }
  const lp = LOCAL_PAGES.find((x) => `/${x.slug}` === path);
  if (lp) {
    const items = localProducts(lp.categories, cat);
    return {
      title: lp.metaTitle,
      description: lp.description,
      canonical: `${origin}/${lp.slug}`,
      jsonld: [
        organization(cat, origin),
        crumbs(origin, [["Home", "/"], [lp.title, `/${lp.slug}`]]),
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: lp.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      ],
      body: `${nav}<h1>${esc(lp.title)}</h1><p>${esc(lp.intro)}</p><h2>Products</h2>${list(cat, items)}<h2>Frequently asked questions</h2>${lp.faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}${contactHtml(cat)}`,
    };
  }
  return null;
}

/** Serve a catalogue page with live title, tags, JSON-LD and crawler content (never fails the page itself). */
export async function livePage(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  if (request.method !== "GET" || !asset.ok || !(asset.headers.get("Content-Type") ?? "").includes("text/html")) return asset;
  const url = new URL(request.url);
  let live: Live | null;
  try {
    live = liveFor(url.pathname.replace(/\/+$/, "") || "/", await catalogue(env, ctx), url.origin);
  } catch {
    return asset; // never break the page because of SEO extras
  }
  if (!live) return asset;
  const title = fullTitle(live.title);
  const tags = [
    `<meta name="description" content="${esc(live.description)}" />`,
    `<link rel="canonical" href="${esc(live.canonical)}" />`,
    live.noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    `<meta property="og:type" content="${live.ogType ?? "website"}" />`,
    `<meta property="og:site_name" content="${BUSINESS}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(live.description)}" />`,
    `<meta property="og:url" content="${esc(live.canonical)}" />`,
    `<meta property="og:image" content="${esc(live.image ?? absolute(url.origin, DEFAULT_IMAGE))}" />`,
    live.product ? `<meta property="og:image:alt" content="${esc(live.product.images[0]?.alt ?? live.product.name)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...(live.product?.price.sellingPaise != null
      ? [`<meta property="product:price:amount" content="${(live.product.price.sellingPaise / 100).toFixed(2)}" />`, `<meta property="product:price:currency" content="INR" />`]
      : []),
    ...live.jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ]
    .filter(Boolean)
    .join("\n    ");
  const remove = {
    element: (el: Element) => {
      el.remove();
    },
  };
  let filled = false;
  const res = new HTMLRewriter()
    .on("title", {
      element: (el) => {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', remove)
    .on('meta[name="robots"]', remove)
    .on('meta[property^="og:"]', remove)
    .on('meta[property^="product:"]', remove)
    .on('meta[name^="twitter:"]', remove)
    .on('link[rel="canonical"]', remove)
    .on('script[type="application/ld+json"]', remove)
    .on("head", {
      element: (el) => {
        el.append(tags, { html: true });
      },
    })
    // the readable content for crawlers (the app replaces it when it starts)
    .on("#prerender", {
      element: (el) => {
        filled = true;
        el.removeAttribute("class");
        el.setAttribute("style", CRAWLER_TEXT_STYLE);
        el.setInnerContent(live!.body, { html: true });
      },
    })
    .on("#root", {
      element: (el) => {
        el.onEndTag((end) => {
          if (!filled) end.before(`<div id="prerender" style="${CRAWLER_TEXT_STYLE}">${live!.body}</div>`, { html: true });
        });
      },
    })
    .transform(asset);
  const out = new Response(res.body, { status: live.status ?? 200, headers: res.headers });
  out.headers.set("Cache-Control", "public, max-age=0, must-revalidate"); // live catalogue and prices
  for (const [k, v] of Object.entries(PAGE_SECURITY_HEADERS)) {
    // The local dev server injects an inline start-up script (React refresh) that a strict CSP
    // blocks, leaving a blank page. Production builds have no inline scripts, so the CSP stays there.
    if (k === "Content-Security-Policy" && env.ENVIRONMENT === "development") continue;
    out.headers.set(k, v);
  }
  out.headers.delete("ETag");
  if (live.noindex || env.ENVIRONMENT === "test") out.headers.set("X-Robots-Tag", "noindex, nofollow"); // test site: never in search results
  return out;
}

/** sitemap.xml = static routes from the build (routes.json) + every live product and category. */
export async function sitemap(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = new URL(request.url).origin;
  const paths = new Set<string>(LIVE_PATHS); // home, all products and the local landing pages
  try {
    const r = await env.ASSETS.fetch(new Request(`${origin}/routes.json`));
    if (r.ok) for (const p of (await r.json()) as string[]) if (!/^\/(products|category)\//.test(p)) paths.add(p);
  } catch {
    /* build without routes.json */
  }
  try {
    const cat = await catalogue(env, ctx);
    for (const c of cat.categories) paths.add(`/category/${c.slug}`);
    for (const p of cat.products) paths.add(`/products/${p.slug}`);
  } catch {
    /* catalogue unavailable: static routes only */
  }
  const day = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...paths]
    .map((p) => `  <url><loc>${esc(origin + p)}</loc><lastmod>${day}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

export function robots(request: Request, env?: { ENVIRONMENT?: string }): Response {
  // the test site (dummy data) must never be indexed by search engines
  if (env?.ENVIRONMENT === "test") return new Response(["User-agent: *", "Disallow: /"].join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const origin = new URL(request.url).origin;
  const body = ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /account", "Disallow: /api/", "Disallow: /enquiry", `Sitemap: ${origin}/sitemap.xml`].join("\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
