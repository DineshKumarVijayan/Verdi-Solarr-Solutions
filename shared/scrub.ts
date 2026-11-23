/** Blank out phone numbers and email addresses before anything is sent to an outside service (error alerts). */
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const scrub = (s: string) => s.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
