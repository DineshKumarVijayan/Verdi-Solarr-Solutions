import { describe, expect, it } from "vitest";
import { BrandInputSchema, normaliseMobile, ProductInputSchema, RegisterSchema, slugify, specKeyFrom } from "../../shared/admin-schemas";
import { sniff } from "../../worker/content";
import { hashPassword, ITERATIONS, randomToken, sha256Hex, timingSafeEqual, verifyPassword } from "../../worker/crypto";
// @ts-expect-error plain JS setup-script helper
import { hashPassword as scriptHash } from "../../scripts/lib/passwords.mjs";

const PROD = { ENVIRONMENT: "production", PASSWORD_PEPPER: "test-secret-key-1" };

describe("password hashing", () => {
  it("hashes with a random salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse battery", PROD);
    const b = await hashPassword("correct horse battery", PROD);
    expect(a.startsWith(`pbkdf2p_sha256$${ITERATIONS}$`)).toBe(true);
    expect(a.split("$")).toHaveLength(4);
    expect(a).not.toBe(b); // salted
    expect(a).not.toContain("correct");
    expect(await verifyPassword("correct horse battery", a, PROD)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a, PROD)).toBe(false);
    expect(await verifyPassword("", a, PROD)).toBe(false);
  });
  it("needs the same secret key: a stolen hash is useless without it", async () => {
    const a = await hashPassword("correct horse battery", PROD);
    expect(await verifyPassword("correct horse battery", a, { ...PROD, PASSWORD_PEPPER: "other-key" })).toBe(false);
  });
  it("production refuses to work without the secret key", async () => {
    await expect(hashPassword("x", { ENVIRONMENT: "production" })).rejects.toThrow();
  });
  it("setup script (npm run admin:set) produces hashes the Worker accepts", async () => {
    const h = await scriptHash("Owner@12345", PROD.PASSWORD_PEPPER);
    expect(await verifyPassword("Owner@12345", h, PROD)).toBe(true);
  });
  it("rejects malformed or weakened stored hashes", async () => {
    expect(await verifyPassword("x", "plaintext", PROD)).toBe(false);
    expect(await verifyPassword("x", "pbkdf2p_sha256$1$AAAA$AAAA", PROD)).toBe(false);
    expect(await verifyPassword("x", "md5$100000$AAAA$AAAA", PROD)).toBe(false);
  });
  it("tokens are random and only their digest is stored", async () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
    expect(await sha256Hex(t)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("constant-time compare", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
  });
});

describe("upload type sniffing (never trusts the browser's file type)", () => {
  const b = (...x: number[]) => new Uint8Array([...x, ...new Array(16).fill(0)]);
  it("detects real PDF, JPEG, PNG and WebP", () => {
    expect(sniff(b(0x25, 0x50, 0x44, 0x46, 0x2d))?.type).toBe("application/pdf");
    expect(sniff(b(0xff, 0xd8, 0xff, 0xe0))?.type).toBe("image/jpeg");
    expect(sniff(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.type).toBe("image/png");
    expect(sniff(b(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))?.type).toBe("image/webp");
  });
  it("rejects HTML/SVG/scripts disguised as images", () => {
    expect(sniff(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniff(new TextEncoder().encode("<!doctype html><script>"))).toBeNull();
  });
});

describe("account & catalogue input validation", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normaliseMobile("98765 43210")).toBe("919876543210");
    expect(normaliseMobile("+91-98765-43210")).toBe("919876543210");
    expect(normaliseMobile("09876543210")).toBe("919876543210");
    expect(normaliseMobile("12345")).toBeNull();
    expect(normaliseMobile("5876543210")).toBeNull();
  });
  it("registration requires a real mobile and an 8+ character password", () => {
    expect(RegisterSchema.safeParse({ name: "Ravi", mobile: "9876543210", password: "longenough" }).success).toBe(true);
    expect(RegisterSchema.safeParse({ name: "Ravi", mobile: "9876543210", password: "short" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ name: "Ravi", mobile: "abc", password: "longenough" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ name: "Ravi", mobile: "9876543210", password: "longenough", isAdmin: true }).success).toBe(false); // strict
  });
  it("slugs and spec keys", () => {
    expect(slugify("Anchor 540 Wp TOPCon (Bifacial)")).toBe("anchor-540-wp-topcon-bifacial");
    expect(specKeyFrom("Max. power (Pmax)")).toBe("max_power_pmax");
  });
  it("brand and product inputs are strict and safe", () => {
    expect(BrandInputSchema.safeParse({ name: "Waaree", slug: "waaree", website: "javascript:alert(1)" }).success).toBe(false);
    expect(BrandInputSchema.safeParse({ name: "Waaree", slug: "Waaree Energies" }).success).toBe(false);
    expect(BrandInputSchema.safeParse({ name: "Waaree", slug: "waaree", logoKey: "r2:logo/2026/11/abc.png" }).success).toBe(true);
    expect(BrandInputSchema.safeParse({ name: "Waaree", slug: "waaree", logoKey: "r2:../../secret" }).success).toBe(false);
    const base = { sku: "VS-1", slug: "vs-1", name: "Module", brandId: 1, categoryId: 1 };
    expect(ProductInputSchema.safeParse(base).success).toBe(true);
    const dup = { ...base, specs: [{ key: "power_wp", label: "P", value: "1" }, { key: "power_wp", label: "P2", value: "2" }] };
    expect(ProductInputSchema.safeParse(dup).success).toBe(false);
    const price = { ...base, price: { sellingPricePaise: 200, mrpPaise: 100, gstIncluded: false, gstRate: 18, priceUnit: "per piece" } };
    expect(ProductInputSchema.safeParse(price).success).toBe(false); // selling > MRP
    expect(ProductInputSchema.safeParse({ ...base, price: { ...price.price, sellingPricePaise: 12.5 } }).success).toBe(false); // paise must be integers
  });
});
