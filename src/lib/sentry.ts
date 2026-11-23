/**
 * Error alerts (Sentry) for the website and admin. Off unless VITE_SENTRY_DSN is set at build time.
 * Loaded after the page so it never slows the first visit. Privacy: no cookies, IP or user details are
 * sent, and phone numbers / emails are blanked out of messages. Each distinct error is sent at most a few
 * times per visit, so one broken page cannot use up the monthly allowance.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = (import.meta.env.VITE_SENTRY_ENV as string | undefined) ?? "production";

import { scrub } from "../../shared/scrub";

export function startSentry() {
  if (!DSN || typeof window === "undefined") return;
  const seen = new Map<string, number>();
  const go = () =>
    import("@sentry/react").then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: ENV,
        tracesSampleRate: 0, // errors only (keeps within the free plan)
        maxBreadcrumbs: 30,
        // noise that is not ours: browser extensions, network blips, old cached pages after a deploy
        ignoreErrors: [/ResizeObserver loop/, /Network error/, /Failed to fetch/, /Load failed/, /Loading chunk \d+ failed/, /Failed to fetch dynamically imported module/, /Importing a module script failed/],
        denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /^safari-web-extension:\/\//i],
        beforeBreadcrumb(b) {
          if (b.message) b.message = scrub(b.message);
          if (b.data?.url && typeof b.data.url === "string") b.data.url = scrub(b.data.url);
          return b;
        },
        beforeSend(event) {
          // at most 5 of the same error per visit
          const key = `${event.exception?.values?.[0]?.type}:${event.exception?.values?.[0]?.value}`;
          const n = (seen.get(key) ?? 0) + 1;
          seen.set(key, n);
          if (n > 5) return null;
          delete event.user;
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
            if (event.request.url) event.request.url = scrub(event.request.url);
          }
          for (const v of event.exception?.values ?? []) if (v.value) v.value = scrub(v.value);
          if (event.message) event.message = scrub(event.message);
          return event;
        },
      });
    });
  if (document.readyState === "complete") void go();
  else window.addEventListener("load", () => void go(), { once: true });
}
