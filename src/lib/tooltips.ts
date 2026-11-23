/**
 * One tooltip for the whole app. Any button or link that shows only an icon gets a small, modern
 * tooltip with its name (from aria-label, title or data-tip) on mouse hover or keyboard focus.
 * Elements with visible text get none (they already say what they do); add data-tip to force one,
 * or data-tip="" / data-no-tip to switch it off.
 *
 * It uses the browser's popover layer, so it also shows above open dialogs and bottom sheets.
 * Touch screens are left alone: a long press would also press the button.
 */
const SHOW_DELAY = 350;
const GAP = 8;

function visibleText(el: Element): string {
  let out = "";
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const p = n.parentElement;
    if (!p || p.closest(".sr-only, [aria-hidden='true']")) continue;
    if (p.checkVisibility && !p.checkVisibility()) continue;
    out += n.textContent ?? "";
  }
  return out.trim();
}

/** The tooltip text for this element, or null when it should not have one. */
function tipFor(el: HTMLElement): string | null {
  if (el.hasAttribute("data-no-tip")) return null;
  const forced = el.getAttribute("data-tip");
  if (forced !== null) return forced.trim() || null;
  const label = (el.getAttribute("aria-label") || el.getAttribute("data-tip-title") || el.getAttribute("title") || "").trim();
  if (!label) return null;
  return visibleText(el) ? null : label;
}

export function startTooltips() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const tip = document.createElement("div");
  tip.className = "vs-tip";
  tip.setAttribute("role", "tooltip");
  tip.id = "vs-tip";
  const canPopover = typeof tip.showPopover === "function";
  if (canPopover) tip.setAttribute("popover", "manual");
  document.body.appendChild(tip);

  let target: HTMLElement | null = null;
  // focus tooltips only while someone uses the keyboard (not when a dialog focuses its first button after a tap)
  let keyboard = false;
  document.addEventListener("keydown", (e) => { if (e.key === "Tab" || e.key.startsWith("Arrow")) keyboard = true; }, { capture: true });
  document.addEventListener("pointerdown", () => (keyboard = false), { capture: true, passive: true });
  let timer: number | undefined;

  const hide = () => {
    window.clearTimeout(timer);
    if (!target) return;
    const t = target;
    target = null;
    // give the native title back
    const saved = t.getAttribute("data-tip-title");
    if (saved !== null) {
      t.setAttribute("title", saved);
      t.removeAttribute("data-tip-title");
    }
    if (t.getAttribute("aria-describedby") === tip.id) t.removeAttribute("aria-describedby");
    tip.classList.remove("vs-tip-on");
    if (canPopover && tip.matches(":popover-open")) tip.hidePopover();
  };

  const show = (el: HTMLElement, text: string) => {
    target = el;
    // no second, grey browser tooltip
    const title = el.getAttribute("title");
    if (title !== null) {
      el.setAttribute("data-tip-title", title);
      el.removeAttribute("title");
    }
    if (!el.hasAttribute("aria-describedby") && !el.getAttribute("aria-label")) el.setAttribute("aria-describedby", tip.id);
    tip.textContent = text;
    if (canPopover) {
      if (tip.matches(":popover-open")) tip.hidePopover();
      tip.showPopover(); // re-show so it sits above any dialog opened since
    }
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.dataset.side = "top";
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    let top = r.top - h - GAP;
    if (top < GAP) {
      top = r.bottom + GAP;
      tip.dataset.side = "bottom";
    }
    const left = Math.min(Math.max(GAP, r.left + r.width / 2 - w / 2), vw - w - GAP);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.setProperty("--arrow-x", `${Math.round(r.left + r.width / 2 - left)}px`);
    requestAnimationFrame(() => tip.classList.add("vs-tip-on"));
  };

  const candidate = (from: EventTarget | null): HTMLElement | null =>
    from instanceof Element ? from.closest<HTMLElement>("button, a[href], [role='button'], [role='tab'], [data-tip], summary, label[aria-label]") : null;

  document.addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") return;
      const el = candidate(e.target);
      if (el === target) return;
      hide();
      if (!el) return;
      const text = tipFor(el);
      if (!text) return;
      timer = window.setTimeout(() => el.isConnected && el.matches(":hover") && show(el, text), SHOW_DELAY);
    },
    { passive: true },
  );
  document.addEventListener(
    "pointerout",
    (e) => {
      const el = candidate(e.target);
      if (!el) return;
      const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (to && el.contains(to)) return;
      if (el === target || !target) hide();
    },
    { passive: true },
  );
  document.addEventListener("focusin", (e) => {
    const el = candidate(e.target);
    hide();
    if (!el || !keyboard || !el.matches(":focus-visible")) return; // keyboard focus only, not taps or clicks
    const text = tipFor(el);
    if (text) show(el, text);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, { passive: true, capture: true });
  document.addEventListener("keydown", (e) => e.key === "Escape" && hide());
  window.addEventListener("scroll", hide, { passive: true, capture: true });
  window.addEventListener("resize", hide, { passive: true });
}
