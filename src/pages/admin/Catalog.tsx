import { useConfirm } from "../../components/confirm";
import { usePaged } from "../../components/Pager";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { slugify } from "../../../shared/admin-schemas";
import type { AdminBrand, AdminCategory } from "../../../shared/types";
import { Modal, Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { useAdmin } from "./AdminLayout";
import { canManage, errorText, FileDrop, fieldErrors, PageHead, ReadOnlyNote, send, Toggle, uploadFile, ExportButton } from "./kit";

interface BrandForm {
  name: string;
  slug: string;
  description: string;
  website: string;
  logoKey: string;
  logoUrl: string;
  sortOrder: string;
  isActive: boolean;
}
interface CatForm {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
}

export default function Catalog() {
  const admin = useAdmin();
  const editable = canManage(admin);
  const toast = useToast();
  const confirm = useConfirm();
  const { reload } = useCatalogue();
  const [brands, setBrands] = useState<AdminBrand[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const pgB = usePaged(brands ?? [], "admin.brands", 10, { newAtEnd: true });
  const pgC = usePaged(cats ?? [], "admin.categories", 10, { newAtEnd: true });
  const [brandEdit, setBrandEdit] = useState<{ id: number | null; f: BrandForm } | null>(null);
  const [catEdit, setCatEdit] = useState<{ id: number | null; f: CatForm } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api<{ brands: AdminBrand[] }>("/api/admin/brands").then((r) => setBrands(r.brands));
    api<{ categories: AdminCategory[] }>("/api/admin/categories").then((r) => setCats(r.categories));
  }, []);

  const saveBrand = async () => {
    if (!brandEdit) return;
    const { id, f } = brandEdit;
    setBusy(true);
    setErrs({});
    try {
      const body = { name: f.name, slug: f.slug, description: f.description, website: f.website, logoKey: f.logoKey, sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive };
      const r = id ? await send<{ brands: AdminBrand[] }>(`/api/admin/brands/${id}`, "PUT", body) : await send<{ brands: AdminBrand[] }>("/api/admin/brands", "POST", body);
      setBrands(r.brands);
      setBrandEdit(null);
      reload();
      toast("Brand saved.", "success");
    } catch (e) {
      setErrs({ ...fieldErrors(e), _: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const saveCat = async () => {
    if (!catEdit) return;
    const { id, f } = catEdit;
    setBusy(true);
    setErrs({});
    try {
      const body = { name: f.name, slug: f.slug, description: f.description, sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive };
      const r = id ? await send<{ categories: AdminCategory[] }>(`/api/admin/categories/${id}`, "PUT", body) : await send<{ categories: AdminCategory[] }>("/api/admin/categories", "POST", body);
      setCats(r.categories);
      setCatEdit(null);
      reload();
      toast("Category saved.", "success");
    } catch (e) {
      setErrs({ ...fieldErrors(e), _: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const delBrand = async (b: AdminBrand) => {
    if (!(await confirm({ title: `Delete the brand “${b.name}”?`, message: "This cannot be undone. To keep it but take it off the website, edit it and switch it to hidden instead.", confirmLabel: "Delete brand", tone: "danger" }))) return;
    try {
      setBrands((await send<{ brands: AdminBrand[] }>(`/api/admin/brands/${b.id}`, "DELETE")).brands);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const delCat = async (c: AdminCategory) => {
    if (!(await confirm({ title: `Delete the category “${c.name}”?`, message: "This cannot be undone. To keep it but take it off the website, edit it and switch it to hidden instead.", confirmLabel: "Delete category", tone: "danger" }))) return;
    try {
      setCats((await send<{ categories: AdminCategory[] }>(`/api/admin/categories/${c.id}`, "DELETE")).categories);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const text = <T extends object>(state: { id: number | null; f: T }, setState: (s: { id: number | null; f: T }) => void, k: keyof T & string, label: string, opts: { req?: boolean; hint?: string; area?: boolean; autoSlug?: boolean } = {}) => (
    <div>
      <label htmlFor={`cf-${k}`} className="label">
        {label} {opts.req && <span className="text-danger">*</span>}
      </label>
      {opts.area ? (
        <textarea id={`cf-${k}`} rows={3} className="field" value={state.f[k] as string} onChange={(e) => setState({ ...state, f: { ...state.f, [k]: e.target.value } })} />
      ) : (
        <input
          id={`cf-${k}`}
          className={`field ${errs[k] ? "!border-danger" : ""}`}
          value={state.f[k] as string}
          onChange={(e) => {
            const v = e.target.value;
            const next = { ...state.f, [k]: v } as T;
            if (opts.autoSlug && state.id === null) (next as { slug: string }).slug = slugify(v);
            setState({ ...state, f: next });
          }}
        />
      )}
      {errs[k] ? <p className="mt-1 text-xs text-danger">{errs[k]}</p> : opts.hint && <p className="mt-1 text-xs text-subtle">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="container-x py-10">
      <PageHead
        actions={
          <ExportButton
            name="Brands and categories"
            build={() => [
              { name: "Brands", columns: [{ header: "Brand" }, { header: "Web slug" }, { header: "Products", type: "number" }, { header: "Visible" }, { header: "Website" }, { header: "Order", type: "number" }, { header: "Description" }], rows: (brands ?? []).map((b) => [b.name, b.slug, b.productCount, b.isActive ? "Yes" : "No", b.website, b.sortOrder, b.description]) },
              { name: "Categories", columns: [{ header: "Category" }, { header: "Web slug" }, { header: "Products", type: "number" }, { header: "Visible" }, { header: "Order", type: "number" }, { header: "Description" }], rows: (cats ?? []).map((c) => [c.name, c.slug, c.productCount, c.isActive ? "Yes" : "No", c.sortOrder, c.description]) },
            ]}
          />
        }
        title="Brands & categories"
        intro="Add a new manufacturer or product type here, then add its products under Products. Hidden brands and categories disappear from the website with all their products." />
      <ReadOnlyNote admin={admin} />

      <div className="mt-8 grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-2">
        <section className="min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Brands</h2>
            {editable && (
              <button
                type="button"
                className="btn-primary btn-sm"
                data-testid="new-brand"
                onClick={() => {
                  setErrs({});
                  setBrandEdit({ id: null, f: { name: "", slug: "", description: "", website: "", logoKey: "", logoUrl: "", sortOrder: "0", isActive: true } });
                }}
              >
                <Plus className="size-4" /> Add brand
              </button>
            )}
          </div>
          {!brands ? (
            <Spinner />
          ) : (
            <ul className="card mt-3 divide-y divide-line">
              {pgB.items.map((b) => (
                <li key={b.id} className="flex items-center gap-3 p-3">
                  <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white">{b.logoUrl ? <img src={b.logoUrl} alt="" className="size-full object-contain p-1" /> : <span className="text-sm font-semibold text-subtle">{b.name[0]}</span>}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {b.name} {!b.isActive && <EyeOff className="ml-1 inline size-3.5 text-subtle" aria-label="Hidden" />}
                    </p>
                    <p className="text-xs text-muted">
                      <Link className="hover:underline" to={`/admin/products?brand=${b.id}`}>
                        {b.productCount} product(s)
                      </Link>{" "}
                      · /{b.slug}
                    </p>
                  </div>
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted hover:bg-paper-2"
                        aria-label={`Edit ${b.name}`}
                        onClick={() => {
                          setErrs({});
                          setBrandEdit({ id: b.id, f: { name: b.name, slug: b.slug, description: b.description ?? "", website: b.website ?? "", logoKey: b.logoKey ?? "", logoUrl: b.logoUrl ?? "", sortOrder: String(b.sortOrder), isActive: b.isActive } });
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30" disabled={b.productCount > 0} title={b.productCount > 0 ? "Has products — hide it instead" : "Delete"} aria-label={`Delete ${b.name}`} onClick={() => delBrand(b)}>
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pgB.pager}
        </section>

        <section className="min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Categories</h2>
            {editable && (
              <button
                type="button"
                className="btn-primary btn-sm"
                data-testid="new-category"
                onClick={() => {
                  setErrs({});
                  setCatEdit({ id: null, f: { name: "", slug: "", description: "", sortOrder: String(((cats ?? []).at(-1)?.sortOrder ?? 0) + 10), isActive: true } });
                }}
              >
                <Plus className="size-4" /> Add category
              </button>
            )}
          </div>
          {!cats ? (
            <Spinner />
          ) : (
            <ul className="card mt-3 divide-y divide-line">
              {pgC.items.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  <span className="num w-10 shrink-0 text-xs text-subtle">{c.sortOrder}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {c.name} {c.isActive ? <Eye className="ml-1 inline size-3.5 text-verdi-600" aria-label="Visible" /> : <EyeOff className="ml-1 inline size-3.5 text-subtle" aria-label="Hidden" />}
                    </p>
                    <p className="text-xs text-muted">
                      <Link className="hover:underline" to={`/admin/products?category=${c.id}`}>
                        {c.productCount} product(s)
                      </Link>{" "}
                      · /category/{c.slug}
                    </p>
                  </div>
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted hover:bg-paper-2"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => {
                          setErrs({});
                          setCatEdit({ id: c.id, f: { name: c.name, slug: c.slug, description: c.description ?? "", sortOrder: String(c.sortOrder), isActive: c.isActive } });
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30" disabled={c.productCount > 0} title={c.productCount > 0 ? "Has products — hide it instead" : "Delete"} aria-label={`Delete ${c.name}`} onClick={() => delCat(c)}>
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pgC.pager}
        </section>
      </div>

      <Modal
        open={!!brandEdit}
        onClose={() => setBrandEdit(null)}
        title={brandEdit?.id ? "Edit brand" : "Add brand"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setBrandEdit(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={saveBrand} disabled={busy || uploading} data-testid="save-brand">
              {busy && <Spinner className="size-4" />} Save brand
            </button>
          </div>
        }
      >
        {brandEdit && (
          <div className="grid gap-3 p-5">
            {text(brandEdit, setBrandEdit, "name", "Brand name", { req: true, autoSlug: true })}
            {text(brandEdit, setBrandEdit, "slug", "Web slug", { req: true, hint: "Used in filters and links, e.g. waaree" })}
            {text(brandEdit, setBrandEdit, "description", "Description", { area: true })}
            {text(brandEdit, setBrandEdit, "website", "Manufacturer website", { hint: "https://…" })}
            <div>
              <p className="label">Logo</p>
              <div className="flex items-center gap-3">
                {brandEdit.f.logoUrl && <img src={brandEdit.f.logoUrl} alt="" className="size-16 rounded-xl border border-line bg-white object-contain p-1" />}
                <div className="flex-1">
                  <FileDrop
                    accept="image/png,image/webp,image/jpeg"
                    label={brandEdit.f.logoUrl ? "Replace logo" : "Upload logo"}
                    busy={uploading}
                    onFiles={async ([file]) => {
                      setUploading(true);
                      try {
                        const up = await uploadFile(file, "logo");
                        setBrandEdit((s) => (s ? { ...s, f: { ...s.f, logoKey: up.storageKey, logoUrl: up.url } } : s));
                      } catch (e) {
                        toast(errorText(e, "Upload failed."), "error");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              {text(brandEdit, setBrandEdit, "sortOrder", "Sort order")}
              <Toggle id="b-active" checked={brandEdit.f.isActive} onChange={(v) => setBrandEdit({ ...brandEdit, f: { ...brandEdit.f, isActive: v } })} label="Visible on website" />
            </div>
            {errs._ && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{errs._}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={!!catEdit}
        onClose={() => setCatEdit(null)}
        title={catEdit?.id ? "Edit category" : "Add category"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCatEdit(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={saveCat} disabled={busy} data-testid="save-category">
              {busy && <Spinner className="size-4" />} Save category
            </button>
          </div>
        }
      >
        {catEdit && (
          <div className="grid gap-3 p-5">
            {text(catEdit, setCatEdit, "name", "Category name", { req: true, autoSlug: true })}
            {text(catEdit, setCatEdit, "slug", "Web slug", { req: true, hint: "Page address: /category/<slug>" })}
            {text(catEdit, setCatEdit, "description", "Description", { area: true })}
            <div className="grid grid-cols-2 items-end gap-3">
              {text(catEdit, setCatEdit, "sortOrder", "Sort order", { hint: "Lower numbers appear first" })}
              <Toggle id="c-active" checked={catEdit.f.isActive} onChange={(v) => setCatEdit({ ...catEdit, f: { ...catEdit.f, isActive: v } })} label="Visible on website" />
            </div>
            {errs._ && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{errs._}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
