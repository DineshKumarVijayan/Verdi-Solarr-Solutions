import { useState } from "react";
import { Link } from "react-router";
import { useCatalogue } from "../../lib/catalogue";

const NODES = [
  { id: "panels", x: 40, y: 40, w: 120, h: 70, label: "Solar modules", cat: "solar-panels", text: "Convert sunlight to DC electricity. Connected in series strings to reach the inverter’s operating voltage." },
  { id: "mc4", x: 200, y: 60, w: 70, h: 30, label: "MC4", cat: "mc4-connectors", text: "Weather-sealed DC connectors join module leads and string cables." },
  { id: "dccable", x: 200, y: 115, w: 70, h: 30, label: "DC cable", cat: "solar-dc-cables", text: "UV-resistant, solar-rated cable carries string DC to the DCDB and inverter." },
  { id: "optimiser", x: 40, y: 135, w: 120, h: 30, label: "Optimisers (optional)", cat: "power-optimisers", text: "Module-level MPPT for SolarEdge systems. Reduces mismatch and adds module-level shutdown." },
  { id: "dcdb", x: 310, y: 60, w: 80, h: 60, label: "DCDB", cat: "dcdb", text: "DC fuses or MCB, SPD and isolator between the array and the inverter." },
  { id: "inverter", x: 430, y: 50, w: 90, h: 80, label: "Inverter", cat: "solar-inverters", text: "Tracks maximum power (MPPT) and converts DC to grid-synchronised AC." },
  { id: "acdb", x: 560, y: 60, w: 80, h: 60, label: "ACDB", cat: "acdb", text: "AC MCB/MCCB, SPD and isolation between the inverter and the building supply." },
  { id: "grid", x: 680, y: 60, w: 80, h: 60, label: "Meter / grid", cat: "ac-cables", text: "Net or gross meter and the utility connection. AC cables carry the output." },
  { id: "earth", x: 310, y: 170, w: 330, h: 34, label: "Earthing · lightning arrester · earthing compound", cat: "earthing-solutions", text: "Frames, structures and enclosures are bonded to earth. The lightning arrester has its own earth pit. Copper bonded rods with compound keep resistance low." },
];

export function SystemExplorer() {
  const { data, categoryBySlug, countByCategory } = useCatalogue();
  const [sel, setSel] = useState("inverter");
  const node = NODES.find((n) => n.id === sel)!;
  // the category with this slug, else one whose name says what it is (renamed categories still link)
  const words: Record<string, RegExp> = { panels: /panel|module/, mc4: /mc4|connector/, dccable: /dc cable|solar cable/, optimiser: /optimi/, dcdb: /dcdb/, inverter: /inverter/, acdb: /acdb/, grid: /ac cable|single core/, earth: /earth|lightning/ };
  const cat = categoryBySlug(node.cat) ?? (data?.categories ?? []).find((c) => words[node.id]?.test(`${c.slug} ${c.name}`.toLowerCase().replace(/-/g, " ")));
  const count = cat ? countByCategory.get(cat.id) ?? 0 : 0;

  return (
    <div className="grid gap-6">
      <div className="card overflow-x-auto p-4">
        <svg viewBox="0 0 780 220" className="min-w-[640px]" role="group" aria-label="Solar system components. Select a component to learn more.">
          <path d="M160 75 H200 M270 75 H310 M390 90 H430 M520 90 H560 M640 90 H680" stroke="#3aa56c" strokeWidth="2" strokeDasharray="5 5" className="animate-flow" />
          <path d="M235 90 V115 M270 130 H350 V120" stroke="#f5ad2e" strokeWidth="2" fill="none" />
          <path d="M100 110 V135" stroke="#848b84" strokeDasharray="3 3" />
          <path d="M475 130 V170 M350 120 V170 M600 120 V170" stroke="#848b84" strokeDasharray="3 3" />
          {NODES.map((n) => (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-pressed={sel === n.id}
              aria-label={n.label}
              onClick={() => setSel(n.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(n.id))}
              className="cursor-pointer focus:outline-none"
            >
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="10" fill={sel === n.id ? "#0d1813" : "#fffdf8"} stroke={sel === n.id ? "#f5ad2e" : "#d9d4c4"} strokeWidth={sel === n.id ? 2 : 1} />
              <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={sel === n.id ? "#f6f4ee" : "#0d1813"} fontFamily="Inter, sans-serif">
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5" aria-live="polite">
        <div className="max-w-2xl">
          <h3 className="text-xl font-semibold">{node.label}</h3>
          <p className="mt-1 text-sm text-ink/80">{node.text}</p>
        </div>
        {cat && (
          <Link to={`/category/${cat.slug}`} className={count > 0 ? "btn-primary" : "btn-ghost"}>
            {count > 0 ? `View ${count} ${cat.name.toLowerCase()}` : `Enquire about ${cat.name}`}
          </Link>
        )}
      </div>
    </div>
  );
}
