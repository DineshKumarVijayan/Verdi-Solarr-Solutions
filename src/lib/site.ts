import { useMemo } from "react";
import { formatMobile } from "../../shared/mobile";
import type { PublicFieldPhoto } from "../../shared/types";
import { FIELD_PHOTOS } from "../pages/field-data";
import { SITE as DEFAULTS } from "../site";
import { useCatalogue } from "./catalogue";

export type SiteInfo = typeof DEFAULTS & {
  whatsappNumber: string;
  businessHours: string;
  facebookUrl: string;
  youtubeUrl: string;
  linkedinUrl: string;
  announcement: string;
  announcementLink: string;
};

/**
 * Business details as edited by the admin (Admin → Settings), falling back to the
 * built-in defaults in src/site.ts. Comes from the published catalogue snapshot,
 * so it costs no extra requests.
 */
export function useSite(): SiteInfo {
  const { data } = useCatalogue();
  const s = data?.settings;
  return useMemo(() => {
    const phone = s?.phone ?? "918939277997";
    const wa = s?.whatsapp ?? phone;
    // Address is stored one line per row (newline-separated).
    const address = s?.address ? s.address.split("\n").map((l) => l.trim()).filter(Boolean) : DEFAULTS.address;
    return {
      ...DEFAULTS,
      contactPerson: s?.contactPerson ?? DEFAULTS.contactPerson,
      phoneDisplay: s?.phone ? formatMobile(phone) : DEFAULTS.phoneDisplay,
      phoneHref: `tel:+${phone}`,
      whatsappNumber: wa,
      whatsappUrl: `https://wa.me/${wa}`,
      email: s?.email ?? DEFAULTS.email,
      address,
      addressOneLine: s?.address ? address.join(", ") : DEFAULTS.addressOneLine,
      businessHours: s?.businessHours ?? "",
      instagramUrl: s?.instagramUrl ?? DEFAULTS.instagramUrl,
      mapsUrl: s?.mapsUrl || DEFAULTS.mapsUrl,
      mapsEmbedUrl: s?.mapsEmbedUrl || DEFAULTS.mapsEmbedUrl,
      facebookUrl: s?.facebookUrl ?? "",
      youtubeUrl: s?.youtubeUrl ?? "",
      linkedinUrl: s?.linkedinUrl ?? "",
      announcement: s?.announcement ?? "",
      announcementLink: s?.announcementLink ?? "",
    };
  }, [s]);
}

/** "In the field" photos as managed in Admin → Field photos (static list until the catalogue loads). */
export function useFieldPhotos(): PublicFieldPhoto[] {
  const { data } = useCatalogue();
  return data?.fieldPhotos ?? FIELD_PHOTOS;
}
