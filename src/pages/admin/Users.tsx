import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { usePaged } from "../../components/Pager";
import { useEffect, useState } from "react";
import type { AdminRole, AdminUserRow } from "../../../shared/types";
import { Modal, Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { useAdmin } from "./AdminLayout";
import { formatMobile } from "../../../shared/admin-schemas";
import { dt, errorText, fieldErrors, PageHead, send, Toggle } from "./kit";

const ROLES: { v: AdminRole; label: string; d: string }[] = [
  { v: "owner", label: "Owner", d: "Everything, including managing admin users." },
  { v: "admin", label: "Admin", d: "Products, brands, prices, photos, settings, enquiries and customers." },
  { v: "price_editor", label: "Price editor", d: "Can change prices only. Can view everything else." },
  { v: "viewer", label: "Viewer", d: "Read-only access to the admin area." },
];

export default function Users() {
  const admin = useAdmin();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const pg = usePaged(users ?? [], "admin.staff");
  const [edit, setEdit] = useState<{ id: number | null; email: string; mobile: string; password: string; displayName: string; role: AdminRole; isActive: boolean } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: AdminUserRow[] }>("/api/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e) => setError(errorText(e)));
  }, []);

  if (admin.role !== "owner") return <p className="container-x py-16 text-center text-muted">Only owners can manage admin users.</p>;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setErrs({});
    try {
      const body = { email: edit.email, mobile: edit.mobile, password: edit.password || undefined, displayName: edit.displayName, role: edit.role, isActive: edit.isActive };
      const r = edit.id ? await send<{ users: AdminUserRow[] }>(`/api/admin/users/${edit.id}`, "PUT", body) : await send<{ users: AdminUserRow[] }>("/api/admin/users", "POST", body);
      setUsers(r.users);
      setEdit(null);
      toast("Admin user saved.", "success");
    } catch (e) {
      setErrs({ ...fieldErrors(e), _: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x py-10">
      <PageHead
        title="Staff"
        intro={
          <>
            Admin credentials. Staff sign in at <span className="font-mono text-xs">/admin</span> with their mobile number and password. Passwords are stored only as salted one-way hashes, so nobody (not even the owner) can read them; set a new one here if someone forgets theirs.
          </>
        }
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => (setErrs({}), setEdit({ id: null, email: "", mobile: "", password: "", displayName: "", role: "admin", isActive: true }))} data-testid="new-admin">
            <Plus className="size-4" /> Add admin
          </button>
        }
      />
      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!users ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="card mt-6 md:overflow-x-auto">
          <table className="rtable w-full text-left text-sm md:min-w-[640px]">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Staff member</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last sign-in</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {pg.items.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0" data-testid="admin-user-row">
                  <td className="rt-title p-3">
                    <p className="font-semibold">{u.displayName || (u.mobile ? formatMobile(u.mobile) : u.email)}</p>
                    <p className="text-xs text-muted">
                      {[u.mobile ? formatMobile(u.mobile) : "no mobile set", u.email || null].filter(Boolean).join(" · ")}
                      {!u.hasPassword && <span className="ml-1 text-danger">· no password (cannot sign in)</span>}
                    </p>
                    {u.mustChangePassword && <p className="mt-1 inline-block rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-medium text-ink" data-testid="temp-password-badge">Temporary password · must set their own at next sign-in</p>}
                  </td>
                  <td className="rt-chip p-3">{ROLES.find((r) => r.v === u.role)?.label}</td>
                  <td className="rt-chip p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.isActive ? "bg-verdi-100 text-verdi-800" : "bg-paper-3 text-muted"}`}>{u.isActive ? "Active" : "Disabled"}</span>
                  </td>
                  <td className="p-3 text-xs text-muted" data-label="Last sign-in:">{dt(u.lastLoginAt)}</td>
                  <td className="rt-actions p-3 text-right">
                    <button type="button" className="rounded-full p-2 text-muted hover:bg-paper-2" aria-label={`Edit ${u.displayName || u.mobile || u.email}`} onClick={() => (setErrs({}), setEdit({ id: u.id, email: u.email, mobile: u.mobile ? formatMobile(u.mobile) : "", password: "", displayName: u.displayName ?? "", role: u.role, isActive: u.isActive }))}>
                      <Pencil className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pg.pager}
      <div className="mt-6 flex max-w-3xl gap-3 rounded-2xl bg-verdi-50 p-4 text-sm">
        <ShieldCheck className="size-5 shrink-0 text-verdi-600" />
        <p>Disabling a user or changing their password signs them out everywhere immediately. Five wrong passwords lock the account for 15 minutes.</p>
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit admin user" : "Add admin user"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy} data-testid="save-admin">
              {busy && <Spinner className="size-4" />} Save
            </button>
          </div>
        }
      >
        {edit && (
          <div className="grid gap-3 p-5">
            <div>
              <label htmlFor="au-mobile" className="label">
                Mobile number (used to sign in)
              </label>
              <input id="au-mobile" type="tel" className={`field ${errs.mobile ? "!border-danger" : ""}`} value={edit.mobile} onChange={(e) => setEdit({ ...edit, mobile: e.target.value })} />
              {errs.mobile && <p className="mt-1 text-xs text-danger">{errs.mobile}</p>}
            </div>
            <div>
              <label htmlFor="au-pw" className="label">
                {edit.id ? "New password (leave empty to keep the current one)" : "Password"}
              </label>
              <input id="au-pw" type="password" autoComplete="new-password" className={`field ${errs.password ? "!border-danger" : ""}`} value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
              {errs.password ? (
                <p className="mt-1 text-xs text-danger">{errs.password}</p>
              ) : (
                <p className="mt-1 text-xs text-subtle">At least 8 characters. This is a temporary password: share it privately. They will be asked to choose their own password when they first sign in.</p>
              )}
            </div>
            <div>
              <label htmlFor="au-email" className="label">
                Email (optional)
              </label>
              <input id="au-email" type="email" className={`field ${errs.email ? "!border-danger" : ""}`} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              {errs.email && <p className="mt-1 text-xs text-danger">{errs.email}</p>}
            </div>
            <div>
              <label htmlFor="au-name" className="label">
                Name
              </label>
              <input id="au-name" className="field" value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} />
            </div>
            <fieldset>
              <legend className="label">Role</legend>
              <div className="grid gap-2">
                {ROLES.map((r) => (
                  <label key={r.v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${edit.role === r.v ? "border-verdi-500 bg-verdi-50" : "border-line"}`}>
                    <input type="radio" name="role" value={r.v} checked={edit.role === r.v} onChange={() => setEdit({ ...edit, role: r.v })} className="mt-0.5" />
                    <span>
                      <span className="font-semibold">{r.label}</span>
                      <span className="block text-xs text-muted">{r.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Toggle id="au-active" checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Active" />
            {errs._ && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{errs._}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
