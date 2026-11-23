import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  batteryRuntimeHours,
  consumptionSummary,
  lossWaterfall,
  modulesNeeded,
  relativeOrientationYield,
  requiredCapacityKwp,
  roofLayout,
  savingsEstimate,
  type ApplianceRow,
} from "../../../shared/calculators";
import { Disclaimer, NumberField, RangeField } from "../../components/ui";
import { useCatalogue } from "../../lib/catalogue";
import { readStore, writeStore } from "../../lib/storage";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const kwh = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kWh`;

const PRESETS: ApplianceRow[] = [
  { name: "LED bulb", watts: 9, quantity: 6, hoursPerDay: 6 },
  { name: "Ceiling fan", watts: 75, quantity: 4, hoursPerDay: 10 },
  { name: "Refrigerator (avg. draw)", watts: 150, quantity: 1, hoursPerDay: 24 },
  { name: "Air conditioner 1.5 T", watts: 1500, quantity: 1, hoursPerDay: 6 },
  { name: "Television", watts: 100, quantity: 1, hoursPerDay: 4 },
  { name: "Washing machine", watts: 500, quantity: 1, hoursPerDay: 1 },
];
const LIBRARY: ApplianceRow[] = [
  { name: "Water pump 1 HP", watts: 746, quantity: 1, hoursPerDay: 1 },
  { name: "Laptop", watts: 65, quantity: 1, hoursPerDay: 6 },
  { name: "Desktop PC", watts: 200, quantity: 1, hoursPerDay: 8 },
  { name: "Microwave", watts: 1200, quantity: 1, hoursPerDay: 0.3 },
  { name: "Geyser", watts: 2000, quantity: 1, hoursPerDay: 1 },
  { name: "Induction cooktop", watts: 1800, quantity: 1, hoursPerDay: 1 },
];

/* --------------------------------------------------------------- consumption */
export function ConsumptionTool() {
  const [rows, setRows] = useState<ApplianceRow[]>(() => readStore("verdi.tools.appliances", PRESETS));
  const [tariff, setTariff] = useState(7);
  const save = (r: ApplianceRow[]) => {
    setRows(r);
    writeStore("verdi.tools.appliances", r);
  };
  const s = consumptionSummary(rows, tariff);
  const max = Math.max(0.001, ...s.perRow.map((r) => r.dailyKwh));
  const upd = (i: number, patch: Partial<ApplianceRow>) => save(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="card relative p-4 md:overflow-x-auto">
        <table className="rtable rtable-form w-full text-sm md:min-w-[560px]">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-semibold">Appliance</th>
              <th className="pb-2 font-semibold">Watts</th>
              <th className="pb-2 font-semibold">Qty</th>
              <th className="pb-2 font-semibold">Hours/day</th>
              <th className="pb-2 font-semibold">kWh/day</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line/70">
                <td className="py-1.5 pr-2" data-label="Appliance">
                  <input aria-label="Appliance name" className="field !py-1.5" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} />
                </td>
                {(["watts", "quantity", "hoursPerDay"] as const).map((k) => (
                  <td key={k} className="py-1.5 pr-2" data-label={k === "watts" ? "Watts" : k === "quantity" ? "Qty" : "Hours/day"}>
                    <input aria-label={`${r.name} ${k}`} type="number" min={0} max={k === "hoursPerDay" ? 24 : undefined} step={k === "hoursPerDay" ? 0.5 : 1} className="field num !w-24 !py-1.5 max-[359px]:!w-full max-[359px]:min-w-0" value={r[k]} onChange={(e) => upd(i, { [k]: Math.max(0, e.target.valueAsNumber || 0) })} />
                  </td>
                ))}
                <td className="num py-1.5" data-label="kWh/day">{s.perRow[i].dailyKwh.toFixed(2)}</td>
                <td className="rt-actions py-1.5 text-right">
                  <button type="button" className="rounded-full p-1.5 text-subtle hover:text-danger" onClick={() => save(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => save([...rows, { name: "Custom appliance", watts: 100, quantity: 1, hoursPerDay: 1 }])}>
            <Plus className="size-3.5" /> Custom appliance
          </button>
          {LIBRARY.map((a) => (
            <button key={a.name} type="button" className="chip" onClick={() => save([...rows, a])}>
              + {a.name}
            </button>
          ))}
          <button type="button" className="ml-auto text-xs text-muted hover:text-ink" onClick={() => save(PRESETS)}>
            Reset
          </button>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <div className="grid grid-cols-3 gap-2" data-testid="consumption-results">
          <Stat label="Daily" value={kwh(s.dailyKwh)} />
          <Stat label="Monthly" value={kwh(s.monthlyKwh)} />
          <Stat label="Monthly bill (est.)" value={inr(s.monthlyCost)} accent />
        </div>
        <NumberField label="Electricity tariff" unit="₹/kWh" value={tariff} step={0.5} min={0} onChange={setTariff} hint="Use the average rate from your bill, including fixed charges if you wish." />
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Consumption breakdown (kWh/day)</p>
          <ul className="mt-3 grid gap-2">
            {s.perRow
              .map((r, i) => ({ ...r, i }))
              .sort((a, b) => b.dailyKwh - a.dailyKwh)
              .map((r) => (
                <li key={r.i} className="text-xs">
                  <div className="flex justify-between">
                    <span className="truncate pr-2">{r.name}</span>
                    <span className="num">{r.dailyKwh.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-2">
                    <div className="h-full rounded-full bg-verdi-500" style={{ width: `${(r.dailyKwh / max) * 100}%` }} />
                  </div>
                </li>
              ))}
          </ul>
        </div>
        <Link to={`/solar-tools/sizing?kwh=${Math.round(s.monthlyKwh)}&tariff=${tariff}`} className="btn-dark max-w-full text-center whitespace-normal">
          Size a solar system for {kwh(s.monthlyKwh)}/month →
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- capacity & savings */
export function SizingTool() {
  const [params] = useSearchParams();
  const { data } = useCatalogue();
  const modules = (data?.products ?? []).filter((p) => p.specs.some((s) => s.k === "power_wp"));
  const [monthly, setMonthly] = useState(Number(params.get("kwh")) || 400);
  const [yieldK, setYieldK] = useState(4.0);
  const [tariff, setTariff] = useState(Number(params.get("tariff")) || 7);
  const [exportT, setExportT] = useState(0);
  const [cost, setCost] = useState(0);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const mod = modules.find((m) => m.id === moduleId) ?? modules.find((m) => m.specs.some((s) => s.k === "power_wp" && s.v === "550")) ?? modules[0];
  const moduleWp = Number(mod?.specs.find((s) => s.k === "power_wp")?.v ?? 550);
  const kwp = requiredCapacityKwp(monthly, yieldK);
  const n = modulesNeeded(kwp, moduleWp);
  const actualKwp = (n * moduleWp) / 1000;
  const sv = savingsEstimate({ capacityKwp: actualKwp, specificYield: yieldK, monthlyConsumptionKwh: monthly, tariffPerKwh: tariff, exportTariffPerKwh: exportT, systemCostRupees: cost || null });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card grid min-w-0 grid-cols-1 content-start gap-4 p-5">
        <NumberField label="Monthly consumption" unit="kWh" value={monthly} min={0} onChange={setMonthly} hint="From your electricity bill (units per month)." />
        <RangeField label="Specific yield (after losses)" value={yieldK} min={3} max={5.5} step={0.1} onChange={setYieldK} format={(v) => `${v.toFixed(1)} kWh/kWp/day`} />
        <div>
          <label htmlFor="mod" className="label">
            Module
          </label>
          <select id="mod" className="field" value={mod?.id ?? ""} onChange={(e) => setModuleId(Number(e.target.value))}>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Tariff saved" unit="₹/kWh" value={tariff} step={0.5} min={0} onChange={setTariff} />
          <NumberField label="Export credit" unit="₹/kWh" value={exportT} step={0.25} min={0} onChange={setExportT} hint="0 if surplus isn’t paid" />
        </div>
        <NumberField label="System cost (optional, for payback)" unit="₹" value={cost} min={0} step={1000} onChange={setCost} />
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="sizing-results">
          <Stat label="Required capacity" value={`${kwp.toFixed(2)} kWp`} accent />
          <Stat label={`${moduleWp} Wp modules`} value={`${n} pcs`} />
          <Stat label="Installed capacity" value={`${actualKwp.toFixed(2)} kWp`} />
          <Stat label="Generation / month" value={kwh(sv.monthlyGen)} />
          <Stat label="Savings / month" value={inr(sv.monthlySavings)} />
          <Stat label="Savings / year" value={inr(sv.annualSavings)} accent />
          {sv.payback !== null && <Stat label="Simple payback" value={`${sv.payback.toFixed(1)} years`} />}
          <Stat label="25-yr savings (flat tariff)" value={inr(sv.lifetime25)} />
        </div>
        <Disclaimer>
          Assumptions: required kWp = monthly kWh ÷ (specific yield × 30). Savings = self-consumed/net-metered kWh × tariff plus surplus × export credit. Tariff held flat with 0.5%/yr degradation. Actual yield depends on location, shading, tilt, orientation, equipment and your utility’s metering rules. This is not a design or financial guarantee.
        </Disclaimer>
        {mod && (
          <Link to={`/products/${mod.slug}`} className="text-sm font-semibold text-verdi-700 hover:underline">
            View {mod.name} →
          </Link>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- roof */
export function RoofTool() {
  const { data } = useCatalogue();
  const modules = (data?.products ?? []).filter((p) => p.specs.some((s) => s.k === "power_wp"));
  const [moduleId, setModuleId] = useState<number | null>(null);
  const mod = modules.find((m) => m.id === moduleId) ?? modules[0];
  const dims = (mod?.specs.find((s) => s.k === "dimensions_mm")?.v ?? "2278 × 1133 × 40").split("×").map((x) => Number(x.trim()));
  const wp = Number(mod?.specs.find((s) => s.k === "power_wp")?.v ?? 550);
  const [L, setL] = useState(15);
  const [W, setW] = useState(10);
  const [setback, setSetback] = useState(0.6);
  const [gap, setGap] = useState(0.8);
  const r = roofLayout({ roofLengthM: L, roofWidthM: W, edgeSetbackM: setback, moduleLengthMm: dims[0], moduleWidthMm: dims[1], moduleWp: wp, rowGapM: gap });
  const scale = 300 / Math.max(L, W, 1);
  const [mw, ml] = r.orientation === "portrait" ? [dims[1] / 1000, dims[0] / 1000] : [dims[0] / 1000, dims[1] / 1000];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card grid min-w-0 grid-cols-1 content-start gap-4 p-5">
        <div>
          <label htmlFor="roofmod" className="label">
            Module (dimensions from datasheet)
          </label>
          <select id="roofmod" className="field" value={mod?.id ?? ""} onChange={(e) => setModuleId(Number(e.target.value))}>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="num mt-1 text-[11px] text-subtle">
            {dims[0]} × {dims[1]} mm
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Roof length" unit="m" value={L} step={0.5} min={0} onChange={setL} />
          <NumberField label="Roof width" unit="m" value={W} step={0.5} min={0} onChange={setW} />
          <NumberField label="Edge setback" unit="m" value={setback} step={0.1} min={0} onChange={setSetback} />
          <NumberField label="Row gap / walkway" unit="m" value={gap} step={0.1} min={0} onChange={setGap} />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <div className="grid grid-cols-3 gap-2" data-testid="roof-results">
          <Stat label="Modules that fit" value={`${r.count}`} accent />
          <Stat label="Capacity" value={`${r.capacityKwp.toFixed(2)} kWp`} />
          <Stat label="Layout" value={`${r.rows} rows × ${r.perRow}`} />
        </div>
        <div className="card flex justify-center p-4">
          <svg viewBox={`0 0 ${L * scale + 4} ${W * scale + 4}`} className="max-h-72 w-full" role="img" aria-label={`Roof plan with ${r.count} modules in ${r.orientation} orientation`}>
            <rect x="2" y="2" width={L * scale} height={W * scale} fill="#edeae0" stroke="#848b84" />
            <rect x={2 + setback * scale} y={2 + setback * scale} width={Math.max(0, (L - 2 * setback) * scale)} height={Math.max(0, (W - 2 * setback) * scale)} fill="none" stroke="#3aa56c" strokeDasharray="4 3" />
            {Array.from({ length: r.rows }).map((_, ri) =>
              Array.from({ length: r.perRow }).map((_, ci) => (
                <rect key={`${ri}-${ci}`} x={2 + (setback + ci * mw) * scale} y={2 + (setback + ri * (ml + gap)) * scale} width={mw * scale - 1} height={ml * scale - 1} fill="#1d3b5c" />
              )),
            )}
          </svg>
        </div>
        <Disclaimer>Simple rectangular fit with no shading analysis, obstructions or structural check. A site survey is required for the final layout.</Disclaimer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ battery */
export function BatteryTool() {
  const [ah, setAh] = useState(150);
  const [v, setV] = useState(12);
  const [n, setN] = useState(2);
  const [dod, setDod] = useState(80);
  const [eff, setEff] = useState(90);
  const [load, setLoad] = useState(500);
  const r = batteryRuntimeHours({ capacityAh: ah * n, voltage: v, usablePct: dod, inverterEfficiencyPct: eff, loadWatts: load });
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="card grid min-w-0 grid-cols-1 content-start gap-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Capacity" unit="Ah" value={ah} min={0} onChange={setAh} />
          <NumberField label="Voltage" unit="V" value={v} min={0} step={0.1} onChange={setV} />
          <NumberField label="Batteries" value={n} min={1} onChange={(x) => setN(Math.max(1, Math.round(x)))} hint="same Ah, in series" />
        </div>
        <RangeField label="Usable capacity (depth of discharge)" value={dod} min={30} max={100} onChange={setDod} format={(x) => `${x}%`} />
        <RangeField label="Inverter efficiency" value={eff} min={70} max={98} onChange={setEff} format={(x) => `${x}%`} />
        <NumberField label="Connected load" unit="W" value={load} min={0} step={10} onChange={setLoad} />
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <div className="grid grid-cols-2 gap-2" data-testid="battery-results">
          <Stat label="Usable energy" value={`${(r.usableWh / 1000).toFixed(2)} kWh`} />
          <Stat label="Estimated backup" value={r.hours >= 1 ? `${r.hours.toFixed(1)} h` : `${Math.round(r.hours * 60)} min`} accent />
        </div>
        <Disclaimer>
          Runtime = Ah × V × batteries × DoD × inverter efficiency ÷ load. Typical DoD: around 50% for lead-acid, 80–90% for LiFePO4 (check the battery datasheet). Real runtime drops at high discharge rates, low temperature and with battery age. VERDI does not currently list batteries. Ask us if you need one.
        </Disclaimer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- losses */
export function LossesTool() {
  const [i, setI] = useState({ soilingPct: 3, shadingPct: 2, ambientC: 35, tempCoeffPctPerC: -0.29, inverterEfficiencyPct: 97.5, dcCablePct: 1.5, acCablePct: 0.5, mismatchPct: 1 });
  const r = lossWaterfall(i);
  const set = (k: keyof typeof i) => (n: number) => setI({ ...i, [k]: n });
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card grid min-w-0 grid-cols-1 content-start gap-4 p-5">
        <RangeField label="Soiling / dust" value={i.soilingPct} min={0} max={15} step={0.5} onChange={set("soilingPct")} format={(x) => `${x}%`} />
        <RangeField label="Shading" value={i.shadingPct} min={0} max={30} step={0.5} onChange={set("shadingPct")} format={(x) => `${x}%`} />
        <RangeField label="Ambient temperature" value={i.ambientC} min={10} max={48} onChange={set("ambientC")} format={(x) => `${x} °C`} />
        <div>
          <p className="label">Module temperature coefficient (from datasheet)</p>
          <div className="flex gap-2">
            {[
              [-0.29, "TOPCon −0.29"],
              [-0.309, "PERC −0.309"],
            ].map(([v, l]) => (
              <button key={l} type="button" className={`chip ${i.tempCoeffPctPerC === v ? "chip-on" : ""}`} onClick={() => set("tempCoeffPctPerC")(v as number)}>
                {l} %/°C
              </button>
            ))}
          </div>
        </div>
        <RangeField label="Inverter efficiency" value={i.inverterEfficiencyPct} min={94} max={99.2} step={0.1} onChange={set("inverterEfficiencyPct")} format={(x) => `${x}%`} />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="DC cable loss" unit="%" value={i.dcCablePct} step={0.1} min={0} onChange={set("dcCablePct")} />
          <NumberField label="AC cable loss" unit="%" value={i.acCablePct} step={0.1} min={0} onChange={set("acCablePct")} />
          <NumberField label="Mismatch" unit="%" value={i.mismatchPct} step={0.1} min={0} onChange={set("mismatchPct")} />
        </div>
      </div>
      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">Energy remaining at each step</p>
          <p className="num text-2xl text-verdi-700" data-testid="pr-result">
            PR {(r.performanceRatio * 100).toFixed(1)}%
          </p>
        </div>
        <ul className="mt-4 grid gap-2.5">
          <li className="text-xs">
            <div className="flex justify-between">
              <span>STC rating</span>
              <span className="num">100%</span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-verdi-500" />
          </li>
          {r.rows.map((s) => (
            <li key={s.label} className="text-xs">
              <div className="flex justify-between">
                <span>{s.label}</span>
                <span className="num">
                  −{s.lost.toFixed(1)} → {s.remaining.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full bg-verdi-500" style={{ width: `${s.remaining}%` }} />
                <div className="h-full bg-sun-400" style={{ width: `${s.lost}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">Cell temperature estimated by the NOCT method at 1000 W/m². Indicative only.</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- orientation */
