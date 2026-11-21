import { useEffect, useState, type ReactNode } from "react";
import { Accordion } from "../components/mobile/kit";
import { Link } from "react-router";
import { useSite } from "../lib/site";
import { usePageMeta } from "../lib/seo";

const UPDATED = "14 November 2026";

function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="container-x max-w-3xl py-12 max-lg:py-5 sm:py-16">
      <p className="font-mono text-xs tracking-[0.16em] text-muted uppercase">Last updated {UPDATED}</p>
      <h1 className="mt-2 text-4xl font-semibold max-sm:text-2xl">{title}</h1>
      <p className="mt-3 text-muted max-lg:text-sm">{intro}</p>
      <LegalToc />
      <div id="legal-body" className="mt-8 grid gap-7 text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:grid [&_ul]:gap-1.5">{children}</div>
    </div>
  );
}

/** Phones: "On this page" list of the section headings, in an accordion (built from the page itself). */
function LegalToc() {
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    const hs = [...document.querySelectorAll<HTMLHeadingElement>("#legal-body h2")];
    setItems(
      hs.map((h) => {
        if (!h.id) h.id = (h.textContent ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        h.classList.add("scroll-mt-20");
        return { id: h.id, text: h.textContent ?? "" };
      }),
    );
  }, []);
  if (!items.length) return null;
  return (
    <Accordion title="On this page" className="mt-4 rounded-2xl border border-line bg-card px-4 lg:hidden">
      <ol className="grid gap-0.5" data-testid="legal-toc">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="tap flex items-center text-sm text-verdi-700">
              {i.text}
            </a>
          </li>
        ))}
      </ol>
    </Accordion>
  );
}

/** Privacy notice: describes only what this website actually collects and does. */
export function Privacy() {
  const SITE = useSite();
  usePageMeta("Privacy policy", `How ${SITE.name} collects, uses and protects your personal data.`);
  return (
    <Shell title="Privacy policy" intro={`${SITE.name} ("we") respects your privacy. This notice explains what personal data this website collects, why, and the choices you have.`}>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <b>When you send an enquiry:</b> your name, business name (optional), mobile number, delivery location, the products and quantities you ask about, and any comments.
          </li>
          <li>
            <b>When you create an account:</b> your name, mobile number, password (stored only as a one-way scrambled hash — nobody can read it), and optionally email, business name and city. We also keep your enquiry history and reward points.
          </li>
          <li>
            <b>When we prepare a quotation for you:</b> the contact details you give us and the products quoted.
          </li>
          <li>
            <b>Technical data:</b> your IP address and browser details are processed briefly to keep the site secure (for example, to block repeated failed sign-ins). We do not use advertising or tracking cookies.
          </li>
        </ul>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To reply to your enquiry and prepare quotations.</li>
          <li>To run your account: enquiry history and reward points.</li>
          <li>To keep the website and your account secure.</li>
        </ul>
        <p className="mt-2">We do not sell or rent your personal data, and we do not use it for third-party advertising.</p>
      </section>
      <section>
        <h2>Cookies and storage</h2>
        <p>
          We use only cookies and browser storage that the site needs to work: keeping you signed in (you are signed out after 30 minutes of inactivity), remembering your enquiry basket and comparison list, and a few display preferences. No consent banner is
          needed because none of them track you.
        </p>
      </section>
      <section>
        <h2>Where it is stored</h2>
        <p>
          The website and its database run on Cloudflare's platform, which may process data in data centres outside India. Enquiries you send on WhatsApp are also handled by WhatsApp under its own privacy policy.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>We keep enquiries, quotations and account details for as long as needed to serve you and to meet legal and tax obligations. You can ask us to delete your account at any time.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>You can ask us to show, correct or delete your personal data, or withdraw your consent. Contact us using the details below and we will respond as soon as possible.</p>
      </section>
      <section>
        <h2>Contact / grievances</h2>
        <p>
          {SITE.name}, {SITE.addressOneLine}
          <br />
          Phone / WhatsApp:{" "}
          <a className="text-verdi-700 underline" href={SITE.phoneHref}>
            {SITE.phoneDisplay}
          </a>{" "}
          · Email:{" "}
          <a className="text-verdi-700 underline" href={`mailto:${SITE.email}`}>
            {SITE.email}
          </a>
        </p>
      </section>
      <p className="text-sm text-muted">
        See also our{" "}
        <Link className="text-verdi-700 underline" to="/terms">
          terms of use
        </Link>
        .
      </p>
    </Shell>
  );
}

/** Terms of use: reflects how the site works (enquiries, no online ordering or payment). */
export function Terms() {
  const SITE = useSite();
  usePageMeta("Terms of use", `Terms for using the ${SITE.name} website.`);
  return (
    <Shell title="Terms of use" intro={`By using this website you agree to these terms. If you do not agree, please do not use the website.`}>
      <section>
        <h2>About this website</h2>
        <p>
          This website is a product catalogue and enquiry service. Nothing is ordered or paid for online: sending an enquiry or receiving a quotation does not create a purchase. A sale happens only when we confirm it with you directly.
        </p>
      </section>
      <section>
        <h2>Prices and availability</h2>
        <ul>
          <li>Prices shown are indicative and may change. The price, taxes, availability and delivery are confirmed with you before any sale.</li>
          <li>A quotation is valid only until the date printed on it.</li>
        </ul>
      </section>
      <section>
        <h2>Product information</h2>
        <p>
          Specifications are taken from manufacturer datasheets, which are provided for reference. Please check the manufacturer's latest datasheet and suitability for your project before installation. Brand names and trademarks belong to their respective
          owners.
        </p>
      </section>
      <section>
        <h2>Tools and calculators</h2>
        <p>The solar calculators and the kit builder give estimates only. They are not a substitute for a site survey or professional design.</p>
      </section>
      <section>
        <h2>Accounts</h2>
        <p>Keep your password private. Tell us straight away if you think someone else has used your account. We may suspend accounts that are misused. Reward points have no cash value unless we agree otherwise in writing.</p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>Do not misuse the website: no attempts to break in, overload it, copy the catalogue automatically, or send false enquiries.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          {SITE.name}, {SITE.addressOneLine} · {SITE.phoneDisplay} · {SITE.email}. See also our{" "}
          <Link className="text-verdi-700 underline" to="/privacy">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </Shell>
  );
}
