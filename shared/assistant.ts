// The website helper ("VERDI Helper"): answers questions from the live catalogue, the owner's
// questions & answers, the site's contact details, lessons and calculators. No AI, no server calls:
// everything here is a pure function of data the visitor's browser already has, so it can never make
// up a fact and never shows anything that is not public. It only reads; it never sends or changes data.

import { requiredCapacityKwp, residentialSubsidy, savingsEstimate } from "./calculators";
import { formatPaise } from "./money";
import { normalise, scoreItem, type IndexedProduct } from "./search";
import { percentOff, type StockStatus } from "./stock";
import type { PublicCatalogue, PublicFaq, PublicProduct } from "./types";

export type Lang = "en" | "ta";

export interface HelperLink {
  label: string;
  /** site path ("/products/…"), https:// link, tel: or mailto: */
  to: string;
}

export interface HelperAnswer {
  text: string;
  /** products to show as cards (ids from the live catalogue) */
  products?: number[];
  links?: HelperLink[];
  /** follow-up questions the visitor can tap */
  chips?: string[];
  /** read the signed-in person's own data in the panel (never anyone else's) */
  need?: "points" | "enquiries" | "myday";
  /** products to put side by side (the visitor taps a button to compare) */
  compare?: number[];
  /** answered from this question & answer */
  faq?: number;
  /** nothing matched (shows the talk-to-us options) */
  miss?: boolean;
}

export interface HelperSite {
  phoneDisplay: string;
  phoneHref: string;
  whatsappUrl: string;
  email: string;
  address: string[];
  /** Google Maps link to the shop */
  mapsUrl?: string;
  hours: string;
  social: HelperLink[];
}

export interface HelperLesson {
  slug: string;
  title: string;
  summary: string;
}

export interface HelperContext {
  cat: PublicCatalogue;
  index: IndexedProduct[];
  lang: Lang;
  site: HelperSite;
  lessons: HelperLesson[];
  signedIn: boolean;
  /** the product page the visitor is looking at */
  focus?: PublicProduct | null;
  /** staff helper: no customer-account answers, different fallback */
  staff?: boolean;
}

/** The tariff the Size & savings tool starts with (₹ per unit); shown with every estimate. */
export const DEFAULT_TARIFF = 7;
/** Specific yield the Size & savings tool starts with (kWh per kWp per day). */
const DEFAULT_YIELD = 4;

// ------------------------------------------------------------------ words

const STOCK_TA: Record<StockStatus, string> = { in_stock: "கையிருப்பில் உள்ளது", limited: "குறைந்த அளவே உள்ளது", out_of_stock: "தற்போது கையிருப்பில் இல்லை" };
const STOCK_EN: Record<StockStatus, string> = { in_stock: "In stock", limited: "Limited stock", out_of_stock: "Out of stock" };

