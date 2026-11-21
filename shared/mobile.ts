// Phone-number helpers with no dependencies, so public pages can use them without loading zod.

/** Normalise an Indian mobile number to 12 digits (91XXXXXXXXXX). Returns null if invalid. */
export function normaliseMobile(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  if (!/^91[6-9]\d{9}$/.test(d)) return null;
  return d;
}

/** 919876543210 -> "+91 98765 43210" */
export function formatMobile(n: string): string {
  return /^91\d{10}$/.test(n) ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : n;
}
