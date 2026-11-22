// The staff helper inside the admin. It never holds data of its own: it opens the right admin page
// (where the server applies each role's rules), reads the person's OWN "My day" through the same
// endpoint the dashboard uses, and answers product questions from the public catalogue. Owner/admin
// topics are not offered to other roles, and asking for them only gets a polite "owner or admin only".

import { reply, type HelperAnswer, type HelperContext, type HelperLink, type Lang } from "./assistant";
import type { AdminRole } from "./types";

export interface StaffContext extends HelperContext {
  role: AdminRole;
}

const MANAGERS: AdminRole[] = ["owner", "admin"];
const PRICE_ROLES: AdminRole[] = ["owner", "admin", "price_editor"];

interface Guide {
  words: string[];
  roles?: AdminRole[];
  en: string;
  ta: string;
  link?: HelperLink & { ta?: string };
}

/** How-to answers about the admin itself (what the buttons do), filtered by role. */
const GUIDES: Guide[] = [
  {
    words: ["send quotation", "send quote", "share quotation", "whatsapp quotation", "quotation whatsapp", "send the pdf", "quotation pdf", "எப்படி அனுப்ப"],
    en: "Open the quotation and tap WhatsApp. The PDF link goes to the customer's chat and the quotation is marked Sent. Download saves the PDF.",
    ta: "Quotation-ஐ திறந்து WhatsApp அழுத்துங்கள். PDF இணைப்பு வாடிக்கையாளருக்கு செல்லும், quotation 'Sent' ஆகும். Download அழுத்தினால் PDF சேமிக்கப்படும்.",
    link: { label: "Quotations", to: "/admin/quotations" },
  },
  {
    words: ["follow up", "follow-up", "followup", "reminder", "remind", "call back later"],
    en: "Open the enquiry and set a follow-up date. On that day it shows in My day; overdue ones come first.",
    ta: "Enquiry-ஐ திறந்து follow-up தேதி வையுங்கள். அந்த நாளில் My day-ல் வரும்; தாமதமானவை முதலில் காட்டப்படும்.",
    link: { label: "My follow-ups", to: "/admin/enquiries?owner=me&followup=overdue", ta: "என் follow-ups" },
  },
  {
    words: ["take enquiry", "take an enquiry", "assign to me", "unassigned", "not taken", "new enquiry", "new enquiries", "புதிய enquiries"],
    en: "New enquiries that nobody has taken are listed under “New, not taken”. Open one and take it; it becomes yours.",
    ta: "யாரும் எடுக்காத புதிய enquiries “New, not taken”-ல் இருக்கும். ஒன்றைத் திறந்து எடுத்துக்கொள்ளுங்கள்; அது உங்களுடையதாகும்.",
    link: { label: "New, not taken", to: "/admin/enquiries?owner=none&status=new" },
  },
  {
    words: ["won", "mark won", "not won", "lost", "close enquiry", "closed", "cancel enquiry"],
    en: "Open the enquiry and change its status: Won when the customer buys, or Not won with a reason.",
    ta: "Enquiry-ஐ திறந்து நிலையை மாற்றுங்கள்: வாங்கினால் Won, இல்லையெனில் காரணத்துடன் Not won.",
    link: { label: "My enquiries", to: "/admin/enquiries?owner=me", ta: "என் enquiries" },
  },
  {
    words: ["log enquiry", "log an enquiry", "add enquiry", "phone enquiry", "walk in", "walk-in", "new lead", "add lead", "enquiry பதிவு"],
    en: "Use “Log an enquiry” for a customer who called, messaged or visited. It is assigned to you.",
    ta: "அழைத்த, செய்தி அனுப்பிய அல்லது நேரில் வந்த வாடிக்கையாளருக்கு “Log an enquiry” பயன்படுத்துங்கள். அது உங்களுக்கு ஒதுக்கப்படும்.",
    link: { label: "Log an enquiry", to: "/admin/enquiries?log=1" },
  },
  {
    words: ["excel", "download", "export", "spreadsheet", "offline"],
    en: "Lists have a Download Excel button at the top. It saves what you can see; every download is recorded.",
    ta: "பட்டியல்களின் மேலே Download Excel உள்ளது. நீங்கள் பார்ப்பதை சேமிக்கும்; ஒவ்வொரு download-உம் பதிவு செய்யப்படும்.",
  },
  {
    words: ["my bonus", "bonus", "incentive", "commission"],
    roles: ["price_editor", "viewer"],
    en: "Your bonus page shows your own bonus entries and payouts.",
    ta: "உங்கள் bonus பக்கத்தில் உங்கள் bonus மற்றும் payouts மட்டும் காட்டப்படும்.",
    link: { label: "My bonus", to: "/admin/my-bonus" },
  },
  {
    words: ["change price", "update price", "edit price", "change prices", "update prices"],
    roles: PRICE_ROLES,
    en: "Prices are changed in Prices. The website updates as soon as you save.",
    ta: "விலைகளை Prices-ல் மாற்றலாம். சேமித்தவுடன் இணையதளம் புதுப்பிக்கப்படும்.",
    link: { label: "Prices", to: "/admin/prices" },
  },
  {
    words: ["stock status", "change stock", "mark out of stock", "set offer", "add offer", "remove offer", "change offer"],
    roles: MANAGERS,
    en: "In Products, use the quick status on each row (In stock / Limited / Out of stock) and the offer switch.",
    ta: "Products-ல் ஒவ்வொரு வரியிலும் stock நிலை (In stock / Limited / Out of stock) மற்றும் offer-ஐ மாற்றலாம்.",
    link: { label: "Products", to: "/admin/products" },
  },
  {
    words: ["add product", "new product", "upload datasheet", "product photo", "add photo"],
    roles: MANAGERS,
    en: "Add or edit products, photos and datasheets in Products.",
    ta: "பொருட்கள், படங்கள் மற்றும் datasheets-ஐ Products-ல் சேர்க்கலாம்/மாற்றலாம்.",
    link: { label: "Add a product", to: "/admin/products/new" },
  },
  {
    words: ["faq", "faqs", "question and answer", "questions and answers", "helper answer", "add question"],
    roles: MANAGERS,
    en: "Questions & answers are in Settings. They show on the FAQ page and the website helper answers with them.",
    ta: "Questions & answers Settings-ல் உள்ளன. அவை FAQ பக்கத்திலும் website helper-லும் காட்டப்படும்.",
    link: { label: "Questions & answers", to: "/admin/settings#faqs" },
  },
  {
    words: ["whatsapp message", "message template", "templates", "review link"],
    roles: MANAGERS,
    en: "The ready WhatsApp messages are edited in Settings → WhatsApp messages.",
    ta: "WhatsApp செய்திகளை Settings → WhatsApp messages-ல் மாற்றலாம்.",
    link: { label: "Settings", to: "/admin/settings" },
  },
  {
    words: ["reassign", "transfer enquiry", "move enquiries", "bulk"],
    roles: MANAGERS,
    en: "In Enquiries, select several enquiries and use the reassign bar at the bottom.",
    ta: "Enquiries-ல் பல enquiries-ஐ தேர்ந்தெடுத்து கீழே உள்ள reassign பட்டையை பயன்படுத்துங்கள்.",
    link: { label: "Enquiries", to: "/admin/enquiries" },
  },
  {
    words: ["loyalty", "points", "reward", "customer points", "add points"],
    roles: MANAGERS,
    en: "Open the customer in Customers to add or remove points. The points percentage is set there too.",
    ta: "Customers-ல் வாடிக்கையாளரைத் திறந்து புள்ளிகளை சேர்க்கலாம்/குறைக்கலாம். புள்ளி சதவீதமும் அங்கேயே.",
    link: { label: "Customers", to: "/admin/customers" },
  },
  {
    words: ["staff bonus", "approve bonus", "pay bonus", "bonus rate", "payout", "bonus"],
    roles: MANAGERS,
    en: "Approve and pay staff bonus in Staff bonus.",
    ta: "Staff bonus-ல் bonus-ஐ அங்கீகரித்து செலுத்தலாம்.",
    link: { label: "Staff bonus", to: "/admin/bonus" },
  },
  {
    words: ["performance", "report", "sales report", "conversion"],
    roles: MANAGERS,
    en: "Performance shows enquiries, quotations and wins by staff member.",
    ta: "Performance-ல் ஒவ்வொரு பணியாளரின் enquiries, quotations மற்றும் வெற்றிகள் காட்டப்படும்.",
    link: { label: "Performance", to: "/admin/performance" },
  },
  {
    words: ["add staff", "new staff", "staff account", "user account", "reset staff password", "deactivate staff"],
    roles: ["owner"],
    en: "Staff accounts are managed by the owner in Staff.",
    ta: "பணியாளர் கணக்குகளை owner Staff பக்கத்தில் நிர்வகிக்கலாம்.",
    link: { label: "Staff", to: "/admin/users" },
  },
];

