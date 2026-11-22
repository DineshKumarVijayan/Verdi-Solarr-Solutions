// Build-time static prerendering for SEO (runs after `vite build`).
//
// For every public route we write a static HTML file containing a unique <title>,
// meta description, canonical URL, Open Graph tags, JSON-LD and readable semantic
// content (headings, descriptions, specification tables, internal links). Crawlers
// and link previews get real content; the React app replaces it on boot.
//
// Files are written as `<route>.html` so Cloudflare's `auto-trailing-slash` asset
// handling serves /products/x from products/x.html WITHOUT a redirect, and with
// ZERO Worker invocations. Live prices are intentionally NOT baked in (they change
// in D1 without a rebuild).
//
// Set SITE_URL (e.g. https://www.example.in) in the build environment to emit absolute
// canonical URLs, sitemap.xml and the robots.txt Sitemap line.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brands, categories, flattenProducts, series } from "../data/catalogue.mjs";
const lessonData = JSON.parse(readFileSync("data/lessons.json", "utf8"));
const localPages = JSON.parse(readFileSync("data/local-pages.json", "utf8")).pages;

const OUT = "dist/client";
const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
const template = readFileSync(join(OUT, "index.html"), "utf8");
const BUSINESS = {
  name: "VERDI SOLARR SOLUTION",
  phone: "+91 8939277997",
  email: "Verdisolarrsolution@gmail.com",
  street: "#229, Bajanai Koil Street, Nemam",
  city: "Chennai",
  postal: "600124",
  region: "Tamil Nadu",
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (p) => (SITE_URL ? SITE_URL + p : p);
const products = flattenProducts();
const brandName = Object.fromEntries(brands.map((b) => [b.slug, b.name]));
const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));
const urls = [];

