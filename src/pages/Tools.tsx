import { BatteryCharging, BookOpenCheck, Compass, Gauge, GitCompareArrows, Grid3X3, Network, Plug, Sun, TrendingDown, Wrench, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "../components/mobile/kit";
import type { ComponentType } from "react";
import { Link, NavLink, useParams } from "react-router";
import { usePageMeta } from "../lib/seo";
import { DatasheetDecoder } from "./learn/DatasheetDecoder";
import { BatteryTool, ConsumptionTool, LossesTool, OrientationTool, RoofTool, SizingTool } from "./tools/Calculators";
import { KitBuilder } from "./tools/KitBuilder";
import { SystemExplorer } from "./tools/SystemExplorer";

const TOOLS: { id: string; label: string; icon: ComponentType<{ className?: string }>; title: string; intro: string; C: ComponentType }[] = [
  { id: "consumption", label: "Appliance load", icon: Plug, title: "Appliance consumption calculator", intro: "List your appliances to estimate daily and monthly energy use and your bill.", C: ConsumptionTool },
  { id: "sizing", label: "Size & savings", icon: Sun, title: "Solar capacity & savings", intro: "Estimate the system size for your consumption, then the generation, savings and payback.", C: SizingTool },
  { id: "roof", label: "Roof space", icon: Grid3X3, title: "Roof space calculator", intro: "See how many real catalogue modules fit on a rectangular roof.", C: RoofTool },
  { id: "kit-builder", label: "Kit builder", icon: Wrench, title: "Solar kit builder", intro: "Assemble a system from real catalogue products, with datasheet-based compatibility checks.", C: KitBuilder },
  { id: "battery", label: "Battery backup", icon: BatteryCharging, title: "Battery backup estimator", intro: "Estimate runtime from battery capacity, usable depth and load.", C: BatteryTool },
  { id: "losses", label: "Loss explorer", icon: TrendingDown, title: "Solar loss explorer", intro: "See how dust, shading, heat and conversion combine into the performance ratio.", C: LossesTool },
  { id: "orientation", label: "Tilt & orientation", icon: Compass, title: "Roof tilt & orientation explorer", intro: "Compare tilt and facing direction against the best orientation for your latitude.", C: OrientationTool },
  { id: "system-explorer", label: "System explorer", icon: Network, title: "Solar system explorer", intro: "Select each component to see what it does and find matching products.", C: SystemExplorer },
  { id: "datasheet-decoder", label: "Datasheet decoder", icon: BookOpenCheck, title: "Datasheet decoder", intro: "Voc, Isc, Vmp, Imp, MPPT, efficiency and temperature coefficients in plain language.", C: DatasheetDecoder },
];

export default function Tools() {
  const { tool = "consumption" } = useParams();
  const t = TOOLS.find((x) => x.id === tool) ?? TOOLS[0];
  const [picker, setPicker] = useState(false);
  usePageMeta(`${t.title} — Solar tools`, t.intro);
  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 grid-bg" aria-hidden="true" />
        <div className="container-x relative py-12 max-sm:py-5">
          <p className="eyebrow !text-verdi-300">Solar tools · runs in your browser</p>
          <h1 className="mt-3 text-4xl font-semibold max-sm:mt-1.5 max-sm:text-2xl sm:text-5xl">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-paper/65 max-lg:mt-1.5 max-lg:line-clamp-2 max-lg:text-sm">{t.intro}</p>
          <button type="button" className="tap mt-3 inline-flex items-center gap-2 rounded-full bg-sun-400 px-4 text-sm font-semibold text-ink lg:hidden" onClick={() => setPicker(true)} data-testid="tool-picker-open">
            <LayoutGrid className="size-4" /> All tools
          </button>
        </div>
        <nav aria-label="Tools" className="relative border-t border-white/10 max-lg:hidden">
          <ul className="container-x scrollbar-none flex gap-1 overflow-x-auto py-2">
            {TOOLS.map((x) => (
              <li key={x.id} className="shrink-0">
                <NavLink
                  to={`/solar-tools/${x.id}`}
                  className={() => `inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm ${x.id === t.id ? "bg-sun-400 font-semibold text-ink" : "text-paper/70 hover:text-paper"}`}
                  aria-current={x.id === t.id ? "page" : undefined}
                >
                  <x.icon className="size-4" /> {x.label}
                </NavLink>
              </li>
            ))}
            <li className="shrink-0">
              <Link to="/compare" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-paper/70 hover:text-paper">
                <GitCompareArrows className="size-4" /> Compare
              </Link>
            </li>
          </ul>
        </nav>
      </section>
      <div className="container-x py-10 max-lg:py-4">
        <t.C />
        <p className="mt-10 flex items-center gap-2 text-xs text-muted">
          <Gauge className="size-4" /> All calculations run on your device. Nothing you type here is sent to our servers.
        </p>
      </div>
      <BottomSheet open={picker} onClose={() => setPicker(false)} title="Solar tools" testId="tool-picker">
        <div className="grid grid-cols-2 gap-2">
          {TOOLS.map((x) => (
            <Link key={x.id} to={`/solar-tools/${x.id}`} onClick={() => setPicker(false)} aria-current={x.id === t.id ? "page" : undefined} className={`sheet-tile !items-start !justify-start !p-3 !text-left ${x.id === t.id ? "!bg-sun-100" : ""}`}>
              <x.icon className="size-5 text-verdi-700" />
              <span className="font-semibold">{x.label}</span>
            </Link>
          ))}
          <Link to="/compare" onClick={() => setPicker(false)} className="sheet-tile !items-start !justify-start !p-3 !text-left">
            <GitCompareArrows className="size-5 text-verdi-700" />
            <span className="font-semibold">Compare</span>
          </Link>
        </div>
      </BottomSheet>
    </div>
  );
}