/** Words that point at owner/admin-only information. */
const RESTRICTED = ["other staff", "all staff", "staff bonus", "their bonus", "salary", "staff performance", "performance report", "customer list", "customer accounts", "audit", "staff accounts", "users", "site settings", "settings", "loyalty percentage", "points percentage", "reassign", "payout", "payouts"];

const T = {
  en: {
    myday: "Here's your day:",
    only: "That's only available to the owner or an admin.",
    onlyOwner: "That's only available to the owner.",
    newQuote: (n: string) => (n ? `A new quotation for ${n} is ready to fill in:` : "Start a new quotation:"),
    openQuote: "New quotation",
    findRef: (r: string) => `Open ${r}:`,
    findMobile: (m: string) => `Search for ${m}:`,
    enquiries: "Enquiries",
    quotations: "Quotations",
    chipMyDay: "My day",
    chipOverdue: "Overdue follow-ups",
    chipNew: "New enquiries",
    chipQuote: "New quotation",
    chipLog: "Log an enquiry",
    chipSend: "How do I send a quotation?",
    chipOffers: "Today's offers",
  },
  ta: {
    myday: "உங்கள் இன்றைய வேலை:",
    only: "இது owner அல்லது admin-க்கு மட்டுமே.",
    onlyOwner: "இது owner-க்கு மட்டுமே.",
    newQuote: (n: string) => (n ? `${n}-க்கு புதிய quotation தயார்:` : "புதிய quotation தொடங்குங்கள்:"),
    openQuote: "புதிய quotation",
    findRef: (r: string) => `${r} திற:`,
    findMobile: (m: string) => `${m} தேடு:`,
    enquiries: "Enquiries",
    quotations: "Quotations",
    chipMyDay: "என் இன்றைய வேலை",
    chipOverdue: "தாமதமான follow-ups",
    chipNew: "புதிய enquiries",
    chipQuote: "புதிய quotation",
    chipLog: "Enquiry பதிவு செய்",
    chipSend: "Quotation எப்படி அனுப்புவது?",
    chipOffers: "இன்றைய சலுகைகள்",
  },
};

