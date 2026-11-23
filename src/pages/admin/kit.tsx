import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ROLE_LABEL, type AdminIdentity } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import type { Sheet } from "../../lib/xlsx";
import { api, ApiError } from "../../lib/api";

/** JSON write to an admin endpoint. */
export function send<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  return api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

export const canManage = (a: AdminIdentity) => a.role === "owner" || a.role === "admin";

/** Warn when closing or reloading the tab with unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

export function errorText(e: unknown, fallback = "Something went wrong."): string {
  return e instanceof ApiError ? e.message : fallback;
}

export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof ApiError && Array.isArray(e.details)) for (const d of e.details as { path: string; message: string }[]) out[d.path] ??= d.message;
  return out;
}

export type UploadKind = "image" | "datasheet" | "field" | "logo";

/**
 * Shrink large photos in the browser before upload (max 2000 px, WebP), so the site stays fast
 * and R2 storage stays small. PDFs and already-small images are uploaded unchanged.
 */
async function prepareImage(file: File, maxPx: number, forceWebp = false): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    if (!forceWebp && scale === 1 && file.type === "image/webp" && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
    if (forceWebp) {
      if (!blob) throw new Error("Could not create the small image copy.");
      return blob;
    }
    return blob && blob.size < file.size ? blob : file;
  } catch (e) {
    if (forceWebp) throw e;
    return file;
  }
}

export async function uploadFile(file: File, kind: UploadKind): Promise<{ storageKey: string; url: string }> {
  const body = kind === "datasheet" ? file : await prepareImage(file, kind === "logo" ? 800 : 2000);
  const headers = { "Content-Type": body.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name).slice(0, 120) };
  const up = await api<{ storageKey: string; url: string }>(`/api/admin/uploads?kind=${kind}`, { method: "POST", body, headers });
  if (kind === "image" || kind === "field") {
    // Small copy for phones (see src/lib/img.ts). Always WebP.
    const small = await prepareImage(file, 800, true);
    await api(`/api/admin/uploads?kind=${kind}&variantOf=${encodeURIComponent(up.storageKey)}`, { method: "POST", body: small, headers: { ...headers, "Content-Type": "image/webp" } });
  }
  return up;
}

/** Click-or-drop file picker. */
export function FileDrop({ accept, label, hint, onFiles, busy, multiple = false, testId }: { accept: string; label: string; hint?: string; onFiles: (f: File[]) => void; busy?: boolean; multiple?: boolean; testId?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-5 text-center transition ${over ? "border-verdi-500 bg-verdi-50" : "border-line bg-paper"}`}
    >
      <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Spinner className="size-4" /> : <UploadCloud className="size-4" />} {label}
      </button>
      <p className="text-xs text-subtle">{hint ?? "or drag & drop here"}</p>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        data-testid={testId}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2.5 text-sm select-none">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-paper-3 transition peer-checked:bg-verdi-500 peer-focus-visible:outline-2 peer-focus-visible:outline-verdi-500 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
      {label}
    </label>
  );
}

export function PageHead({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold max-lg:text-xl">{title}</h1>
        {intro && <p className="mt-1 max-w-2xl text-sm text-muted max-lg:line-clamp-2 max-lg:text-xs">{intro}</p>}
      </div>
      {actions && (
        <div className="scrollbar-none flex flex-wrap gap-2 max-lg:-mx-4 max-lg:w-[calc(100%+2rem)] max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4 max-lg:py-0.5 max-lg:[&>*]:shrink-0 max-lg:[&>.btn-primary]:order-first">{actions}</div>
      )}
    </div>
  );
}

export function ReadOnlyNote({ admin }: { admin: AdminIdentity }) {
  if (canManage(admin)) return null;
  return <p className="mt-4 rounded-xl bg-sun-100 px-3 py-2 text-sm">Your role ({ROLE_LABEL[admin.role]}) can view this page but not change it.</p>;
}

export const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * "Download Excel": builds a real .xlsx of the given tables (all matching rows, not just the visible page)
 * so staff can read it offline. The spreadsheet code loads only on click; every download is audit-logged.
 */
export function ExportButton({ name, build, className = "btn-ghost btn-sm max-lg:tap", testId = "export-excel" }: { name: string; build: () => Promise<Sheet[]> | Sheet[]; className?: string; testId?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      title="Download as an Excel file to read offline"
      data-testid={testId}
      onClick={async () => {
        setBusy(true);
        try {
          const [{ downloadXlsx }, sheets] = await Promise.all([import("../../lib/xlsx"), build()]);
          const rows = sheets.reduce((a, x) => a + x.rows.length, 0);
          downloadXlsx(name, sheets);
          void send("/api/admin/exports", "POST", { table: name, rows }).catch(() => undefined);
          toast(`Downloaded ${rows.toLocaleString("en-IN")} row${rows === 1 ? "" : "s"}.`, "success");
        } catch (e) {
          toast(errorText(e, "Could not prepare the download."), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner className="size-4" /> : <FileSpreadsheet className="size-4" />} Download Excel
    </button>
  );
}

/** A filter that came from a shortcut (e.g. "Overdue follow-ups"): always visible, one tap to clear. */
export function FilterNote({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="filter-note">
      <span className="text-muted">Showing:</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 font-medium text-paper">
        {label}
        <button type="button" onClick={onClear} className="-mr-1 grid size-6 place-items-center rounded-full hover:bg-white/15 max-lg:size-8" aria-label={`Clear filter: ${label}`} data-testid="filter-note-clear">
          ×
        </button>
      </span>
    </p>
  );
}