const T = {
  en: {
    hello: "Hi! I'm the VERDI Helper. Ask me about products, prices, stock, offers, solar sizing or how to reach us.",
    helloStaff: "Hi! Ask me about products and prices, your day, or how to do something in the admin.",
    thanks: "You're welcome! Anything else?",
    miss: "Sorry, I couldn't find an answer to that. Our team can help directly:",
    missStaff: "I couldn't find that. Try a product name, a reference like VS-… or VSQ-…, or tap a suggestion.",
    whatsapp: "WhatsApp us",
    call: (p: string) => `Call ${p}`,
    email: "Email us",
    enquiry: "Send an enquiry",
    phone: (p: string) => `You can call us on ${p}, or message us on WhatsApp.`,
    whatsappTxt: "Message us on WhatsApp. We usually reply within working hours.",
    address: (a: string) => `We're at:\n${a}`,
    map: "Open in Maps",
    hours: (h: string) => `Business hours: ${h}`,
    noHours: "Please call or WhatsApp us to check today's timings.",
    emailTxt: (e: string) => `Our email is ${e}.`,
    social: "Follow us:",
    contactPage: "Contact page",
    offers: (n: number) => `${n} product${n === 1 ? " is" : "s are"} on offer now:`,
    noOffers: "There are no special offers right now. Here's the full catalogue:",
    allProducts: "All products",
    found: (n: number) => `I found ${n} matching product${n === 1 ? "" : "s"}:`,
    seeAll: "See all results",
    price: (p: string, unit: string) => `Price: ${p} ${unit}`,
    mrp: (m: string, off: number) => `MRP ${m} (${off}% off)`,
    gst: (g: string) => g,
    onRequest: "Price on request. Send an enquiry and we'll confirm it.",
    stock: (s: string) => s,
    offer: (l: string) => `On offer: ${l}`,
    datasheet: "Open datasheet (PDF)",
    noDatasheet: "This product has no datasheet on file yet. WhatsApp us and we'll send the details.",
    view: "View product",
    specs: "Key specifications:",
    noSpec: "I couldn't find that detail in this product's specifications.",
    category: (c: string, n: number) => `${c}: ${n} product${n === 1 ? "" : "s"}.`,
    seeCategory: (c: string) => `See all ${c}`,
    sizeAsk: "Tell me your electricity use and I'll estimate the system size. How many units (kWh) a month, or what is your monthly bill?",
    size: (kwh: number, kwp: string, gen: number, save: string) =>
      `For about ${kwh} units a month you'd need roughly ${kwp} kWp of solar.\nIt would make about ${gen} units a month and could save around ${save} a month.`,
    sizeBill: (bill: string, kwh: number) => `A ${bill} monthly bill is about ${kwh} units at ₹${DEFAULT_TARIFF} per unit.`,
    panels: (n: number, wp: number) => `That's about ${n} panels of ${wp} Wp, for example:`,
    subsidyKw: (kw: string, s: string) => `Estimated PM Surya Ghar subsidy for a ${kw} kW home system: ${s}.`,
    subsidy: "PM Surya Ghar (homes, as published in 2024): ₹30,000 per kW for the first 2 kW, ₹18,000 for the 3rd kW, up to ₹78,000 in total.",
    verify: "Rules change, so please check the latest on pmsuryaghar.gov.in.",
    estimate: "This is an estimate. Shading, roof direction and your utility's rules change the result.",
    sizingTool: "Open Size & savings tool",
    compat: "The Kit builder checks panels and inverters together (string voltage, current and power) using the datasheet values.",
    kitBuilder: "Open Kit builder",
    compareTxt: "Here they are side by side:",
    compareNeed: "Tell me two product names to compare, for example “compare 540 W and 550 W panel”.",
    lesson: "From our Learning hub:",
    read: "Read the lesson",
    buy: "Add what you need to your enquiry list, then send it from the Enquiry page. We'll reply with a quotation.",
    openEnquiry: "Open my enquiry list",
    points: "Here are your loyalty points:",
    pointsSignIn: "Sign in to your account to see your loyalty points.",
    enquiries: "Your recent enquiries:",
    enquiriesSignIn: "Sign in to see your enquiries and their status, or WhatsApp us with your reference.",
    signIn: "Sign in",
    faqs: "Questions & answers",
    chipOffers: "Today's offers",
    chipSize: "Size my solar system",
    chipContact: "Contact & address",
    chipPoints: "My points",
    chipEnquiries: "My enquiries",
    chipQuote: "How do I get a quotation?",
    chipShow: (c: string) => `Show ${c}`,
    chipUnits: (n: number) => `${n} units a month`,
    chipBill: "₹3,000 monthly bill",
    chipSubsidy: "Solar subsidy",
    chipPrice: "Price",
    chipStock: "Is it in stock?",
    chipDatasheet: "Datasheet",
  },
  ta: {
    hello: "வணக்கம்! நான் VERDI உதவியாளர். பொருட்கள், விலை, கையிருப்பு, சலுகைகள், சோலார் அளவு அல்லது எங்களை தொடர்பு கொள்வது பற்றி கேளுங்கள்.",
    helloStaff: "வணக்கம்! பொருட்கள், விலை, உங்கள் இன்றைய வேலை அல்லது admin-ல் ஏதாவது செய்வது எப்படி என்று கேளுங்கள்.",
    thanks: "மகிழ்ச்சி! வேறு ஏதாவது வேண்டுமா?",
    miss: "மன்னிக்கவும், இதற்கான பதில் கிடைக்கவில்லை. எங்கள் குழு நேரடியாக உதவும்:",
    missStaff: "அது கிடைக்கவில்லை. பொருளின் பெயர், VS-… அல்லது VSQ-… எண்ணை தட்டச்சு செய்யுங்கள், அல்லது கீழே உள்ள ஒன்றை தேர்ந்தெடுங்கள்.",
    whatsapp: "WhatsApp-ல் பேசுங்கள்",
    call: (p: string) => `அழைக்க ${p}`,
    email: "மின்னஞ்சல்",
    enquiry: "விசாரணை அனுப்பு",
    phone: (p: string) => `எங்களை ${p} என்ற எண்ணில் அழைக்கலாம், அல்லது WhatsApp-ல் செய்தி அனுப்பலாம்.`,
    whatsappTxt: "WhatsApp-ல் செய்தி அனுப்புங்கள். வேலை நேரத்தில் பதில் அளிப்போம்.",
    address: (a: string) => `எங்கள் முகவரி:\n${a}`,
    map: "வரைபடத்தில் திற",
    hours: (h: string) => `வேலை நேரம்: ${h}`,
    noHours: "இன்றைய நேரத்தை அறிய எங்களை அழைக்கவும் அல்லது WhatsApp செய்யவும்.",
    emailTxt: (e: string) => `எங்கள் மின்னஞ்சல்: ${e}`,
    social: "எங்களை பின்தொடருங்கள்:",
    contactPage: "தொடர்பு பக்கம்",
    offers: (n: number) => `இப்போது ${n} பொருட்களுக்கு சலுகை உள்ளது:`,
    noOffers: "இப்போது சிறப்பு சலுகைகள் இல்லை. முழு பட்டியல் இதோ:",
    allProducts: "அனைத்து பொருட்கள்",
    found: (n: number) => `பொருந்தும் ${n} பொருட்கள் கிடைத்தன:`,
    seeAll: "அனைத்தையும் பார்",
    price: (p: string, unit: string) => `விலை: ${p} ${unit}`,
    mrp: (m: string, off: number) => `MRP ${m} (${off}% தள்ளுபடி)`,
    gst: (g: string) => g,
    onRequest: "விலைக்கு விசாரணை அனுப்புங்கள், உறுதி செய்து சொல்வோம்.",
    stock: (s: string) => s,
    offer: (l: string) => `சலுகை: ${l}`,
    datasheet: "Datasheet (PDF) திற",
    noDatasheet: "இந்த பொருளுக்கு இன்னும் datasheet இல்லை. WhatsApp செய்தால் விவரம் அனுப்புவோம்.",
    view: "பொருளை பார்",
    specs: "முக்கிய விவரங்கள்:",
    noSpec: "அந்த விவரம் இந்த பொருளின் specifications-ல் இல்லை.",
    category: (c: string, n: number) => `${c}: ${n} பொருட்கள்.`,
    seeCategory: (c: string) => `அனைத்து ${c}`,
    sizeAsk: "உங்கள் மின்சார பயன்பாட்டை சொல்லுங்கள். மாதம் எத்தனை யூனிட், அல்லது மாத மின் கட்டணம் எவ்வளவு?",
    size: (kwh: number, kwp: string, gen: number, save: string) =>
      `மாதம் சுமார் ${kwh} யூனிட்டுக்கு சுமார் ${kwp} kWp சோலார் தேவை.\nஇது மாதம் சுமார் ${gen} யூனிட் தயாரித்து, மாதம் சுமார் ${save} சேமிக்கலாம்.`,
    sizeBill: (bill: string, kwh: number) => `மாதம் ${bill} கட்டணம் என்றால், யூனிட்டுக்கு ₹${DEFAULT_TARIFF} என்ற கணக்கில் சுமார் ${kwh} யூனிட்.`,
    panels: (n: number, wp: number) => `அதாவது ${wp} Wp பேனல்கள் சுமார் ${n}, உதாரணமாக:`,
    subsidyKw: (kw: string, s: string) => `${kw} kW வீட்டு சோலாருக்கு PM Surya Ghar மானியம் சுமார் ${s}.`,
    subsidy: "PM Surya Ghar (வீடுகளுக்கு, 2024-ல் வெளியிட்டபடி): முதல் 2 kW-க்கு kW ஒன்றுக்கு ₹30,000, 3-வது kW-க்கு ₹18,000, மொத்தம் அதிகபட்சம் ₹78,000.",
    verify: "விதிமுறைகள் மாறலாம், pmsuryaghar.gov.in-ல் சரிபார்க்கவும்.",
    estimate: "இது ஒரு மதிப்பீடு மட்டுமே. நிழல், கூரை திசை மற்றும் மின் வாரிய விதிகளைப் பொறுத்து மாறும்.",
    sizingTool: "Size & savings கருவியை திற",
    compat: "Kit builder பேனல்களையும் இன்வெர்ட்டரையும் datasheet மதிப்புகளைக் கொண்டு ஒன்றாக சரிபார்க்கும் (voltage, current, power).",
    kitBuilder: "Kit builder திற",
    compareTxt: "ஒப்பிட்டு பாருங்கள்:",
    compareNeed: "ஒப்பிட இரண்டு பொருட்களின் பெயரை சொல்லுங்கள், உதாரணமாக “compare 540 W and 550 W panel”.",
    lesson: "எங்கள் Learning hub-லிருந்து:",
    read: "பாடத்தை படி",
    buy: "தேவையான பொருட்களை enquiry பட்டியலில் சேர்த்து, Enquiry பக்கத்திலிருந்து அனுப்புங்கள். நாங்கள் quotation அனுப்புவோம்.",
    openEnquiry: "என் enquiry பட்டியல்",
    points: "உங்கள் loyalty புள்ளிகள்:",
    pointsSignIn: "உங்கள் புள்ளிகளை பார்க்க உள்நுழையுங்கள்.",
    enquiries: "உங்கள் சமீபத்திய விசாரணைகள்:",
    enquiriesSignIn: "உங்கள் விசாரணைகளின் நிலையை பார்க்க உள்நுழையுங்கள், அல்லது reference எண்ணுடன் WhatsApp செய்யுங்கள்.",
    signIn: "உள்நுழை",
    faqs: "கேள்வி பதில்கள்",
    chipOffers: "இன்றைய சலுகைகள்",
    chipSize: "எனக்கு எவ்வளவு சோலார் தேவை?",
    chipContact: "முகவரி & தொடர்பு",
    chipPoints: "என் புள்ளிகள்",
    chipEnquiries: "என் விசாரணைகள்",
    chipQuote: "Quotation எப்படி பெறுவது?",
    chipShow: (c: string) => `${c} காட்டு`,
    chipUnits: (n: number) => `மாதம் ${n} யூனிட்`,
    chipBill: "மாத கட்டணம் ₹3,000",
    chipSubsidy: "சோலார் மானியம்",
    chipPrice: "விலை",
    chipStock: "கையிருப்பு உள்ளதா?",
    chipDatasheet: "Datasheet",
  },
} as const;


