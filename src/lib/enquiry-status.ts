import type { EnquiryStatus } from "../../shared/types";

export const STATUS_STYLE: Record<EnquiryStatus, string> = {
  new: "bg-sky-100 text-sky-800",
  contacted: "bg-violet-100 text-violet-800",
  quoted: "bg-sun-100 text-ink",
  won: "bg-verdi-100 text-verdi-800",
  lost: "bg-paper-3 text-muted",
  cancelled: "bg-paper-3 text-muted",
};

/** Customer-facing wording for each enquiry status. */
export const STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "Received",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Order confirmed",
  lost: "Closed",
  cancelled: "Cancelled",
};

/** Staff-facing wording (the admin): Lost and the old Cancelled are both "Not won". */
export const ADMIN_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Not won",
  cancelled: "Not won",
};

/** One line under each stage telling staff what it means and what to do next. */
export const STATUS_HINT: Record<EnquiryStatus, string> = {
  new: "Nobody has spoken to the customer yet. Call or WhatsApp them, then mark it Contacted.",
  contacted: "You have spoken to the customer. Next: create a quotation.",
  quoted: "A quotation was made. Waiting for the customer's answer: open the quotation to mark it accepted or declined.",
  won: "The customer is buying. Sale amount recorded; staff bonus and customer points are added automatically.",
  lost: "Closed without a sale. The reason helps improve the service.",
  cancelled: "Closed without a sale. The reason helps improve the service.",
};
