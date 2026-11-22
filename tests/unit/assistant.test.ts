import { describe, expect, it } from "vitest";
import { bestFaq, reply, usageFrom, welcome, type HelperContext } from "../../shared/assistant";
import { staffReply, type StaffContext } from "../../shared/assistant-staff";
import { buildIndex } from "../../shared/search";
import type { AdminRole, PublicCatalogue, PublicProduct } from "../../shared/types";

// A small made-up catalogue for the helper's tests (test fixture only).
const product = (id: number, name: string, categoryId: number, extra: Partial<PublicProduct> = {}): PublicProduct => ({
  id,
  sku: `SKU-${id}`,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  seriesKey: null,
  seriesName: null,
  variant: null,
  model: `M${id}`,
  brandId: 1,
  categoryId,
  short: null,
  description: null,
  highlights: [],
  featured: false,
  stock: "in_stock",
  offer: null,
  price: { sellingPaise: 1000000 + id, mrpPaise: null, gstIncluded: true, gstRate: 12, unit: "per piece", version: 1, updatedAt: "" },
  datasheet: null,
  images: [],
  specs: [],
  ...extra,
});

const cat: PublicCatalogue = {
  version: 3,
  publishedAt: "",
  brands: [{ id: 1, slug: "acme", name: "Acme", description: null }],
  categories: [
    { id: 1, slug: "solar-panels", name: "Solar Panels", description: null, sort: 1 },
    { id: 2, slug: "inverters", name: "Inverters", description: null, sort: 2 },
    { id: 3, slug: "batteries", name: "Batteries", description: null, sort: 3 },
  ],
  products: [
    product(1, "Acme 540 Wp Mono Panel", 1, { specs: [{ k: "power_wp", l: "Maximum power", v: "540", u: "Wp", g: "Electrical" }, { k: "efficiency_pct", l: "Module efficiency", v: "21.1", u: "%", g: "Electrical" }], datasheet: "/api/media/r2:ds/540.pdf" }),
    product(2, "Acme 550 Wp Mono Panel", 1, { specs: [{ k: "power_wp", l: "Maximum power", v: "550", u: "Wp", g: "Electrical" }], offer: { label: "Festival offer" }, price: { sellingPaise: 1200000, mrpPaise: 1500000, gstIncluded: true, gstRate: 12, unit: "per piece", version: 1, updatedAt: "" } }),
    product(3, "Acme 5 kW On-grid Inverter", 2, { stock: "limited" }),
    product(4, "Acme 150 Ah Tubular Battery", 3, { stock: "out_of_stock", price: { sellingPaise: null, mrpPaise: null, gstIncluded: true, gstRate: 18, unit: "per piece", version: 1, updatedAt: "" } }),
  ],
  faqs: [
    { id: 11, topic: "Delivery", q: "Do you deliver to my area?", a: "We deliver across Tamil Nadu.", qTa: "உங்கள் பகுதிக்கு டெலிவரி செய்வீர்களா?", aTa: "தமிழ்நாடு முழுவதும் டெலிவரி செய்கிறோம்.", k: "shipping, courier, transport" },
    { id: 12, topic: "Billing", q: "Do you give a GST invoice?", a: "Yes, every order has a GST invoice.", qTa: null, aTa: null, k: "gst bill, tax invoice" },
  ],
};

const ctx = (over: Partial<HelperContext> = {}): HelperContext => ({
  cat,
  index: buildIndex(cat),
  lang: "en",
  signedIn: false,
  lessons: [{ slug: "mppt-explained", title: "What an MPPT does", summary: "How the inverter finds the best operating point." }],
  site: { phoneDisplay: "+91 90000 00000", phoneHref: "tel:+919000000000", whatsappUrl: "https://wa.me/919000000000", email: "hello@example.com", address: ["1 Street", "Chennai"], hours: "", social: [] },
  ...over,
});