export type HelperText = (typeof T)["en"];
export const helperText = (lang: Lang): HelperText => T[lang] as unknown as HelperText;

// Words people use, in English, Tanglish and Tamil. English words match whole words; Tamil words match
// anywhere (Tamil adds endings to words, e.g. விலை → விலையை).
const W = {
  greet: ["hi", "hii", "hello", "hey", "helo", "vanakkam", "namaste", "good morning", "good evening", "good afternoon", "start", "menu", "help", "வணக்கம்", "உதவி"],
  thanks: ["thanks", "thank you", "thank u", "thx", "nandri", "ok thanks", "bye", "நன்றி"],
  price: ["price", "prices", "cost", "rate", "rates", "how much", "mrp", "evvalavu", "evlo", "vilai", "விலை", "எவ்வளவு", "ரேட்"],
  stock: ["stock", "available", "availability", "in stock", "kaiyiruppu", "கையிருப்பு", "ஸ்டாக்", "கிடைக்குமா", "கிடைக்கும்"],
  datasheet: ["datasheet", "data sheet", "pdf", "brochure", "catalogue pdf", "டேட்டாஷீட்"],
  spec: ["spec", "specs", "specification", "specifications", "details", "detail", "features", "efficiency", "warranty", "voltage", "current", "dimensions", "weight", "size of", "விவரம்", "விவரங்கள்"],
  phone: ["call", "phone", "number", "mobile", "contact", "contact number", "phone number", "அழை", "போன்", "தொலைபேசி", "எண்", "தொடர்பு"],
  whatsapp: ["whatsapp", "whats app", "watsapp", "வாட்ஸ்அப்"],
  address: ["address", "location", "located", "where are you", "where is your", "shop", "office", "showroom", "map", "maps", "directions", "visit", "come", "முகவரி", "எங்கே", "இடம்", "கடை"],
  email: ["email", "e-mail", "mail id", "மின்னஞ்சல்"],
  hours: ["hours", "timing", "timings", "time", "open", "opening", "close", "closing", "working", "sunday", "holiday", "நேரம்", "திறந்து"],
  social: ["instagram", "facebook", "youtube", "linkedin", "social"],
  offers: ["offer", "offers", "discount", "discounts", "deal", "deals", "sale", "festival", "சலுகை", "தள்ளுபடி", "ஆஃபர்"],
  subsidy: ["subsidy", "subsidies", "surya ghar", "pm surya", "pmsuryaghar", "government scheme", "மானியம்"],
  size: ["how many panels", "how many panel", "what size", "which size", "system size", "capacity do i need", "size my", "sizing", "how much solar", "how many kw", "units", "unit", "kwh", "electricity bill", "eb bill", "bill", "எத்தனை பேனல்", "எவ்வளவு சோலார்", "யூனிட்", "கட்டணம்", "பில்", "சோலார் தேவை"],
  compat: ["compatible", "compatibility", "work with", "works with", "match with", "suitable for", "support", "pair with", "பொருந்து", "பொருத்த"],
  compare: ["compare", " vs ", "versus", "difference between", "which is better", "ஒப்பிடு", "ஒப்பீடு", "வித்தியாசம்"],
  learn: ["what is", "whats", "what's", "what are", "explain", "meaning", "why", "how does", "how do", "difference", "learn", "என்றால் என்ன", "என்ன", "ஏன்", "விளக்கம்"],
  buy: ["quotation", "quote", "estimate", "buy", "purchase", "order", "enquiry", "enquire", "inquiry", "booking", "வாங்க", "ஆர்டர்", "விசாரணை", "மேற்கோள்"],
  points: ["points", "point", "rewards", "reward", "loyalty", "புள்ளி", "பாயிண்ட்"],
  myEnquiry: ["my enquiry", "my enquiries", "my order", "my orders", "my quotation", "order status", "enquiry status", "status of my", "track", "என் விசாரணை", "என் ஆர்டர்"],
  faqs: ["faq", "faqs", "questions", "question", "கேள்வி"],
};

