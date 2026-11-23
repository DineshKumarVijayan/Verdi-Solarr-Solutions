import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { usePageMeta } from "../lib/seo";
import { useSite } from "../lib/site";

export default function Contact() {
  const SITE = useSite();
  usePageMeta("Contact VERDI SOLARR SOLUTION", `Call or WhatsApp ${SITE.phoneDisplay}, email ${SITE.email}. ${SITE.addressOneLine}.`);
  return (
    <div className="container-x py-12 max-lg:py-5">
      <p className="eyebrow">Contact</p>
      <h1 className="mt-2 text-4xl font-semibold max-sm:text-2xl sm:text-5xl">Talk to VERDI SOLARR</h1>
      <p className="mt-3 max-w-xl text-muted max-lg:mt-1.5 max-lg:text-sm">For product availability, project quantities, pricing and delivery, WhatsApp is the fastest way to reach us.</p>
      <div className="mt-10 grid gap-4 max-md:mt-5 max-md:grid-cols-2 max-md:gap-3 md:grid-cols-2 lg:grid-cols-4" data-testid="contact-cards">
        <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className="card group p-6 transition hover:shadow-[var(--shadow-lift)] max-md:min-h-32 max-md:p-4">
          <WhatsAppIcon className="size-6 text-verdi-600" />
          <h2 className="mt-4 font-semibold max-md:mt-2">WhatsApp</h2>
          <p className="num mt-1 text-sm text-muted">{SITE.phoneDisplay}</p>
          <span className="mt-4 inline-block text-sm font-semibold text-verdi-700 group-hover:underline max-md:mt-2">Start a chat →</span>
        </a>
        <a href={SITE.phoneHref} className="card group p-6 transition hover:shadow-[var(--shadow-lift)] max-md:min-h-32 max-md:p-4">
          <Phone className="size-6 text-verdi-600" />
          <h2 className="mt-4 font-semibold max-md:mt-2">Call us</h2>
          <p className="num mt-1 text-sm text-muted">{SITE.phoneDisplay}</p>
          <span className="mt-4 inline-block text-sm font-semibold text-verdi-700 group-hover:underline max-md:mt-2">Call now →</span>
        </a>
        <a href={`mailto:${SITE.email}`} className="card group p-6 transition hover:shadow-[var(--shadow-lift)] max-md:min-h-32 max-md:p-4">
          <Mail className="size-6 text-verdi-600" />
          <h2 className="mt-4 font-semibold max-md:mt-2">Email</h2>
          <p className="mt-1 text-sm break-all text-muted">{SITE.email}</p>
          <span className="mt-4 inline-block text-sm font-semibold text-verdi-700 group-hover:underline max-md:mt-2">Write to us →</span>
        </a>
        <div className="card p-6 max-md:col-span-2 max-md:p-4">
          <MapPin className="size-6 text-verdi-600" />
          <h2 className="mt-4 font-semibold max-md:mt-2">Address</h2>
          <address className="mt-1 text-sm text-muted not-italic">
            {SITE.address.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </address>
          <a className="mt-4 inline-block text-sm font-semibold text-verdi-700 hover:underline max-md:btn-primary max-md:tap max-md:mt-3 max-md:w-full max-md:text-white max-md:no-underline" target="_blank" rel="noopener" href={SITE.mapsUrl} data-testid="contact-maps-link">
            Open in Google Maps →
          </a>
        </div>
      </div>
      {/* the shop on a map; a tap or click opens Google Maps (the app on phones) for directions */}
      <div className="relative mt-6 overflow-hidden rounded-3xl border border-line bg-paper-2 max-md:mt-4" data-testid="contact-map">
        <iframe
          title={`Map: VERDI SOLARR SOLUTION, ${SITE.addressOneLine}`}
          src={SITE.mapsEmbedUrl}
          className="pointer-events-none block aspect-[16/7] w-full border-0 max-md:aspect-[4/3]"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          tabIndex={-1}
        />
        <a href={SITE.mapsUrl} target="_blank" rel="noopener" className="group absolute inset-0 flex items-end p-4" aria-label="Open VERDI SOLARR SOLUTION in Google Maps for directions" data-testid="contact-map-link">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink/90 px-4 py-2.5 text-sm font-semibold text-paper shadow-[var(--shadow-lift)] backdrop-blur transition group-hover:bg-ink">
            <MapPin className="size-4 text-sun-400" /> Open in Google Maps for directions
          </span>
        </a>
      </div>
      <p className="mt-8 flex items-center gap-2 text-sm text-muted">
        <Clock className="size-4" /> Please call or message to confirm business hours before visiting.
      </p>
    </div>
  );
}
