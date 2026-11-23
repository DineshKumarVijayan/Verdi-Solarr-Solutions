import { useConfirm } from "../../components/confirm";
import { usePaged } from "../../components/Pager";
import { ArrowDown, ArrowUp, ExternalLink, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminFieldPhoto } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { useAdmin } from "./AdminLayout";
import { canManage, errorText, FileDrop, PageHead, ReadOnlyNote, send, Toggle, uploadFile } from "./kit";

const toBody = (p: AdminFieldPhoto) => ({ storageKey: p.storageKey, caption: p.caption, tag: p.tag, tall: p.tall, sortOrder: p.sortOrder, isActive: p.isActive });
const captionFromFile = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
    .slice(0, 120) || "Field photo";

export default function FieldPhotos() {
  const admin = useAdmin();
  const editable = canManage(admin);
  const toast = useToast();
  const confirm = useConfirm();
  const { reload } = useCatalogue();
  const [photos, setPhotos] = useState<AdminFieldPhoto[] | null>(null);
  const pg = usePaged(photos ?? [], "admin.fieldPhotos", 10, { newAtEnd: true });
  const [drafts, setDrafts] = useState<Record<number, AdminFieldPhoto>>({});
  const [uploading, setUploading] = useState(false);
  const [tag, setTag] = useState("Rooftop");

  useEffect(() => {
    api<{ photos: AdminFieldPhoto[] }>("/api/admin/field-photos").then((r) => setPhotos(r.photos));
  }, []);

  const tags = [...new Set([...(photos ?? []).map((p) => p.tag), "Rooftop", "Inverters", "Mounting", "Protection", "Stock"])];
  const done = (r: { photos: AdminFieldPhoto[] }, msg?: string) => {
    setPhotos(r.photos);
    reload();
    if (msg) toast(msg, "success");
  };

  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      let last: { photos: AdminFieldPhoto[] } | null = null;
      for (const file of files) {
        const up = await uploadFile(file, "field");
        last = await send<{ photos: AdminFieldPhoto[] }>("/api/admin/field-photos", "POST", { storageKey: up.storageKey, caption: captionFromFile(file.name), tag, tall: false, sortOrder: 0, isActive: true });
      }
      if (last) done(last, `${files.length} photo(s) added to the gallery. Edit the captions below.`);
    } catch (e) {
      toast(errorText(e, "Upload failed."), "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async (p: AdminFieldPhoto) => {
    try {
      done(await send(`/api/admin/field-photos/${p.id}`, "PUT", toBody(p)), "Saved.");
      setDrafts(({ [p.id]: _, ...rest }) => rest);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const remove = async (p: AdminFieldPhoto) => {
    if (!(await confirm({ title: "Remove this photo?", message: `“${p.caption}” will be removed from the In the Field gallery.`, confirmLabel: "Remove photo", tone: "danger" }))) return;
    try {
      done(await send(`/api/admin/field-photos/${p.id}`, "DELETE"), "Photo removed.");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const move = async (i: number, d: -1 | 1) => {
    if (!photos) return;
    const a = photos[i];
    const b = photos[i + d];
    if (!b) return;
    try {
      // Swap positions (re-number when two photos share a sort value).
      const sa = a.sortOrder === b.sortOrder ? b.sortOrder + d : b.sortOrder;
      await send(`/api/admin/field-photos/${a.id}`, "PUT", { ...toBody(a), sortOrder: sa });
      done(await send(`/api/admin/field-photos/${b.id}`, "PUT", { ...toBody(b), sortOrder: a.sortOrder }));
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <div className="container-x py-10 max-lg:pt-3">
      <PageHead
        title="Field photos"
        intro="Photos for the “In the field” page and the home-page filmstrip. Use your own project or stock photos only, and keep captions factual."
        actions={
          <a href="/in-the-field" target="_blank" rel="noopener" className="btn-ghost btn-sm">
            <ExternalLink className="size-4" /> View gallery
          </a>
        }
      />
      <ReadOnlyNote admin={admin} />

      {editable && (
        <div className="card mt-6 grid gap-3 p-5 sm:grid-cols-[1fr_2fr] sm:items-center">
          <div>
            <label htmlFor="fp-tag" className="label">
              Tag for new photos
            </label>
            <input id="fp-tag" list="fp-tags" className="field" value={tag} onChange={(e) => setTag(e.target.value)} />
          </div>
          <FileDrop accept="image/jpeg,image/png,image/webp" multiple label="Upload photos" hint="JPEG, PNG or WebP · resized automatically · drag & drop several at once" busy={uploading} onFiles={upload} testId="upload-field-photo" />
        </div>
      )}
      <datalist id="fp-tags">
        {tags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {!photos ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="admin-field-photos">
          {pg.items.map((orig, _j, _a, i = photos.indexOf(orig)) => {
            const p = drafts[orig.id] ?? orig;
            const dirty = !!drafts[orig.id];
            const patch = (x: Partial<AdminFieldPhoto>) => setDrafts((d) => ({ ...d, [orig.id]: { ...p, ...x } }));
            return (
              <li key={orig.id} className={`card overflow-hidden ${p.isActive ? "" : "opacity-60"}`}>
                <div className="relative">
                  <img src={p.url} alt={p.caption} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <span className="absolute top-2 left-2 rounded-full bg-ink/80 px-2 py-0.5 font-mono text-[10px] tracking-wider text-paper uppercase">{p.tag}</span>
                </div>
                <div className="grid gap-2 p-3">
                  <input aria-label="Caption" className="field !py-1.5 text-sm" value={p.caption} disabled={!editable} onChange={(e) => patch({ caption: e.target.value })} />
                  <input aria-label="Tag" list="fp-tags" className="field !py-1.5 text-sm" value={p.tag} disabled={!editable} onChange={(e) => patch({ tag: e.target.value })} />
                  <div className="flex flex-wrap gap-4">
                    <Toggle id={`fp-a-${p.id}`} checked={p.isActive} onChange={(v) => editable && patch({ isActive: v })} label="Visible" />
                    <Toggle id={`fp-t-${p.id}`} checked={p.tall} onChange={(v) => editable && patch({ tall: v })} label="Portrait" />
                  </div>
                  {editable && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div>
                        <button type="button" className="rounded-full p-1.5 text-subtle hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                          <ArrowUp className="size-4" />
                        </button>
                        <button type="button" className="rounded-full p-1.5 text-subtle hover:text-ink disabled:opacity-30" disabled={i === photos.length - 1} onClick={() => move(i, 1)} aria-label="Move later">
                          <ArrowDown className="size-4" />
                        </button>
                        <button type="button" className="rounded-full p-1.5 text-subtle hover:text-danger" onClick={() => remove(orig)} aria-label="Remove photo">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                      <button type="button" className="btn-ghost btn-sm" disabled={!dirty} onClick={() => setDrafts(({ [orig.id]: _, ...rest }) => rest)}>
                        Cancel
                      </button>
                      <button type="button" className="btn-primary btn-sm" disabled={!dirty} onClick={() => save(p)}>
                        <Save className="size-3.5" /> Save
                      </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pg.pager}
    </div>
  );
}