const plain = (q: string) => ` ${q.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim()} `;
const hasAny = (p: string, words: string[]) => words.some((w) => (/[஀-௿]/.test(w) ? p.includes(w) : p.includes(` ${w} `)));

export function staffWelcome(ctx: StaffContext): HelperAnswer {
  const t = T[ctx.lang];
  const hello = ctx.lang === "ta" ? "வணக்கம்! பொருட்கள், விலை, உங்கள் இன்றைய வேலை அல்லது admin-ல் ஏதாவது செய்வது எப்படி என்று கேளுங்கள்." : "Hi! Ask me about products and prices, your day, or how to do something in the admin.";
  return { text: hello, chips: [t.chipMyDay, t.chipOverdue, t.chipNew, t.chipQuote, t.chipLog, t.chipSend, ...(ctx.cat.products.some((p) => p.offer) ? [t.chipOffers] : [])] };
}

const guideFor = (g: Guide, lang: Lang): HelperAnswer => ({ text: lang === "ta" ? g.ta : g.en, links: g.link ? [{ label: lang === "ta" && g.link.ta ? g.link.ta : g.link.label, to: g.link.to }] : undefined });

export function staffReply(question: string, ctx: StaffContext): HelperAnswer {
  const t = T[ctx.lang];
  const q = question.trim().slice(0, 300);
  const p = plain(q);
  if (!q || (hasAny(p, ["hi", "hello", "hey", "help", "menu", "வணக்கம்"]) && p.trim().split(" ").length <= 2)) return staffWelcome(ctx);
  const manager = MANAGERS.includes(ctx.role);

  // a reference or mobile number: open the list filtered to it (the server shows only what this person may see)
  const quoteRef = q.match(/\bVSQ-[A-Z0-9-]{3,}\b/i)?.[0];
  if (quoteRef) return { text: t.findRef(quoteRef.toUpperCase()), links: [{ label: t.quotations, to: `/admin/quotations?q=${encodeURIComponent(quoteRef.toUpperCase())}` }] };
  const enqRef = q.match(/\bVS-[A-Z0-9-]{3,}\b/i)?.[0];
  if (enqRef) return { text: t.findRef(enqRef.toUpperCase()), links: [{ label: t.enquiries, to: `/admin/enquiries?q=${encodeURIComponent(enqRef.toUpperCase())}` }] };
  const mobile = q.replace(/[\s-]/g, "").match(/(?:\+?91)?([6-9]\d{9})/)?.[1];

  // new quotation ("new quote for Ravi 98400 12345")
  if (/\b(new|create|make|start|prepare)\b.*\bquot(e|ation)s?\b|புதிய quotation/i.test(q)) {
    const name = q.match(/\bfor\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s*(?:\+?91)?[6-9]\d|\s*$|,)/i)?.[1]?.trim() ?? "";
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (mobile) params.set("mobile", mobile);
    const qs = params.toString();
    return { text: t.newQuote(name), links: [{ label: t.openQuote, to: `/admin/quotations/new${qs ? `?${qs}` : ""}` }] };
  }
  if (mobile) return { text: t.findMobile(mobile), links: [{ label: t.enquiries, to: `/admin/enquiries?q=${mobile}` }, { label: t.quotations, to: `/admin/quotations?q=${mobile}` }] };

  // offers are catalogue answers (checked first: "today's offers" is not "my day")
  if (hasAny(p, ["offer", "offers", "discount", "deals", "சலுகை", "தள்ளுபடி"]) && !hasAny(p, ["set offer", "add offer", "remove offer", "change offer"])) return reply(q, { ...ctx, staff: true });

  // my day (the person's own work, from the same endpoint as the dashboard)
  if (hasAny(p, ["my day", "overdue", "pending", "due today", "follow up today", "to do", "todo", "expiring", "my work", "my tasks", "தாமத", "இன்றைய வேலை"])) return { text: t.myday, need: "myday" };

  // how-to guides: the most specific match wins; one this role may not use gets "owner/admin only"
  let g: Guide | null = null;
  let best = 0;
  for (const x of GUIDES) {
    const len = Math.max(0, ...x.words.filter((w) => hasAny(p, [w])).map((w) => w.length));
    if (len > best) (best = len), (g = x);
  }
  if (g) {
    if (!g.roles || g.roles.includes(ctx.role)) return guideFor(g, ctx.lang);
    return { text: g.roles.every((r) => r === "owner") ? t.onlyOwner : t.only };
  }

  // owner/admin topics asked by someone else: no data, no links
  if (!manager && hasAny(p, RESTRICTED)) return { text: t.only };

  // everything else: products, prices, offers, lessons (public catalogue) and the owner's answers
  return reply(q, { ...ctx, staff: true });
}