describe("website helper", () => {
  it("greets with suggestions built from the live catalogue", () => {
    const a = welcome(ctx());
    expect(a.chips).toContain("Today's offers");
    expect(a.chips).toContain("Show Solar Panels");
    expect(a.chips).toContain("Do you deliver to my area?");
    expect(a.chips).not.toContain("My points");
    expect(welcome(ctx({ signedIn: true })).chips).toContain("My points");
  });

  it("answers from the owner's questions & answers, in Tamil when asked in Tamil", () => {
    expect(reply("do u deliver to madurai?", ctx()).faq).toBe(11);
    expect(reply("courier charges", ctx()).faq).toBe(11);
    expect(reply("gst bill", ctx()).faq).toBe(12);
    const ta = reply("டெலிவரி செய்வீர்களா", ctx({ lang: "ta" }));
    expect(ta.faq).toBe(11);
    expect(ta.text).toContain("தமிழ்நாடு");
  });

  it("finds products and answers price, stock, offer and datasheet questions from the catalogue only", () => {
    const price = reply("price of 550 wp panel", ctx());
    expect(price.products).toEqual([2]);
    expect(price.text).toContain("12,000");
    expect(price.text).toContain("20% off"); // computed from the listed MRP
    expect(reply("is the 5 kw inverter in stock", ctx()).text).toContain("Limited stock");
    expect(reply("battery price", ctx()).text).toContain("Price on request");
    const ds = reply("540 wp datasheet", ctx());
    expect(ds.links?.[0].to).toBe("/api/media/r2:ds/540.pdf");
    expect(reply("efficiency of 540 wp panel", ctx()).text).toContain("Module efficiency: 21.1 %");
    expect(reply("datasheet of 550 wp panel", ctx()).text).toContain("no datasheet");
  });

  it("answers about the product on screen", () => {
    const p = cat.products[0];
    expect(reply("price?", ctx({ focus: p })).products).toEqual([1]);
  });

  it("lists offers, categories and compares", () => {
    expect(reply("any offers today", ctx()).products).toEqual([2]);
    expect(reply("show batteries", ctx()).products).toEqual([4]);
    const cmp = reply("compare 540 wp panel vs 550 wp panel", ctx());
    expect(cmp.compare).toEqual([1, 2]);
  });

  it("sizes a system from units or a bill, with the stated tariff and real panels", () => {
    expect(usageFrom("300 units per month")).toEqual({ kwh: 300, bill: null });
    expect(usageFrom("10 units a day")).toEqual({ kwh: 300, bill: null });
    expect(usageFrom("my bill is ₹3,500")).toEqual({ kwh: 500, bill: 3500 });
    const a = reply("how many panels for 400 units", ctx());
    expect(a.text).toContain("3.3 kWp");
    expect(a.text).toContain("550 Wp");
    expect(a.products).toEqual([2]);
    expect(a.links?.[0].to).toContain("/solar-tools/sizing?kwh=400");
    expect(reply("what size solar do i need", ctx()).chips?.length).toBe(3);
  });

  it("gives contact details from the site settings", () => {
    expect(reply("what is your phone number", ctx()).text).toContain("+91 90000 00000");
    expect(reply("where is your shop", ctx()).text).toContain("Chennai");
    expect(reply("timings", ctx()).text).toContain("call or WhatsApp");
    expect(reply("முகவரி", ctx({ lang: "ta" })).text).toContain("எங்கள் முகவரி");
  });

  it("only reads the visitor's own account, and asks them to sign in otherwise", () => {
    expect(reply("my points", ctx()).need).toBeUndefined();
    expect(reply("my points", ctx({ signedIn: true })).need).toBe("points");
    expect(reply("status of my enquiry", ctx({ signedIn: true })).need).toBe("enquiries");
  });

  it("explains with lessons and admits when it does not know", () => {
    expect(reply("what is mppt", ctx()).links?.[0].to).toBe("/learn/mppt-explained");
    const miss = reply("can you fix my car", ctx());
    expect(miss.miss).toBe(true);
    expect(miss.links?.map((l) => l.to)).toContain("https://wa.me/919000000000");
  });

  it("explains how to use the website", () => {
    expect(reply("how do I create an account", ctx()).links?.[0].to).toBe("/account");
    expect(reply("forgot password", ctx()).text).toContain("reset link");
    expect(reply("how can I compare products?", ctx()).links?.[0].to).toBe("/compare");
    expect(reply("which tools do you have", ctx()).links?.[0].to).toBe("/solar-tools");
    expect(reply("how do I place an order", ctx()).links?.[0].to).toBe("/enquiry");
    expect(reply("கணக்கு எப்படி தொடங்குவது", ctx({ lang: "ta" })).links?.[0].to).toBe("/account");
    // a product question still gets the product, not the guide
    expect(reply("540 wp datasheet", ctx()).products).toEqual([1]);
  });

  it("never invents: the FAQ matcher needs real overlap", () => {
    expect((bestFaq(cat.faqs!, "solar panel price", "en")?.score ?? 0) < 0.4).toBe(true);
  });
});