export function OrientationTool() {
  const [lat, setLat] = useState(13.0);
  const [tilt, setTilt] = useState(13);
  const [az, setAz] = useState(180);
  const rel = useMemo(() => relativeOrientationYield(lat, tilt, az), [lat, tilt, az]);
  const dirs: Record<number, string> = { 90: "East", 135: "South-east", 180: "South", 225: "South-west", 270: "West" };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="card grid min-w-0 grid-cols-1 content-start gap-5 p-5">
        <RangeField label="Latitude (Chennai ≈ 13°N)" value={lat} min={8} max={35} step={0.5} onChange={setLat} format={(x) => `${x}°N`} />
        <RangeField label="Panel tilt" value={tilt} min={0} max={60} onChange={setTilt} format={(x) => `${x}°`} />
        <RangeField label="Facing (azimuth)" value={az} min={90} max={270} step={5} onChange={setAz} format={(x) => `${x}° ${dirs[x] ?? ""}`} />
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <div className="card flex items-center gap-6 p-5 max-sm:flex-wrap">
          <svg viewBox="0 0 120 80" className="w-40 shrink-0" aria-hidden="true">
            <line x1="10" y1="70" x2="110" y2="70" stroke="#848b84" />
            <g transform={`rotate(${-tilt} 30 70)`}>
              <rect x="30" y="66" width="70" height="5" fill="#1d3b5c" />
            </g>
            <circle cx="100" cy={20 + (lat - 8)} r="7" fill="#f5ad2e" />
          </svg>
          <div>
            <p className="text-xs text-muted">Annual irradiation vs. best orientation</p>
            <p className="num text-4xl text-verdi-700" data-testid="orientation-result">
              {(rel * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        <p className="text-sm text-ink/80">
          In the northern hemisphere, panels facing <strong>south</strong> and tilted roughly at the site’s latitude collect the most energy over a year. In South India, flatter tilts lose little, and east- or west-facing arrays still deliver a large share. Steeper tilts also help rain clean the glass.
        </p>
        <Disclaimer>Simplified clear-sky model with 12 representative days. It ignores local weather, shading and terrain. For relative comparison only.</Disclaimer>
      </div>
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl p-3 max-[359px]:p-2 ${accent ? "bg-ink text-paper" : "bg-card ring-1 ring-line"}`}>
      <p className={`text-[10px] tracking-wide uppercase ${accent ? "text-paper/55" : "text-subtle"}`}>{label}</p>
      <p className="num mt-0.5 text-lg leading-tight max-[359px]:text-sm">{value}</p>
    </div>
  );
}
