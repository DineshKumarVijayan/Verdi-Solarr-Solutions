import { STOCK_LABEL } from "../../../shared/stock";
import { QuickStatus } from "./Availability";
import { Copy, Eye, EyeOff, FileText, ImageIcon, Pencil, Plus, Search, Star } from "lucide-react";
import { usePaged } from "../../components/Pager";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { formatPaise } from "../../../shared/money";
import type { AdminBrand, AdminCategory, AdminProductDetail, AdminProductListRow } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useAdmin } from "./AdminLayout";
import { canManage, errorText, PageHead, send, ExportButton, FilterNote } from "./kit";

export default function AdminProducts() {
  const admin = useAdmin();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminProductListRow[] | null>(null);
  const pg = usePaged(rows ?? [], "admin.products");
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const sp = new URLSearchParams(params);
    api<{ rows: AdminProductListRow[] }>(`/api/admin/products?${sp}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(errorText(e)));
  }, [params]);
  useEffect(load, [load]);
  useEffect(() => {
    api<{ brands: AdminBrand[] }>("/api/admin/brands").then((r) => setBrands(r.brands)).catch(() => undefined);
    api<{ categories: AdminCategory[] }>("/api/admin/categories").then((r) => setCats(r.categories)).catch(() => undefined);
  }, []);

  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  const duplicate = async (id: number) => {
    try {
      const r = await send<{ product: AdminProductDetail }>(`/api/admin/products/${id}/duplicate`, "POST");
      toast("Copy created (hidden). Edit it, then switch it on.", "success");
      nav(`/admin/products/${r.product.id}`);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <div className="container-x py-10 max-lg:pt-3">
      <PageHead
        title="Products"
        intro="Add, edit, hide or remove products. Changes publish to every page of the website straight away."
        actions={
          <>
            <ExportButton
              name="Products"
              build={() => [
                {
                  name: "Products",
                  columns: [{ header: "SKU" }, { header: "Product" }, { header: "Model" }, { header: "Series" }, { header: "Brand" }, { header: "Category" }, { header: "Price (₹)", type: "money" }, { header: "Visible" }, { header: "Featured" }, { header: "Stock" }, { header: "Offer" }, { header: "Photos", type: "number" }, { header: "Datasheet" }, { header: "Updated", type: "datetime" }],
                  rows: (rows ?? []).map((p) => [p.sku, p.name, p.model, p.seriesName, p.brand, p.category, p.sellingPaise == null ? "Price on request" : p.sellingPaise / 100, p.isActive ? "Yes" : "No", p.isFeatured ? "Yes" : "No", STOCK_LABEL[p.stock], p.onOffer ? p.offerLabel || "Special offer" : null, p.images, p.hasDatasheet ? "Yes" : "No", p.updatedAt]),
                },
              ]}
            />
            {canManage(admin) && (
              <Link to="/admin/products/new" className="btn-primary btn-sm" data-testid="new-product">
                <Plus className="size-4" /> Add product
              </Link>
            )}
          </>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input
            aria-label="Search products"
            className="field !rounded-full pl-10"
            placeholder="Search name, SKU, model or series"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && set("q", q.trim())}
            onBlur={() => set("q", q.trim())}
          />
        </div>
        <select aria-label="Brand" className="field !w-auto !rounded-full" value={params.get("brand") ?? ""} onChange={(e) => set("brand", e.target.value)}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select aria-label="Category" className="field !w-auto !rounded-full" value={params.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Status" className="field !w-auto !rounded-full" value={params.get("status") ?? "all"} onChange={(e) => set("status", e.target.value === "all" ? "" : e.target.value)}>
          <option value="all">Visible & hidden</option>
          <option value="active">Visible only</option>
          <option value="inactive">Hidden only</option>
        </select>
      </div>
      {params.get("missing") && <FilterNote label={params.get("missing") === "images" ? "Without photos" : "Without a datasheet"} onClear={() => set("missing", "")} />}

      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!rows ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-muted">{rows.length} product(s)</p>
          <div className="card mt-2 md:overflow-x-auto">
            <table className="rtable w-full text-left text-sm md:min-w-[760px]">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Brand · category</th>
                  <th className="p-3 text-right font-medium">Price</th>
                  <th className="p-3 font-medium">Files</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {pg.items.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-paper" data-testid="admin-product-row">
                    <td className="rt-title p-3">
                      <Link to={`/admin/products/${r.id}`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <p className="num text-xs text-muted">
                        {r.sku}
                        {r.model ? ` · ${r.model}` : ""}
                      </p>
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {r.brand}
                      <br className="max-md:hidden" />
                      <span className="md:hidden"> · </span>
                      {r.category}
                    </td>
                    <td className="rt-aside num p-3 text-right">{r.sellingPaise != null ? formatPaise(r.sellingPaise) : <span className="text-xs font-normal text-subtle">Price not set</span>}</td>
                    <td className="rt-chip p-3">
                      <span className={`mr-2 inline-flex items-center gap-1 text-xs ${r.images ? "text-ink" : "text-subtle"}`} title="Images">
                        <ImageIcon className="size-3.5" />
                        {r.images}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs ${r.hasDatasheet ? "text-ink" : "text-subtle"}`} title="Datasheet">
                        <FileText className="size-3.5" />
                        {r.hasDatasheet ? "PDF" : "—"}
                      </span>
                    </td>
                    <td className="rt-chip p-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${r.isActive ? "bg-verdi-100 text-verdi-800" : "bg-paper-3 text-muted"}`}>
                        {r.isActive ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                        {r.isActive ? "Visible" : "Hidden"}
                      </span>
                      {r.isFeatured && <Star className="ml-1 inline size-3.5 fill-sun-400 text-sun-400" aria-label="Featured" />}
                      <span className="mt-1.5 flex">
                        <QuickStatus productId={r.id} editable={canManage(admin)} value={{ stock: r.stock, onOffer: r.onOffer, offerLabel: r.offerLabel }} onSaved={(v) => setRows((rs) => rs!.map((x) => (x.id === r.id ? { ...x, ...v } : x)))} />
                      </span>
                    </td>
                    <td className="rt-actions p-3 text-right whitespace-nowrap">
                      <Link to={`/admin/products/${r.id}`} className="inline-flex rounded-full p-2 text-muted hover:bg-paper-2 hover:text-ink" aria-label={`Edit ${r.name}`}>
                        <Pencil className="size-4" />
                      </Link>
                      {canManage(admin) && (
                        <button type="button" className="rounded-full p-2 text-muted hover:bg-paper-2 hover:text-ink" onClick={() => duplicate(r.id)} aria-label={`Duplicate ${r.name}`} title="Duplicate (e.g. for a new wattage variant)">
                          <Copy className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pg.pager}
        </>
      )}
    </div>
  );
}
