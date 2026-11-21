import { categoryRole, type CategoryRole } from "../../../shared/category-role";
import { AlertCircle, CheckCircle2, Info, PackagePlus, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { kitChecks, type Level } from "../../../shared/compat";
import { formatPaise, lineTotalPaise } from "../../../shared/money";
import type { PublicProduct } from "../../../shared/types";
import { Disclaimer, NumberField, useToast } from "../../components/ui";
import { useBasket } from "../../lib/basket";
import { useCatalogue } from "../../lib/catalogue";
import { readStore, writeStore } from "../../lib/storage";

const EXTRAS = ["ACDB", "DCDB", "MC4 connector pairs", "Earthing kit (rod + compound)", "Lightning arrester", "AC cable"];

export function KitBuilder() {
  const { data, category, brand } = useCatalogue();
  const basket = useBasket();
  const toast = useToast();
  const nav = useNavigate();
  const all = data?.products ?? [];
  const byRole = (role: CategoryRole) => all.filter((p) => categoryRole(category(p.categoryId)) === role);
  const modules = byRole("panels");
  const inverters = byRole("inverters");
  const optimisers = byRole("optimisers");
  const cables = byRole("dc-cables");

  const [moduleId, setModuleId] = useState<number | "">("");
  const [moduleQty, setModuleQty] = useState(10);
  const [inverterId, setInverterId] = useState<number | "">("");
  const [inverterQty, setInverterQty] = useState(1);
  const [optimiserId, setOptimiserId] = useState<number | "">("");
  const [mps, setMps] = useState(10);
  const [strings, setStrings] = useState(1);
  const [minC, setMinC] = useState(15);
  const [maxC, setMaxC] = useState(70);
  const [cableId, setCableId] = useState<number | "">("");
  const [cableM, setCableM] = useState(100);
  const [extras, setExtras] = useState<Record<string, number>>({});

  useEffect(() => {
    if (moduleId === "" && modules.length) setModuleId(modules.find((m) => m.variant === "550 Wp")?.id ?? modules[0].id);
    if (inverterId === "" && inverters.length) setInverterId(inverters.find((m) => m.variant === "5KTL3X")?.id ?? inverters[0].id);
    if (cableId === "" && cables.length) setCableId(cables[0].id);
  }, [modules, inverters, cables, moduleId, inverterId, cableId]);

  const mod = all.find((p) => p.id === moduleId);
  const inv = all.find((p) => p.id === inverterId);
  const opt = all.find((p) => p.id === optimiserId);
  const cable = all.find((p) => p.id === cableId);
  const isSE = inv ? brand(inv.brandId)?.slug === "solaredge" : false;

  const checks = useMemo(
    () => kitChecks({ module: mod, moduleQty, inverter: inv, inverterQty, inverterBrandSlug: inv ? brand(inv.brandId)?.slug : undefined, optimiser: isSE ? opt : undefined, modulesPerString: mps, strings, minCellC: minC, maxCellC: maxC }),
    [mod, moduleQty, inv, inverterQty, opt, mps, strings, minC, maxC, isSE, brand],
  );

  const lines: { p: PublicProduct; qty: number }[] = [
    mod && { p: mod, qty: moduleQty },
    inv && { p: inv, qty: inverterQty },
    isSE && opt && { p: opt, qty: moduleQty },
    cable && cableM > 0 && { p: cable, qty: cableM },
  ].filter(Boolean) as { p: PublicProduct; qty: number }[];
  const total = lines.reduce((s, l) => s + (l.p.price.sellingPaise !== null ? lineTotalPaise(l.p.price.sellingPaise, l.qty) : 0), 0);
  const unpriced = lines.filter((l) => l.p.price.sellingPaise === null).length;

  const addKit = () => {
    for (const l of lines) basket.add(l.p.id, l.qty, { sellingPaise: l.p.price.sellingPaise, version: l.p.price.version });
    const ex = Object.entries(extras).filter(([, q]) => q > 0);
    if (ex.length) {
      const key = "verdi.customer.v1";
      const c = readStore<Record<string, string>>(key, {});
      const note = `Kit builder, please also quote: ${ex.map(([n, q]) => `${n} × ${q}`).join(", ")}.`;
      writeStore(key, { ...c, comments: [c.comments, note].filter(Boolean).join("\n") });
    }
    toast("Kit added to your enquiry", "success");
    nav("/enquiry");
  };

  const icon = (l: Level) =>
    l === "ok" ? <CheckCircle2 className="size-4 text-verdi-600" /> : l === "warn" ? <AlertCircle className="size-4 text-sun-500" /> : l === "error" ? <XCircle className="size-4 text-danger" /> : <Info className="size-4 text-subtle" />;


  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Step n={1} title="Solar modules">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <Select id="kb-mod" label="Module" value={moduleId} onChange={setModuleId} options={modules} />
            <NumberField label="Quantity" value={moduleQty} min={1} onChange={(v) => setModuleQty(Math.max(1, Math.round(v)))} />
          </div>
        </Step>
        <Step n={2} title="Inverter">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <Select id="kb-inv" label="Inverter" value={inverterId} onChange={setInverterId} options={inverters} />
            <NumberField label="Quantity" value={inverterQty} min={1} onChange={(v) => setInverterQty(Math.max(1, Math.round(v)))} />
          </div>
          {isSE && (
            <div className="mt-3">
              <Select id="kb-opt" label="Power optimiser (one per module)" value={optimiserId} onChange={setOptimiserId} options={optimisers} allowNone="Select an optimiser…" />
            </div>
          )}
        </Step>
        <Step n={3} title="String layout & site temperatures">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="Modules / string" value={mps} min={1} onChange={(v) => setMps(Math.max(1, Math.round(v)))} />
            <NumberField label="Strings" value={strings} min={1} onChange={(v) => setStrings(Math.max(1, Math.round(v)))} />
            <NumberField label="Coldest cell" unit="°C" value={minC} onChange={setMinC} />
            <NumberField label="Hottest cell" unit="°C" value={maxC} onChange={setMaxC} />
          </div>
          <button type="button" className="mt-2 text-xs font-semibold text-verdi-700 hover:underline" onClick={() => { setStrings(1); setMps(moduleQty); }}>
            Put all {moduleQty} modules in one string
          </button>
        </Step>
        <Step n={4} title="Solar DC cable">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <Select id="kb-cab" label="Cable" value={cableId} onChange={setCableId} options={cables} allowNone="No cable" />
            <NumberField label="Length" unit="m" value={cableM} min={0} step={10} onChange={setCableM} />
          </div>
        </Step>
        <Step n={5} title="Also quote (not yet listed online)">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EXTRAS.map((e) => (
              <label key={e} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm">
                {e}
                <input type="number" min={0} aria-label={`${e} quantity`} className="field num !w-20 !py-1" value={extras[e] ?? 0} onChange={(ev) => setExtras({ ...extras, [e]: Math.max(0, ev.target.valueAsNumber || 0) })} />
              </label>
            ))}
          </div>
        </Step>
      </div>

      <div className="grid min-w-0 grid-cols-1 content-start gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <h3 className="font-semibold">Compatibility checks</h3>
          <ul className="mt-3 grid gap-2.5" data-testid="kit-checks">
            {checks.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="mt-0.5 shrink-0">{icon(c.level)}</span>
                <span>
                  <span className="font-medium">{c.title}</span>
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold">Kit summary</h3>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm">
            {lines.map((l) => (
              <li key={l.p.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="num">{l.qty}×</span> {l.p.name}
                </span>
                <span className="num shrink-0 text-muted">{l.p.price.sellingPaise !== null ? formatPaise(lineTotalPaise(l.p.price.sellingPaise, l.qty)) : "on request"}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm">Indicative listed total</span>
            <span className="num text-xl font-semibold">{formatPaise(total)}</span>
          </div>
          {unpriced > 0 && <p className="text-xs text-muted">{unpriced} item(s) priced on request.</p>}
          <button type="button" className="btn-primary mt-4 w-full" onClick={addKit} disabled={lines.length === 0}>
            <PackagePlus className="size-4" /> Add kit to enquiry
          </button>
        </div>
        <Disclaimer>Indicative checks based on manufacturer datasheet values only. This is not an engineering design or certification. Final system design, cable sizing, protection and earthing must be verified by a qualified engineer.</Disclaimer>
      </div>
    </div>
  );
}

function Select({ id, label, value, onChange, options, allowNone }: { id: string; label: string; value: number | ""; onChange: (v: number | "") => void; options: PublicProduct[]; allowNone?: string }) {
return (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}>
      {allowNone && <option value="">{allowNone}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} {o.price.sellingPaise !== null ? `· ${formatPaise(o.price.sellingPaise)}` : ""}
        </option>
      ))}
    </select>
  </div>
);
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="flex items-center gap-2.5 font-semibold">
        <span className="num grid size-6 place-items-center rounded-full bg-ink text-xs text-paper">{n}</span>
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}
