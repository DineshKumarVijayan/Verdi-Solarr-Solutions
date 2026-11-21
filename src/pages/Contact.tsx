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
          <a className="mt-4 inline-block text-sm font-semibold text-verdi-700 hover:underline max-md:btn-primary max-md:tap max-md:mt-3 max-md:w-full max-md:text-white max-md:no-underline" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SITE.addressOneLine)}`}>
            Open in Maps →
          </a>
        </div>
      </div>
      <p className="mt-8 flex items-center gap-2 text-sm text-muted">
        <Clock className="size-4" /> Please call or message to confirm business hours before visiting.
      </p>
    </div>
  );
}
