/**
 * With the modern open list (appearance: base-select, see styles.css) the browser sizes a closed
 * dropdown to the chosen option only, so boxes shrink and jump as the choice changes. This keeps the
 * classic behaviour: every dropdown is at least as wide as its longest option (as measured the old
 * way), but never wider than its container, so nothing can overflow on phones.
 */
export function startSelectSizing() {
  if (typeof window === "undefined" || !CSS.supports?.("appearance", "base-select")) return;
  const done = new WeakMap<HTMLSelectElement, string>();

  const measure = (s: HTMLSelectElement) => {
    if (s.multiple || s.size > 1 || !s.isConnected) return;
    const sig = `${s.options.length}:${[...s.options].map((o) => o.text).join("|")}:${s.className}`;
    if (done.get(s) === sig) return;
    done.set(s, sig);
    const c = s.cloneNode(true) as HTMLSelectElement;
    c.removeAttribute("id");
    c.removeAttribute("name");
    c.removeAttribute("data-testid");
    c.setAttribute("aria-hidden", "true");
    c.tabIndex = -1;
    Object.assign(c.style, { appearance: "none", position: "absolute", visibility: "hidden", pointerEvents: "none", left: "0", top: "0", minWidth: "0" });
    s.after(c);
    const w = Math.ceil(c.getBoundingClientRect().width);
    c.remove();
    if (w <= 0) return;
    // a plain px width counts in table columns; min() keeps it inside a narrower container on phones
    const room = s.parentElement?.clientWidth ?? 0;
    s.style.minWidth = room >= w ? `${w}px` : `min(${w}px, 100%)`;
  };

  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll("select").forEach(measure);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener("load", queue);
  document.fonts?.ready.then(() => {
    // fonts change text widths: measure everything again once they are in
    document.querySelectorAll("select").forEach((s) => done.delete(s));
    queue();
  });
  queue();
}
