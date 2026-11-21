// What a category IS, recognised from its name/slug, so features keep working when the admin
// recreates categories with different names ("Solar Modules" instead of "Solar Panels", etc.).
// Anything not recognised is "other" and gets the general behaviour.

export type CategoryRole = "panels" | "inverters" | "optimisers" | "dc-cables" | "ac-cables" | "street-lights" | "other";

export function categoryRole(c: { slug: string; name?: string } | null | undefined): CategoryRole {
  if (!c) return "other";
  const t = `${c.slug} ${c.name ?? ""}`.toLowerCase().replace(/[-_]+/g, " ");
  if (/optimi[sz]er/.test(t)) return "optimisers";
  if (/inverter/.test(t)) return "inverters";
  if (/street ?light/.test(t)) return "street-lights";
  if (/\b(solar )?dc cable|solar cable|pv cable/.test(t)) return "dc-cables";
  if (/\bac cable|single core|armou?red|power cable/.test(t)) return "ac-cables";
  if (/\bpanel|\bmodule/.test(t)) return "panels";
  return "other";
}

/**
 * Products for a page that lists categories by slug (e.g. a local landing page): a product matches when its
 * category has one of those slugs OR the same role as one of them (so renamed categories still match).
 * No match at all: the page shows the featured products, then the rest.
 */
export function productsForCategorySlugs<P extends { categoryId: number; featured: boolean }>(
  slugs: string[],
  categories: { id: number; slug: string; name: string }[],
  products: P[],
): P[] {
  if (slugs.length === 0) return [...products.filter((p) => p.featured), ...products.filter((p) => !p.featured)];
  const roles = new Set<CategoryRole>(slugs.map((s) => categoryRole({ slug: s })).filter((r) => r !== "other"));
  const wanted = new Set(categories.filter((c) => slugs.includes(c.slug) || roles.has(categoryRole(c))).map((c) => c.id));
  const hit = products.filter((p) => wanted.has(p.categoryId));
  return hit.length ? hit : [...products.filter((p) => p.featured), ...products.filter((p) => !p.featured)];
}