function page(route, { title, description, body, jsonld = [], noindex = false, image }) {
  const fullTitle = title.includes("VERDI") ? title : `${title} | VERDI SOLARR SOLUTION`;
  const head = [
    `<meta name="description" content="${esc(description)}" />`,
    SITE_URL ? `<link rel="canonical" href="${esc(abs(route))}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="VERDI SOLARR SOLUTION" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    SITE_URL ? `<meta property="og:url" content="${esc(abs(route))}" />` : "",
    `<meta property="og:image" content="${esc(abs(image ?? "/media/hero-solar-farm-golden-1200.webp"))}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    ...jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ]
    .filter(Boolean)
    .join("\n    ");
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`)
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("<!--seo-->", head)
    // crawler text: in the HTML for search engines, visually hidden so visitors never see it flash
    .replace("<!--prerender-->", `<div id="prerender" style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0">${body}</div>`);
  const file = route === "/" ? join(OUT, "index.html") : join(OUT, `${route.slice(1)}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  if (!noindex) urls.push(route);
}

const nav = `<nav aria-label="Site"><a href="/">Home</a> · <a href="/products">Products</a> · <a href="/learn">Learn</a> · <a href="/solar-tools">Solar tools</a> · <a href="/contact">Contact</a></nav>`;
const contact = `<address>VERDI SOLARR SOLUTION, ${esc(BUSINESS.street)}, ${BUSINESS.city} – ${BUSINESS.postal}, ${BUSINESS.region}, India. Phone / WhatsApp: <a href="tel:+918939277997">${BUSINESS.phone}</a>. Email: <a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a>.</address>`;
const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BUSINESS.name,
  ...(SITE_URL ? { url: SITE_URL } : {}),
  email: BUSINESS.email,
  telephone: BUSINESS.phone,
  address: { "@type": "PostalAddress", streetAddress: BUSINESS.street, addressLocality: BUSINESS.city, postalCode: BUSINESS.postal, addressRegion: BUSINESS.region, addressCountry: "IN" },
};
const crumbs = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, ...(SITE_URL ? { item: abs(path) } : {}) })),
});

// ---------------------------------------------------------------- home
page("/", {
  title: "VERDI SOLARR SOLUTION — Solar panels, inverters & solar electricals for businesses",
  description: "B2B supplier of solar panels, inverters, solar DC cables and solar electrical components in Chennai. Browse real datasheets, compare specifications and send a WhatsApp enquiry.",
  jsonld: [organization],
  body: `${nav}<h1>Power your next solar project.</h1><p>B2B supplier of solar modules, inverters, power optimisers, solar DC cables and solar street lights for dealers, installers, EPC contractors and businesses. Every model links to its manufacturer datasheet.</p><h2>Product categories</h2><ul>${categories.map((c) => `<li><a href="/category/${c.slug}">${esc(c.name)}</a>: ${esc(c.description)}</li>`).join("")}</ul>${contact}`,
});

// ------------------------------------------------------- product index
page("/products", {
  title: "Solar products catalogue",
  description: "Search solar panels, inverters, optimisers, solar DC cables and street lights by wattage, kW, phase and model. Real manufacturer datasheets.",
  jsonld: [crumbs([["Home", "/"], ["Products", "/products"]])],
  body: `${nav}<h1>All products</h1><ul>${products.map((p) => `<li><a href="/products/${p.slug}">${esc(p.name)}</a> (${esc(brandName[p.brand])}${p.model ? `, model ${esc(p.model)}` : ""})</li>`).join("")}</ul>`,
});

// Category and product pages are NOT prerendered: the Worker (worker/seo.ts) fills them from the live
// catalogue, so products and categories added, renamed or deleted in the admin are always current.

// ------------------------------------------------------- local landing pages
for (const lp of localPages) {
  const items = products.filter((p) => lp.categories.length === 0 || lp.categories.includes(p.category));
  page(`/${lp.slug}`, {
    title: lp.metaTitle,
    description: lp.description,
    jsonld: [
      organization,
      crumbs([["Home", "/"], [lp.title, `/${lp.slug}`]]),
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: lp.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
    body: `${nav}<h1>${esc(lp.title)}</h1><p>${esc(lp.intro)}</p><h2>Products</h2><ul>${items.map((p) => `<li><a href="/products/${p.slug}">${esc(p.name)}</a>: ${esc(p.short)}</li>`).join("")}</ul><h2>Frequently asked questions</h2>${lp.faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}${contact}`,
  });
}

// ------------------------------------------------------------ static pages
page("/learn", {
  title: "Solar Learning Hub — TOPCon vs PERC, MPPT, datasheets, ACDB/DCDB",
  description: "Visual, interactive solar explanations: how panels and inverters work, on-grid vs hybrid, TOPCon vs PERC, bifacial modules, MPPT, datasheet terms, cables, earthing, degradation and myths.",
  body: `${nav}<h1>Solar Learning Hub</h1><ul>${lessonData.lessons.map((l) => `<li><a href="/learn/${l.slug}">${esc(l.title)}</a>: ${esc(l.summary)}</li>`).join("")}</ul>`,
});
for (const l of lessonData.lessons) {
  page(`/learn/${l.slug}`, {
    title: `${l.title} — Solar Learning Hub`,
    description: l.summary,
    jsonld: [{ "@context": "https://schema.org", "@type": "LearningResource", name: l.title, description: l.summary, timeRequired: `PT${l.minutes}M`, inLanguage: "en-IN", isAccessibleForFree: true, educationalLevel: "Beginner to intermediate" }, crumbs([["Home", "/"], ["Learn", "/learn"], [l.title, `/learn/${l.slug}`]])],
    body: `${nav}<article><h1>${esc(l.title)}</h1><p>${esc(l.summary)}</p><h2>Key takeaways</h2><ul>${l.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p><a href="/learn">All solar lessons</a></p></article>`,
  });
}
const tools = [
  ["consumption", "Appliance consumption calculator", "Estimate daily and monthly kWh and your electricity bill from your appliances."],
  ["sizing", "Solar capacity & savings calculator", "Estimate the solar system size, generation, savings and payback for your consumption."],
  ["roof", "Roof space calculator", "See how many solar modules fit on your roof using real module dimensions."],
  ["kit-builder", "Solar kit builder", "Assemble modules, inverter, optimisers and cable with datasheet-based compatibility checks."],
  ["battery", "Battery backup calculator", "Estimate battery runtime from capacity, depth of discharge, efficiency and load."],
  ["losses", "Solar loss explorer", "See how dust, shading, temperature and conversion losses affect output."],
  ["orientation", "Roof tilt & orientation explorer", "Compare panel tilt and direction against the best orientation for your latitude."],
  ["system-explorer", "Solar system explorer", "Interactive map of solar system components and what each one does."],
  ["datasheet-decoder", "Datasheet decoder", "Voc, Isc, Vmp, Imp, MPPT, efficiency and temperature coefficients explained."],
];
page("/solar-tools", {
  title: "Solar tools — calculators for load, sizing, savings, roof space and more",
  description: "Free solar calculators that run in your browser: appliance load, system size and savings, roof space, kit builder, battery backup, losses and orientation.",
  body: `${nav}<h1>Solar tools</h1><ul>${tools.map(([id, t, d]) => `<li><a href="/solar-tools/${id}">${esc(t)}</a>: ${esc(d)}</li>`).join("")}</ul>`,
});
for (const [id, t, d] of tools) page(`/solar-tools/${id}`, { title: `${t} — Solar tools`, description: d, body: `${nav}<h1>${esc(t)}</h1><p>${esc(d)}</p>` });
page("/contact", {
  title: "Contact VERDI SOLARR SOLUTION",
  description: `Call or WhatsApp ${BUSINESS.phone}, email ${BUSINESS.email}. ${BUSINESS.street}, ${BUSINESS.city} – ${BUSINESS.postal}.`,
  jsonld: [organization],
  body: `${nav}<h1>Contact VERDI SOLARR SOLUTION</h1>${contact}`,
});
page("/in-the-field", {
  title: "In the field — solar hardware on Indian rooftops",
  description: "Photos of solar modules, inverters, junction boxes and mounting in real rooftop installations, plus manufacturer quality testing.",
  body: `${nav}<h1>In the field</h1><p>Solar modules, inverters, junction boxes and mounting structures installed on Indian rooftops, and Panasonic module quality testing.</p>`,
});
page("/enquiry", { title: "Enquiry basket", description: "Review your product enquiry and send it on WhatsApp.", noindex: true, body: `${nav}<h1>Enquiry basket</h1>` });
page("/compare", { title: "Compare solar products", description: "Compare specifications side by side.", noindex: true, body: `${nav}<h1>Compare products</h1>` });

// ------------------------------------------------------- robots & sitemap
writeFileSync(
  join(OUT, "robots.txt"),
  ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /api/", "Disallow: /enquiry", SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml` : ""].filter(Boolean).join("\n") + "\n",
);
if (SITE_URL) {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(abs(u))}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
}
writeFileSync(join(OUT, "routes.json"), JSON.stringify(urls)); // used by the Worker's live sitemap.xml
console.log(`prerendered ${urls.length} indexable routes${SITE_URL ? ` (sitemap for ${SITE_URL})` : " — set SITE_URL to emit canonical URLs and sitemap.xml"}`);