describe("staff helper", () => {
  const sctx = (role: AdminRole): StaffContext => ({ ...ctx(), staff: true, role });

  it("opens the person's own day and filtered lists", () => {
    expect(staffReply("my day", sctx("viewer")).need).toBe("myday");
    expect(staffReply("overdue follow-ups", sctx("viewer")).need).toBe("myday");
    expect(staffReply("VS-261121-AB12C", sctx("viewer")).links?.[0].to).toBe("/admin/enquiries?q=VS-261121-AB12C");
    expect(staffReply("find VSQ-2611-0007", sctx("viewer")).links?.[0].to).toBe("/admin/quotations?q=VSQ-2611-0007");
  });

  it("prefills a new quotation", () => {
    const a = staffReply("new quote for Ravi Kumar 98400 12345", sctx("viewer"));
    expect(a.links?.[0].to).toBe("/admin/quotations/new?name=Ravi+Kumar&mobile=9840012345");
  });

  it("keeps owner/admin topics away from sales staff", () => {
    for (const q of ["staff performance", "customer list", "approve bonus", "reassign enquiries", "add points", "how do i delete a quotation"]) {
      const a = staffReply(q, sctx("viewer"));
      expect(a.text, q).toBe("That's only available to the owner or an admin.");
      expect(a.links, q).toBeUndefined();
      expect(a.need, q).toBeUndefined();
    }
    // pages they can open but not change: a clear note plus the page
    const price = staffReply("how do I change a price?", sctx("viewer"));
    expect(price.text).toContain("only the owner, an admin or a price editor can change it");
    expect(price.links?.[0].to).toBe("/admin/prices");
    expect(staffReply("my bonus", sctx("viewer")).links?.[0].to).toBe("/admin/my-bonus");
    expect(staffReply("change price", sctx("price_editor")).links?.[0].to).toBe("/admin/prices");
    expect(staffReply("approve bonus", sctx("admin")).links?.[0].to).toBe("/admin/bonus");
    expect(staffReply("add staff", sctx("admin")).text).toBe("That's only available to the owner.");
    expect(staffReply("add staff", sctx("owner")).links?.[0].to).toBe("/admin/users");
  });

  it("knows every admin module, in any wording", () => {
    const photos = staffReply("uploading photos", sctx("admin"));
    expect(photos.text).toContain("Upload images");
    expect(photos.links?.[0].to).toBe("/admin/products");
    expect(staffReply("how to upload product images", sctx("owner")).text).toContain("Upload images");
    expect(staffReply("where do I add a datasheet", sctx("admin")).text).toContain("Datasheet (PDF)");
    expect(staffReply("check products", sctx("admin")).links?.[0].to).toBe("/admin/products");
    expect(staffReply("how do I set an offer?", sctx("admin")).text).toContain("Availability & offer");
    expect(staffReply("changing price", sctx("price_editor")).links?.[0].to).toBe("/admin/prices");
    expect(staffReply("mark out of stock", sctx("admin")).text).toContain("Out of stock");
    expect(staffReply("how do I add a brand", sctx("admin")).links?.[0].to).toBe("/admin/catalogue");
    expect(staffReply("field photos", sctx("admin")).links?.[0].to).toBe("/admin/field-photos");
    expect(staffReply("download excel", sctx("viewer")).text).toContain("Download Excel");
    expect(staffReply("set follow up date", sctx("viewer")).text).toContain("follow-up date");
    expect(staffReply("how do I send a quotation?", sctx("viewer")).text).toContain("WhatsApp");
    expect(staffReply("change my password", sctx("viewer")).text).toContain("Password");
    expect(staffReply("add a question to faq", sctx("admin")).links?.[0].to).toBe("/admin/settings#faqs");
    expect(staffReply("What can I do?", sctx("viewer")).text).toContain("Sales staff");
    expect(staffReply("பொருள் படம் எப்படி பதிவேற்றுவது?", sctx("admin")).links?.[0].to).toBe("/admin/products");
  });

  it("answers product questions from the public catalogue and offers", () => {
    expect(staffReply("price of 540 wp panel", sctx("viewer")).products).toEqual([1]);
    expect(staffReply("Today's offers", sctx("viewer")).products).toEqual([2]);
  });
});