// Tamil product words → the English words the catalogue uses
const TA_PRODUCT: [string, string][] = [
  ["பேனல்", "panel"],
  ["சோலார் பேனல்", "panel"],
  ["தகடு", "panel"],
  ["இன்வெர்ட்டர்", "inverter"],
  ["இன்வர்டர்", "inverter"],
  ["பேட்டரி", "battery"],
  ["கேபிள்", "cable"],
  ["வயர்", "cable"],
  ["விளக்கு", "light"],
  ["மின்விசிறி", "fan"],
  ["பம்ப்", "pump"],
];

const STOP = new Set(
  "a an the of for to is are am do does you u your yours have has had what whats which who how much many me my i we our please pls plz show tell about price prices cost rate rates rs stock available availability in on at with and or any there can could get want need give details detail spec specs specification specifications datasheet sheet pdf info information it this that these those product products buy list all some best good latest new now today offer offers it's its from by be will would like know send share link one ones type types range model models series kindly sir madam hi hello hey vilai evvalavu evlo".split(" "),
);

// ------------------------------------------------------------------ text helpers

function plainText(q: string): string {
  return ` ${q
    .toLowerCase()
    .normalize("NFC")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}₹'.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const isTamilWord = (w: string) => /[஀-௿]/.test(w);
function has(plain: string, words: readonly string[]): boolean {
  return words.some((w) => (isTamilWord(w) ? plain.includes(w) : plain.includes(` ${w.trim()} `) || (w.startsWith(" ") && plain.includes(w))));
}

/** Words that carry meaning (stop words and intent words removed), in the search engine's spelling. */
export function contentTokens(q: string): string[] {
  let s = q.toLowerCase();
  for (const [ta, en] of TA_PRODUCT) s = s.split(ta).join(` ${en} `);
  return normalise(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .filter((t, i, a) => a.indexOf(t) === i);
}

const singular = (t: string) => (t.endsWith("ies") ? t.slice(0, -3) + "y" : t.endsWith("es") && t.length > 4 ? t.slice(0, -2) : t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t);

function tokenMatches(t: string, words: Set<string>): boolean {
  if (words.has(t)) return true;
  const s = singular(t);
  if (words.has(s)) return true;
  for (const w of words) if (w.length > 4 && s.length > 4 && (w.startsWith(s) || s.startsWith(w))) return true;
  return false;
}

const wordsOf = (s: string) => new Set(contentTokens(s).map(singular));

// ------------------------------------------------------------------ finding things

/** Products matching most of the words (not all: people add extra words when they chat). */
export function findProducts(index: IndexedProduct[], tokens: string[], limit = 6): PublicProduct[] {
  if (!tokens.length) return [];
  const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  const scored: { p: PublicProduct; n: number; s: number }[] = [];
  for (const item of index) {
    let n = 0;
    let s = 0;
    for (const t of tokens) {
      const v = scoreItem(item, [t]) || (singular(t) !== t ? scoreItem(item, [singular(t)]) : 0);
      if (v > 0) {
        n++;
        s += v;
      }
    }
    if (n >= need) scored.push({ p: item.p, n, s: s + (item.p.featured ? 0.5 : 0) });
  }
  scored.sort((a, b) => b.n - a.n || b.s - a.s || a.p.name.localeCompare(b.p.name, "en", { numeric: true }));
  return scored.slice(0, limit).map((x) => x.p);
}

function faqScore(f: PublicFaq, tokens: string[], plain: string, lang: Lang): number {
  const words = wordsOf(`${f.q} ${f.k} ${f.topic}`);
  let n = 0;
  for (const t of tokens) if (tokenMatches(singular(t), words)) n++;
  // Tamil wording: count Tamil words of the question that appear in what was typed
  let ta = 0;
  if (lang === "ta" || /[஀-௿]/.test(plain)) {
    const taWords = `${f.qTa ?? ""} ${f.k}`.split(/[\s,?.!]+/).filter((w) => w.length > 2 && isTamilWord(w));
    const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2)); // Tamil adds endings to words
    const hits = taWords.filter((w) => plain.includes(stem(w))).length;
    if (taWords.length) ta = hits / Math.min(taWords.length, 4);
    // and how many of the visitor's own Tamil words the question contains
    const faqText = taWords.join(" ");
    const typed = plain.split(" ").filter((w) => w.length > 2 && isTamilWord(w));
    if (typed.length && taWords.length) ta = Math.max(ta, typed.filter((w) => faqText.includes(stem(w))).length / typed.length);
  }
  const keywordHit = f.k
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => (isTamilWord(k) ? plain.includes(k) : plain.includes(` ${k} `)));
  return Math.max(tokens.length ? n / tokens.length : 0, ta, keywordHit ? 0.75 : 0);
}

export function bestFaq(faqs: PublicFaq[], q: string, lang: Lang): { faq: PublicFaq; score: number } | null {
  const plain = plainText(q);
  const tokens = contentTokens(q);
  let best: { faq: PublicFaq; score: number } | null = null;
  for (const f of faqs) {
    const s = faqScore(f, tokens, plain, lang);
    if (s > (best?.score ?? 0)) best = { faq: f, score: s };
  }
  return best;
}

function bestLesson(lessons: HelperLesson[], tokens: string[]): HelperLesson | null {
  let best: { l: HelperLesson; s: number } | null = null;
  for (const l of lessons) {
    const title = wordsOf(l.title);
    const all = wordsOf(`${l.title} ${l.summary}`);
    let s = 0;
    for (const t of tokens) s += tokenMatches(t, title) ? 1 : tokenMatches(t, all) ? 0.5 : 0;
    s /= Math.max(1, tokens.length);
    if (s > (best?.s ?? 0)) best = { l, s };
  }
  return best && best.s >= 0.5 ? best.l : null;
}

function categoryIn(cat: PublicCatalogue, tokens: string[]) {
  let best: { c: PublicCatalogue["categories"][number]; s: number } | null = null;
  for (const c of cat.categories) {
    const words = wordsOf(c.name);
    if (!words.size) continue;
    let n = 0;
    for (const t of tokens) if (tokenMatches(t, words)) n++;
    const s = n / words.size + n / Math.max(1, tokens.length);
    if (n && s > (best?.s ?? 0)) best = { c, s };
  }
  return best && best.s >= 1 ? best.c : null;
}

// ------------------------------------------------------------------ numbers

const num = (s: string) => Number(s.replace(/,/g, ""));

/** Monthly units, from "300 units", "10 units a day" or a "₹3000 bill". */
export function usageFrom(q: string): { kwh: number; bill: number | null } | null {
  const p = plainText(q).replace(/₹\s*/g, " ₹");
  const daily = /\b(per day|a day|daily|day|ஒரு நாள்|தினமும்|நாளைக்கு)\b|நாள்/.test(p);
  const units = p.match(/(\d[\d,]*(?:\.\d+)?)\s*(units?|kwh|யூனிட்)/);
  if (units) {
    const n = num(units[1]) * (daily ? 30 : 1);
    if (n > 0 && n < 1e6) return { kwh: Math.round(n), bill: null };
  }
  const bill = p.match(/(?:₹|\brs\.?|\binr|rupees?)\s*(\d[\d,]*)/) ?? p.match(/(\d[\d,]*)\s*(?:rs\b|rupees?|ரூபாய்|ரூ)/) ?? (has(p, ["bill", "கட்டணம்", "பில்"]) ? p.match(/(\d[\d,]{2,})/) : null);
  if (bill) {
    const b = num(bill[1]);
    if (b >= 100 && b < 1e7) return { kwh: Math.round(b / DEFAULT_TARIFF), bill: b };
  }
  return null;
}

function kwFrom(q: string): number | null {
  const m = plainText(q).match(/(\d+(?:\.\d+)?)\s*(kw|kwp|kilowatt)\b/);
  return m ? Number(m[1]) : null;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

// ------------------------------------------------------------------ how-to guides (site help, admin help)

/** Rough English stemmer: "uploading photos" and "upload photo" become the same words. */
export function stems(s: string): string[] {
  return plainText(s)
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (isTamilWord(w)) return w;
      let x = w.replace(/'s$/, "").replace(/[.'-]+$/, "");
      if (x.length > 5 && x.endsWith("ing")) x = x.slice(0, -3);
      else if (x.length > 4 && x.endsWith("ies")) x = x.slice(0, -3) + "y";
      else if (x.length > 4 && x.endsWith("ed")) x = x.slice(0, -2);
      else if (x.length > 3 && x.endsWith("s") && !x.endsWith("ss")) x = x.slice(0, -1);
      if (x.length > 4 && x.endsWith("e")) x = x.slice(0, -1);
      return x;
    });
}

/** Words that show the person wants to know how to do something (not a product question). */
const HOW_WORDS = ["how", "where", "can", "change", "edit", "update", "add", "upload", "delete", "remove", "set", "create", "make", "send", "approve", "pay", "find", "see", "view", "open", "enable", "disable", "hide", "show", "reset", "export", "download", "assign", "reassign", "manage", "use", "mark", "track", "check", "register", "sign", "login", "log", "invite", "give", "cancel", "undo", "move", "write", "what", "who", "which", "do", "does", "need", "want", "help", "forgot", "lost", "get"];
const HOW = new Set(HOW_WORDS.map((w) => stems(w)[0] ?? w));
const HOW_TA = /எப்படி|எங்கே|மாற்ற|சேர்|அனுப்ப|பார்க்க|நீக்க|பதிவேற்ற|என்ன/;

export interface Guide {
  id: string;
  /** what it is about: words or short phrases in any form ("photo", "upload photos"); Tamil words match anywhere */
  about: string[];
  en: string;
  ta: string;
  link?: HelperLink & { ta?: string };
}

const dfCache = new WeakMap<Guide[], Map<string, number>>();
/** In how many guides each word appears. */
function guideWordCounts(guides: Guide[]): Map<string, number> {
  let m = dfCache.get(guides);
  if (m) return m;
  m = new Map();
  for (const g of guides) for (const w of new Set(g.about.flatMap((a) => (isTamilWord(a) ? [] : stems(a))))) m.set(w, (m.get(w) ?? 0) + 1);
  dfCache.set(guides, m);
  return m;
}

/** Best matching guide, or null. `asking` is true when the question is phrased as "how / where / can I …". */
export function matchGuide<G extends Guide>(guides: G[], q: string): { guide: G; score: number; asking: boolean } | null {
  const words = stems(q);
  const set = new Set(words);
  const plain = plainText(q);
  const asking = words.some((w) => HOW.has(w)) || HOW_TA.test(q);
  // words used by many guides ("enquiry", "product") count less than specific ones ("reassign", "image")
  const df = guideWordCounts(guides);
  let best: { guide: G; score: number; asking: boolean; rank: number } | null = null;
  for (const g of guides) {
    let score = 0;
    let rank = 0;
    for (const a of g.about) {
      if (isTamilWord(a)) {
        if (plain.includes(a)) (score += 1.5), (rank += 2);
        continue;
      }
      const k = stems(a);
      if (k.length && k.every((w) => set.has(w))) {
        score += k.length;
        rank += k.length + k.reduce((s, w) => s + 1 / (df.get(w) ?? 1), 0);
      }
    }
    if (score >= 1 && rank > (best?.rank ?? 0)) best = { guide: g, score, asking, rank };
  }
  return best ? { guide: best.guide, score: best.score, asking: best.asking } : null;
}

export function guideAnswer(g: Guide, lang: Lang): HelperAnswer {
  return { text: lang === "ta" ? g.ta : g.en, links: g.link ? [{ label: lang === "ta" && g.link.ta ? g.link.ta : g.link.label, to: g.link.to }] : undefined };
}

/** Help with the website itself, for visitors. It only describes what the site does. */
const SITE_GUIDES: Guide[] = [
  { id: "account", about: ["account", "register", "sign up", "signup", "create account", "login", "log in", "sign in", "கணக்கு"], en: "Create a free account with your mobile number on the Account page. Then you can follow every enquiry you send and see your loyalty points.", ta: "Account பக்கத்தில் உங்கள் மொபைல் எண்ணுடன் இலவசக் கணக்கு தொடங்கலாம். பிறகு நீங்கள் அனுப்பிய ஒவ்வொரு விசாரணையின் நிலையையும், loyalty புள்ளிகளையும் பார்க்கலாம்.", link: { label: "My account", to: "/account", ta: "என் கணக்கு" } },
  { id: "password", about: ["password", "forgot password", "reset password", "கடவுச்சொல்"], en: "Forgot your password? Message us on WhatsApp from your registered number and we'll send you a reset link.", ta: "கடவுச்சொல் மறந்துவிட்டதா? பதிவு செய்த எண்ணிலிருந்து WhatsApp செய்தால் reset link அனுப்புவோம்.", link: { label: "My account", to: "/account", ta: "என் கணக்கு" } },
  { id: "order", about: ["order", "place order", "send enquiry", "enquiry", "enquire", "buy", "purchase", "quotation", "quote", "basket", "cart", "வாங்க", "ஆர்டர்", "விசாரணை"], en: "Add products to your enquiry list (the Enquiry button), choose quantities and send it. Every price is checked again before it goes, and you can send it on WhatsApp. We reply with a quotation.", ta: "பொருட்களை enquiry பட்டியலில் சேர்த்து, எண்ணிக்கையைத் தேர்வு செய்து அனுப்புங்கள். அனுப்பும் முன் ஒவ்வொரு விலையும் மீண்டும் சரிபார்க்கப்படும், WhatsApp-லும் அனுப்பலாம். நாங்கள் quotation அனுப்புவோம்.", link: { label: "My enquiry list", to: "/enquiry", ta: "என் enquiry பட்டியல்" } },
  { id: "compare", about: ["compare", "comparison", "side by side", "ஒப்பிடு"], en: "Tap the compare icon on up to four products, then open Compare to see them side by side, with the differences highlighted.", ta: "அதிகபட்சம் நான்கு பொருட்களில் compare குறியைத் தட்டி, Compare பக்கத்தில் பக்கம் பக்கமாக ஒப்பிடலாம். வித்தியாசங்கள் தனியாகக் காட்டப்படும்.", link: { label: "Compare", to: "/compare" } },
  { id: "tools", about: ["tool", "calculator", "calculate", "roof", "battery backup", "kit builder", "loss", "tilt", "orientation", "கருவி", "கணக்கீடு"], en: "Free solar tools: appliance load, size and savings, roof space, kit builder, battery backup, losses, tilt and orientation, a system explorer and a datasheet decoder.", ta: "இலவச சோலார் கருவிகள்: மின்சுமை, அளவு மற்றும் சேமிப்பு, கூரை இடம், kit builder, பேட்டரி பேக்கப், இழப்புகள், சாய்வு மற்றும் திசை, system explorer, datasheet decoder.", link: { label: "Solar tools", to: "/solar-tools", ta: "சோலார் கருவிகள்" } },
  { id: "learn", about: ["learn", "lesson", "basics", "beginner", "myth", "கற்று", "பாடம்"], en: "The Learning hub explains solar in short, simple lessons, from how a cell works to choosing an inverter.", ta: "Learning hub சோலாரை சிறிய, எளிய பாடங்களில் விளக்குகிறது.", link: { label: "Learning hub", to: "/learn" } },
  { id: "field", about: ["project", "installation", "gallery", "in the field", "field photo", "திட்டம்"], en: "See real photos of products and work in the field.", ta: "களத்தில் எடுத்த உண்மையான படங்களைப் பாருங்கள்.", link: { label: "In the field", to: "/in-the-field" } },
  { id: "datasheet", about: ["datasheet", "data sheet", "brochure"], en: "Every product with a datasheet shows a Preview button on its page. The real manufacturer PDF opens right there, and you can download it. Tell me the product name to get its datasheet.", ta: "datasheet உள்ள ஒவ்வொரு பொருள் பக்கத்திலும் Preview பட்டன் இருக்கும். உண்மையான PDF அங்கேயே திறக்கும், download-உம் செய்யலாம். பொருளின் பெயரைச் சொன்னால் அதன் datasheet தருகிறேன்.", link: { label: "All products", to: "/products", ta: "அனைத்து பொருட்கள்" } },
  { id: "language", about: ["tamil", "language", "english", "தமிழ்"], en: "Use the EN / தமிழ் switch at the top of this chat to change the language.", ta: "மொழியை மாற்ற இந்த chat-ன் மேலே உள்ள EN / தமிழ் பட்டனைப் பயன்படுத்துங்கள்." },
];

// ------------------------------------------------------------------ answers

function contactLinks(ctx: HelperContext): HelperLink[] {
  const t = helperText(ctx.lang);
  return [
    { label: t.whatsapp, to: ctx.site.whatsappUrl },
    { label: t.call(ctx.site.phoneDisplay), to: ctx.site.phoneHref },
    { label: t.enquiry, to: "/enquiry" },
  ];
}

export function welcome(ctx: HelperContext): HelperAnswer {
  const t = helperText(ctx.lang);
  const chips: string[] = [];
  if (ctx.focus) chips.push(t.chipPrice, t.chipStock, ...(ctx.focus.datasheet ? [t.chipDatasheet] : []));
  if (ctx.cat.products.some((p) => p.offer)) chips.push(t.chipOffers);
  const cats = ctx.cat.categories.filter((c) => ctx.cat.products.some((p) => p.categoryId === c.id)).slice(0, 2);
  chips.push(...cats.map((c) => t.chipShow(c.name)));
  chips.push(t.chipSize, t.chipContact);
  if (ctx.signedIn) chips.push(t.chipPoints, t.chipEnquiries);
  else chips.push(t.chipQuote);
  const faqs = (ctx.cat.faqs ?? []).slice(0, 3).map((f) => (ctx.lang === "ta" && f.qTa ? f.qTa : f.q));
  return { text: t.hello, chips: [...new Set([...chips.slice(0, 7), ...faqs])] };
}

function faqAnswer(f: PublicFaq, ctx: HelperContext, q = ""): HelperAnswer {
  // answer in the language of the question (or the chosen language)
  const ta = (ctx.lang === "ta" || /[஀-௿]/.test(q)) && f.aTa;
  return { text: ta ? f.aTa! : f.a, faq: f.id, links: [{ label: helperText(ctx.lang).faqs, to: "/faq" }] };
}

function productLines(p: PublicProduct, ctx: HelperContext, parts: { price?: boolean; stock?: boolean }) {
  const t = helperText(ctx.lang);
  const lines: string[] = [];
  if (parts.price) {
    if (p.price.sellingPaise == null) lines.push(t.onRequest);
    else {
      lines.push(t.price(formatPaise(p.price.sellingPaise), p.price.unit));
      const off = percentOff(p.price);
      if (off && p.price.mrpPaise) lines.push(t.mrp(formatPaise(p.price.mrpPaise), off));
    }
  }
  if (parts.stock) {
    const s = (p.stock ?? "in_stock") as StockStatus;
    lines.push((ctx.lang === "ta" ? STOCK_TA : STOCK_EN)[s]);
    if (p.offer) lines.push(t.offer(p.offer.label || (ctx.lang === "ta" ? "சிறப்பு சலுகை" : "Special offer")));
  }
  return lines;
}

/** One product: answer the part that was asked (price, stock, datasheet, a spec) or a short summary. */
function productAnswer(p: PublicProduct, ctx: HelperContext, plain: string, tokens: string[]): HelperAnswer {
  const t = helperText(ctx.lang);
  const view = { label: t.view, to: `/products/${p.slug}` };
  const wantPrice = has(plain, W.price);
  const wantStock = has(plain, W.stock) || has(plain, W.offers);
  const wantSheet = has(plain, W.datasheet);
  const chips = [t.chipPrice, t.chipStock, ...(p.datasheet ? [t.chipDatasheet] : [])];
  if (wantSheet) {
    return p.datasheet
      ? { text: p.name, products: [p.id], links: [{ label: t.datasheet, to: p.datasheet }, view], chips }
      : { text: `${p.name}\n${t.noDatasheet}`, products: [p.id], links: [view, ...contactLinks(ctx).slice(0, 1)], chips };
  }
  if (wantPrice || wantStock) {
    const lines = productLines(p, ctx, { price: wantPrice, stock: wantStock || wantPrice });
    return { text: `${p.name}\n${lines.join("\n")}`, products: [p.id], links: [view], chips };
  }
  // a specification by name ("efficiency of …", "voc", "warranty")
  const productWords = wordsOf(`${p.name} ${p.model ?? ""} ${p.sku}`);
  const asked = tokens.filter((x) => !tokenMatches(x, productWords));
  if (asked.length && p.specs.length) {
    const specs = p.specs.filter((s) => {
      const w = wordsOf(`${s.l} ${s.k.replace(/_/g, " ")}`);
      return asked.some((x) => tokenMatches(x, w));
    });
    if (specs.length) return { text: `${p.name}\n${specs.slice(0, 6).map((s) => `${s.l}: ${s.v}${s.u ? " " + s.u : ""}`).join("\n")}`, products: [p.id], links: [view], chips };
    if (has(plain, W.spec)) return { text: `${p.name}\n${t.noSpec}`, products: [p.id], links: [view, ...(p.datasheet ? [{ label: t.datasheet, to: p.datasheet }] : [])], chips };
  }
  const lines = productLines(p, ctx, { price: true, stock: true });
  const key = p.specs.slice(0, 3).map((s) => `${s.l}: ${s.v}${s.u ? " " + s.u : ""}`);
  return { text: [p.name, p.short ?? "", ...lines, ...(key.length ? [t.specs, ...key] : [])].filter(Boolean).join("\n"), products: [p.id], links: [view], chips };
}

function sizingAnswer(kwh: number, bill: number | null, ctx: HelperContext): HelperAnswer {
  const t = helperText(ctx.lang);
  const kwp = Math.max(0.5, Math.round(requiredCapacityKwp(kwh, DEFAULT_YIELD) * 10) / 10);
  const sv = savingsEstimate({ capacityKwp: kwp, specificYield: DEFAULT_YIELD, monthlyConsumptionKwh: kwh, tariffPerKwh: DEFAULT_TARIFF, exportTariffPerKwh: 0 });
  const modules = ctx.index
    .filter((i) => (i.num.power_wp ?? 0) >= 100 && i.p.stock !== "out_of_stock")
    .sort((a, b) => (b.num.power_wp ?? 0) - (a.num.power_wp ?? 0) || Number(b.p.featured) - Number(a.p.featured));
  const lines = [
    ...(bill ? [t.sizeBill(inr(bill), kwh)] : []),
    t.size(kwh, kwp.toFixed(1), Math.round(sv.monthlyGen), inr(sv.monthlySavings)),
  ];
  let products: number[] | undefined;
  if (modules.length) {
    const wp = modules[0].num.power_wp!;
    lines.push(t.panels(Math.ceil((kwp * 1000) / wp), wp));
    products = modules.filter((m) => m.num.power_wp === wp).slice(0, 3).map((m) => m.p.id);
  }
  lines.push(t.subsidyKw(kwp.toFixed(1), inr(residentialSubsidy(kwp))), t.verify, t.estimate);
  return { text: lines.join("\n"), products, links: [{ label: t.sizingTool, to: `/solar-tools/sizing?kwh=${kwh}&tariff=${DEFAULT_TARIFF}` }], chips: [t.chipQuote] };
}

/**
 * Answer one question. Order matters: greetings, the owner's own answers, the visitor's account,
 * contact details, offers, solar sizing, comparisons, categories, products, lessons, then a polite
 * "talk to us" with the real contact options.
 */
export function reply(question: string, ctx: HelperContext): HelperAnswer {
  const t = helperText(ctx.lang);
  const q = question.trim().slice(0, 300);
  const plain = plainText(q);
  const tokens = contentTokens(q);
  const faqs = ctx.cat.faqs ?? [];
  if (!q || (has(plain, W.greet) && tokens.length <= 1)) return welcome(ctx);
  if (has(plain, W.thanks) && tokens.length <= 2) return { text: t.thanks, chips: welcome(ctx).chips?.slice(0, 4) };

  const faq = bestFaq(faqs, q, ctx.lang);
  if (faq && faq.score >= 0.67) return faqAnswer(faq.faq, ctx, q);

  // how to use the website ("how do I create an account?")
  if (!ctx.staff) {
    const g = matchGuide(SITE_GUIDES, q);
    if (g && g.asking && !has(plain, W.myEnquiry) && !((g.guide.id === "order" || g.guide.id === "datasheet") && findProducts(ctx.index, tokens, 1).length)) return guideAnswer(g.guide, ctx.lang);
  }

  // the visitor's own account (read only)
  if (!ctx.staff) {
    if (has(plain, W.myEnquiry)) return ctx.signedIn ? { text: t.enquiries, need: "enquiries" } : { text: t.enquiriesSignIn, links: [{ label: t.signIn, to: "/account" }, ...contactLinks(ctx).slice(0, 1)] };
    if (has(plain, W.points)) return ctx.signedIn ? { text: t.points, need: "points" } : { text: t.pointsSignIn, links: [{ label: t.signIn, to: "/account" }] };
  }

  if (has(plain, W.faqs) && tokens.length <= 2 && faqs.length) return { text: t.faqs, chips: faqs.slice(0, 8).map((f) => (ctx.lang === "ta" && f.qTa ? f.qTa : f.q)), links: [{ label: t.faqs, to: "/faq" }] };

  // contact details (from Admin → Settings)
  const s = ctx.site;
  const productish = findProducts(ctx.index, tokens, 1).length > 0;
  if (!productish || tokens.length <= 1) {
    if (has(plain, W.whatsapp)) return { text: t.whatsappTxt, links: [{ label: t.whatsapp, to: s.whatsappUrl }] };
    if (has(plain, W.address)) {
      const a = s.address.join(", ");
      return { text: [t.address(s.address.join("\n")), s.hours ? t.hours(s.hours) : ""].filter(Boolean).join("\n"), links: [{ label: t.map, to: s.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` }, { label: t.contactPage, to: "/contact" }] };
    }
    if (has(plain, W.hours)) return { text: s.hours ? t.hours(s.hours) : t.noHours, links: contactLinks(ctx).slice(0, 2) };
    if (has(plain, W.email)) return { text: t.emailTxt(s.email), links: [{ label: t.email, to: `mailto:${s.email}` }] };
    if (has(plain, W.social) && s.social.length) return { text: t.social, links: s.social };
    if (has(plain, W.phone)) return { text: t.phone(s.phoneDisplay), links: contactLinks(ctx).slice(0, 2) };
  }

  // offers
  if (has(plain, W.offers) && !productish) {
    const on = ctx.cat.products.filter((p) => p.offer);
    return on.length ? { text: t.offers(on.length), products: on.slice(0, 8).map((p) => p.id), links: [{ label: t.allProducts, to: "/products?offer=1" }] } : { text: t.noOffers, links: [{ label: t.allProducts, to: "/products" }] };
  }

  // solar sizing and subsidy (calculators)
  const usage = usageFrom(q);
  if (usage && (has(plain, W.size) || has(plain, W.subsidy) || !productish)) return sizingAnswer(usage.kwh, usage.bill, ctx);
  if (has(plain, W.subsidy)) {
    const kw = kwFrom(q);
    return {
      text: [kw ? t.subsidyKw(String(kw), inr(residentialSubsidy(kw))) : t.subsidy, t.verify].join("\n"),
      links: [{ label: t.sizingTool, to: "/solar-tools/sizing" }, { label: "pmsuryaghar.gov.in", to: "https://pmsuryaghar.gov.in" }],
      chips: [t.chipSize],
    };
  }
  if (has(plain, W.size) && !productish) return { text: t.sizeAsk, chips: [t.chipUnits(200), t.chipUnits(400), t.chipBill] };

  // compatibility and comparison
  if (has(plain, W.compat)) {
    const found = findProducts(ctx.index, tokens, 2);
    return { text: t.compat, products: found.map((p) => p.id), links: [{ label: t.kitBuilder, to: "/solar-tools/kit-builder" }] };
  }
  if (has(plain, W.compare)) {
    const parts = plain.split(/\b(?:vs|versus|and|with|or)\b|,|&/).map((x) => contentTokens(x.replace(/compare|difference between|which is better|ஒப்பிடு|ஒப்பீடு/g, " "))).filter((x) => x.length);
    const picks: PublicProduct[] = [];
    for (const part of parts) {
      const p = findProducts(ctx.index, part, 3).find((x) => !picks.includes(x));
      if (p) picks.push(p);
    }
    if (picks.length >= 2) return { text: t.compareTxt, products: picks.slice(0, 4).map((p) => p.id), compare: picks.slice(0, 4).map((p) => p.id) };
    if (!picks.length && !productish) return { text: t.compareNeed };
  }

  // "how do I get a quotation / buy"
  if (has(plain, W.buy) && !productish) {
    return { text: t.buy, links: [{ label: t.openEnquiry, to: "/enquiry" }, ...contactLinks(ctx).slice(0, 1)], products: ctx.focus ? [ctx.focus.id] : undefined };
  }

  // a question about the product on screen ("price?", "datasheet?")
  const askedAboutIt = has(plain, W.price) || has(plain, W.stock) || has(plain, W.datasheet) || has(plain, W.spec);
  if (ctx.focus && askedAboutIt && !productish) return productAnswer(ctx.focus, ctx, plain, tokens);

  // learning questions ("what is MPPT?") before product search, so a spec word does not list products
  if (has(plain, W.learn)) {
    const l = bestLesson(ctx.lessons, tokens);
    if (l) return { text: `${t.lesson}\n${l.title}\n${l.summary}`, links: [{ label: t.read, to: `/learn/${l.slug}` }] };
  }

  // a category ("batteries", "show inverters")
  const c = categoryIn(ctx.cat, tokens);
  const products = findProducts(ctx.index, tokens, 8);
  if (c && !askedAboutIt && (products.length === 0 || tokens.every((x) => tokenMatches(x, wordsOf(c.name))) || has(plain, ["show", "list", "காட்டு"]))) {
    const items = ctx.cat.products.filter((p) => p.categoryId === c.id).sort((a, b) => Number(b.featured) - Number(a.featured));
    if (items.length) return { text: t.category(c.name, items.length), products: items.slice(0, 8).map((p) => p.id), links: [{ label: t.seeCategory(c.name), to: `/category/${c.slug}` }] };
  }

  if (products.length) {
    // one clear winner: answer about it; several: show the list
    const exact = products.filter((p) => tokens.length && tokens.every((x) => tokenMatches(x, wordsOf(`${p.name} ${p.model ?? ""} ${p.sku} ${p.variant ?? ""}`))));
    if (products.length === 1 || exact.length === 1) return productAnswer(exact[0] ?? products[0], ctx, plain, tokens);
    return { text: t.found(products.length), products: products.map((p) => p.id), links: [{ label: t.seeAll, to: `/products?q=${encodeURIComponent(tokens.join(" "))}` }] };
  }

  if (faq && faq.score >= 0.4) return faqAnswer(faq.faq, ctx, q);
  const l = bestLesson(ctx.lessons, tokens);
  if (l) return { text: `${t.lesson}\n${l.title}\n${l.summary}`, links: [{ label: t.read, to: `/learn/${l.slug}` }] };

  return ctx.staff ? { text: t.missStaff, miss: true } : { text: t.miss, links: contactLinks(ctx), chips: welcome(ctx).chips?.slice(0, 4), miss: true };
}
