// The staff helper inside the admin. It never holds data of its own: it explains every admin module,
// opens the right page (where the server applies each role's rules), reads the person's OWN "My day"
// through the same endpoint as the dashboard, and answers product questions from the public catalogue.
// What a role may not do is explained politely, without data or links to pages it cannot open.

import { guideAnswer, matchGuide, reply, type Guide, type HelperAnswer, type HelperContext, type Lang } from "./assistant";
import { ROLE_LABEL, type AdminRole } from "./types";

export interface StaffContext extends HelperContext {
  role: AdminRole;
}

const OWNER: AdminRole[] = ["owner"];
const MANAGERS: AdminRole[] = ["owner", "admin"];
const PRICE_ROLES: AdminRole[] = ["owner", "admin", "price_editor"];
const SALES: AdminRole[] = ["price_editor", "viewer"];
const EVERYONE: AdminRole[] = ["owner", "admin", "price_editor", "viewer"];

interface StaffGuide extends Guide {
  /** who may do this (everyone when missing) */
  can?: AdminRole[];
  /** who may at least open the page to look (everyone when missing); others get no link */
  see?: AdminRole[];
}

/** Everything the admin does, module by module. Answers describe the real screens and rules. */
const GUIDES: StaffGuide[] = [
  // ---- daily work
  { id: "dashboard", about: ["dashboard", "overview", "summary", "டாஷ்போர்டு"], en: "The dashboard starts with your My day, then the key numbers. Every number and counter opens the matching filtered list.", ta: "டாஷ்போர்டு உங்கள் My day-உடன் தொடங்கும், பிறகு முக்கிய எண்கள். ஒவ்வொரு எண்ணும் அதற்கான பட்டியலைத் திறக்கும்.", link: { label: "Dashboard", to: "/admin" } },
  { id: "enquiries", about: ["enquiry list", "all enquiries", "find enquiry", "search enquiry", "filter enquiry", "lead", "leads", "enquiries"], en: "Enquiries lists every enquiry you may see (sales staff: your own and unassigned ones; owner/admin: all). Search by name, mobile or reference, and filter by stage, source or person.", ta: "Enquiries-ல் நீங்கள் பார்க்க அனுமதி உள்ள எல்லா enquiries-ம் இருக்கும் (விற்பனை ஊழியர்: உங்களுடையதும் யாரும் எடுக்காதவையும்; owner/admin: அனைத்தும்). பெயர், மொபைல், reference வைத்து தேடலாம்.", link: { label: "Enquiries", to: "/admin/enquiries" } },
  { id: "log", about: ["log enquiry", "add enquiry", "phone enquiry", "walk in", "new lead", "add lead", "customer called", "enquiry பதிவு"], en: "Use “Log an enquiry” for a customer who called, messaged or visited: name, mobile, place, what they need, products (optional), the stage after the call and the next follow-up date. It is assigned to you.", ta: "அழைத்த, செய்தி அனுப்பிய அல்லது நேரில் வந்த வாடிக்கையாளருக்கு “Log an enquiry”: பெயர், மொபைல், இடம், தேவை, பொருட்கள் (விருப்பம்), அழைப்புக்குப் பின் நிலை, அடுத்த follow-up தேதி. அது உங்களுக்கு ஒதுக்கப்படும்.", link: { label: "Log an enquiry", to: "/admin/enquiries?log=1" } },
  { id: "take", about: ["take enquiry", "assign to me", "unassigned", "not taken", "new enquiry", "புதிய enquiries"], en: "New enquiries nobody has taken are under “New, not taken”. Open one and take it; it becomes yours and moves to your My day.", ta: "யாரும் எடுக்காத புதிய enquiries “New, not taken”-ல் இருக்கும். ஒன்றைத் திறந்து எடுத்துக்கொள்ளுங்கள்; அது உங்களுடையதாகி My day-ல் வரும்.", link: { label: "New, not taken", to: "/admin/enquiries?owner=none&status=new" } },
  { id: "stages", about: ["stage", "status of enquiry", "contacted", "mark won", "not won", "lost", "close enquiry", "reason", "next step", "step bar"], en: "Every enquiry goes New → Contacted → Quoted → Won or Not won. Open it and use the next-step button. “Not won” asks for a reason (price, competitor…), which feeds the owner's report. With a quotation, the sale is recorded by accepting the quotation.", ta: "ஒவ்வொரு enquiry-யும் New → Contacted → Quoted → Won அல்லது Not won. Enquiry-ஐத் திறந்து next-step பட்டனைப் பயன்படுத்துங்கள். Not won-க்கு காரணம் (விலை, போட்டியாளர்…) கேட்கும். Quotation இருந்தால், அதை accept செய்வதே விற்பனை.", link: { label: "My enquiries", to: "/admin/enquiries?owner=me", ta: "என் enquiries" } },
  { id: "reopen", see: MANAGERS, about: ["reopen", "re-open", "undo won", "undo accepted"], can: MANAGERS, en: "Closed enquiries and accepted quotations are reopened or undone by the owner or an admin, from the enquiry or the quotation.", ta: "மூடிய enquiries மற்றும் accepted quotations-ஐ owner அல்லது admin மீண்டும் திறக்கலாம்.", link: { label: "Enquiries", to: "/admin/enquiries" } },
  { id: "followup", about: ["follow up", "followup", "follow-up", "reminder", "remind", "call back", "callback", "ஃபாலோ"], en: "Open the enquiry and set a follow-up date. On that day it appears in My day; overdue ones come first, with Call and WhatsApp buttons.", ta: "Enquiry-ஐத் திறந்து follow-up தேதி வையுங்கள். அந்த நாளில் My day-ல் வரும்; தாமதமானவை Call, WhatsApp பட்டன்களுடன் முதலில்.", link: { label: "My follow-ups", to: "/admin/enquiries?owner=me&followup=overdue", ta: "என் follow-ups" } },
  { id: "reassign", see: MANAGERS, about: ["reassign", "transfer enquiry", "move enquiry", "bulk", "on leave", "hand over", "give enquiry"], can: MANAGERS, en: "In Enquiries, tap Select, tick the enquiries and choose the person in the bar at the bottom. Useful when someone is on leave.", ta: "Enquiries-ல் Select அழுத்தி, enquiries-ஐத் தேர்ந்தெடுத்து கீழே உள்ள பட்டையில் நபரைத் தேர்வு செய்யுங்கள். ஒருவர் விடுப்பில் இருக்கும்போது பயன்படும்.", link: { label: "Enquiries", to: "/admin/enquiries" } },
  { id: "whatsapp", about: ["whatsapp", "message customer", "ready message", "send message", "வாட்ஸ்அப்"], en: "On an enquiry or quotation, tap WhatsApp and pick a ready message. The customer's name, reference and quotation details are filled in for you.", ta: "Enquiry அல்லது quotation-ல் WhatsApp அழுத்தி தயாரான செய்தியைத் தேர்வு செய்யுங்கள். பெயர், reference, quotation விவரங்கள் தானாக நிரம்பும்.", link: { label: "My enquiries", to: "/admin/enquiries?owner=me", ta: "என் enquiries" } },
  { id: "templates", about: ["template", "message wording", "edit message", "whatsapp wording", "review link"], can: MANAGERS, en: "The wording of the ready WhatsApp messages is edited in Settings → WhatsApp messages.", ta: "WhatsApp செய்திகளின் வார்த்தைகளை Settings → WhatsApp messages-ல் மாற்றலாம்.", link: { label: "Settings", to: "/admin/settings" } },
  { id: "myday", about: ["what is my day", "my day work"], en: "My day shows what needs you today: overdue and today's follow-ups, new enquiries nobody has taken, and your quotations about to expire. Ask me “my day” to see it here.", ta: "My day இன்று உங்களுக்குத் தேவையானதைக் காட்டும்: தாமதமான, இன்றைய follow-ups, யாரும் எடுக்காத புதிய enquiries, காலாவதியாகும் quotations.", link: { label: "Dashboard", to: "/admin" } },

  // ---- quotations
  { id: "quote-new", about: ["create quotation", "new quotation", "make quotation", "prepare quotation", "quotation", "quote"], en: "Quotations → New quotation (or “Create quotation” on an enquiry, which fills in the customer and products). Add catalogue products; prices come from the system. Tip: ask me “new quote for Ravi 98400 12345”.", ta: "Quotations → New quotation (அல்லது enquiry-ல் “Create quotation”, அது வாடிக்கையாளர், பொருட்களை நிரப்பும்). பட்டியலில் இருந்து பொருட்களைச் சேர்க்கவும்; விலை சிஸ்டத்தில் இருந்து வரும்.", link: { label: "New quotation", to: "/admin/quotations/new", ta: "புதிய quotation" } },
  { id: "quote-send", about: ["send quotation", "send quote", "share quotation", "quotation pdf", "download pdf", "pdf", "எப்படி அனுப்ப"], en: "Open the quotation: Preview shows the PDF, Download saves it, and WhatsApp sends the customer a private link to the PDF and marks the quotation Sent.", ta: "Quotation-ஐத் திறந்து: Preview PDF-ஐக் காட்டும், Download சேமிக்கும், WhatsApp வாடிக்கையாளருக்கு PDF இணைப்பை அனுப்பி ‘Sent’ ஆக்கும்.", link: { label: "Quotations", to: "/admin/quotations" } },
  { id: "quote-discount", about: ["discount", "extra discount", "reduce price"], en: "In the quotation editor each line has a discount (% or amount), and there is an extra discount for the whole quotation. Totals update as you type.", ta: "Quotation editor-ல் ஒவ்வொரு வரிக்கும் தள்ளுபடி (% அல்லது தொகை), முழு quotation-க்கும் கூடுதல் தள்ளுபடி உண்டு. மொத்தம் உடனே மாறும்.", link: { label: "Quotations", to: "/admin/quotations" } },
  { id: "quote-accept", about: ["accept quotation", "accepted", "customer agreed", "confirm order", "record sale", "sale"], en: "When the customer agrees, open the quotation and set its status to Accepted. That records the sale, the staff bonus and the customer's loyalty points together.", ta: "வாடிக்கையாளர் ஒப்புக்கொண்டால், quotation நிலையை Accepted ஆக்குங்கள். அது விற்பனை, staff bonus, வாடிக்கையாளர் புள்ளிகள் மூன்றையும் பதிவு செய்யும்.", link: { label: "My quotations", to: "/admin/quotations?owner=me", ta: "என் quotations" } },
  { id: "quote-expiry", about: ["validity", "valid", "expire", "expiry", "remind customer"], en: "Each quotation is valid for the days you set. Ones expiring within 3 days show in My day; use “Remind on WhatsApp” to follow up.", ta: "ஒவ்வொரு quotation-ம் நீங்கள் வைத்த நாட்கள் வரை செல்லுபடி. 3 நாட்களுக்குள் காலாவதியாகுபவை My day-ல் வரும்; “Remind on WhatsApp” பயன்படுத்துங்கள்.", link: { label: "Expiring quotations", to: "/admin/quotations?owner=me&expiring=1", ta: "காலாவதியாகும் quotations" } },
  { id: "quote-settings", see: MANAGERS, about: ["bank detail", "upi", "qr code", "quotation setting", "pdf detail"], can: MANAGERS, en: "Bank details, UPI ID and QR code, and the default validity for the quotation PDF are set in Quotations → PDF details.", ta: "Quotation PDF-க்கான வங்கி விவரம், UPI, QR code, இயல்பு செல்லுபடி நாட்கள் Quotations → PDF details-ல்.", link: { label: "Quotations", to: "/admin/quotations" } },
  { id: "quote-delete", see: MANAGERS, about: ["delete quotation", "remove quotation", "cancel quotation"], can: MANAGERS, en: "Quotations are deleted by the owner or an admin (Delete quotation, with a confirmation). Staff can leave a quotation as a draft instead.", ta: "Quotations-ஐ owner அல்லது admin மட்டுமே நீக்கலாம். ஊழியர்கள் draft ஆக விடலாம்.", link: { label: "Quotations", to: "/admin/quotations" } },

  // ---- catalogue
  { id: "products", about: ["product list", "products", "check product", "view product", "edit product"], can: MANAGERS, see: EVERYONE, en: "Products lists the whole catalogue with filters (brand, category, visible/hidden, price not set). Open a product to edit its details, specifications, photos and datasheet.", ta: "Products-ல் முழு பட்டியல், வடிகட்டிகளுடன். ஒரு பொருளைத் திறந்து விவரங்கள், specifications, படங்கள், datasheet-ஐ மாற்றலாம்.", link: { label: "Products", to: "/admin/products" } },
  { id: "product-add", about: ["add product", "new product", "create product", "duplicate product", "copy product", "new variant"], can: MANAGERS, see: EVERYONE, en: "Products → Add product, or Duplicate an existing one for a new wattage variant and change only what differs.", ta: "Products → Add product, அல்லது புதிய wattage-க்கு இருக்கும் பொருளை Duplicate செய்து மாற்றங்களை மட்டும் செய்யுங்கள்.", link: { label: "Products", to: "/admin/products" } },
  { id: "photos", about: ["photo", "image", "picture", "படம்", "புகைப்படம்", "பதிவேற்ற"], can: MANAGERS, see: EVERYONE, en: "Open the product → “Images & datasheet” → Upload images. Use real product photos and add a short description for each. Without a photo, the site shows a labelled illustration. (Work photos for the In the field page are under Photos.)", ta: "பொருளைத் திறந்து → “Images & datasheet” → Upload images. உண்மையான படங்களைப் பயன்படுத்தி, ஒவ்வொன்றுக்கும் சிறு விளக்கம் சேர்க்கவும். (In the field வேலைப் படங்கள் Photos-ல்.)", link: { label: "Products", to: "/admin/products" } },
  { id: "datasheet", about: ["datasheet", "data sheet", "upload pdf", "spec sheet"], can: MANAGERS, see: EVERYONE, en: "Open the product → “Images & datasheet” → Datasheet (PDF). Customers can preview and download it on the product page.", ta: "பொருளைத் திறந்து → “Images & datasheet” → Datasheet (PDF). வாடிக்கையாளர்கள் பொருள் பக்கத்தில் பார்த்து download செய்யலாம்.", link: { label: "Products", to: "/admin/products" } },
  { id: "specs", about: ["specification", "spec", "description", "product detail", "highlight"], can: MANAGERS, see: EVERYONE, en: "Open the product: “Product details” holds the name, model and description; “Specifications” holds the technical values from the datasheet.", ta: "பொருளைத் திறந்து: “Product details”-ல் பெயர், மாடல், விளக்கம்; “Specifications”-ல் datasheet மதிப்புகள்.", link: { label: "Products", to: "/admin/products" } },
  { id: "hide", about: ["hide product", "show product", "visible", "hidden", "remove product", "delete product", "featured"], can: MANAGERS, see: EVERYONE, en: "In the product, “Visible on website” shows or hides it, “Featured” puts it forward on the home page, and Remove product deletes it.", ta: "பொருளில் “Visible on website” காட்ட/மறைக்க; “Featured” முகப்பில் முன்னிலைப்படுத்த; Remove product நீக்க.", link: { label: "Products", to: "/admin/products" } },
  { id: "stock", about: ["stock status", "change stock", "out of stock", "limited stock", "availability", "stock", "ஸ்டாக்", "கையிருப்பு"], can: MANAGERS, see: EVERYONE, en: "Change stock in one tap from the Products list (In stock / Limited / Out of stock), or in the product's Availability & offer card. Customers see it everywhere at once.", ta: "Products பட்டியலில் ஒரே தொடுதலில் stock-ஐ மாற்றலாம் (In stock / Limited / Out of stock), அல்லது பொருளின் Availability & offer பகுதியில்.", link: { label: "Products", to: "/admin/products" } },
  { id: "offer", about: ["set offer", "add offer", "remove offer", "change offer", "offer label", "festival offer", "offer", "சலுகை"], can: MANAGERS, see: EVERYONE, en: "Open the product → Availability & offer → turn the offer on and add a short label (e.g. Festival offer). The % off is shown only when an MRP is set.", ta: "பொருளைத் திறந்து → Availability & offer → offer-ஐ இயக்கி சிறு லேபிள் சேர்க்கவும் (எ.கா. Festival offer). MRP இருந்தால் மட்டும் % தள்ளுபடி காட்டப்படும்.", link: { label: "Products", to: "/admin/products" } },
  { id: "price", about: ["change price", "update price", "edit price", "set price", "selling price", "mrp", "gst", "price on request", "price", "விலை"], can: PRICE_ROLES, see: EVERYONE, en: "Prices → find the product → change the selling price (and MRP, GST, unit) and save. The website updates immediately. Leave it empty to show “Price on request”.", ta: "Prices → பொருளைத் தேடி → விலையை (MRP, GST, அலகு) மாற்றி சேமிக்கவும். இணையதளம் உடனே மாறும். காலியாக விட்டால் “Price on request”.", link: { label: "Prices", to: "/admin/prices" } },
  { id: "price-history", about: ["price history", "old price", "who changed price", "last change"], en: "Each product in Prices has a Price history: every change, with who made it and when.", ta: "Prices-ல் ஒவ்வொரு பொருளுக்கும் Price history: ஒவ்வொரு மாற்றமும், யார், எப்போது.", link: { label: "Prices", to: "/admin/prices" } },
  { id: "brands", about: ["brand", "category", "categories", "manufacturer", "logo"], can: MANAGERS, see: EVERYONE, en: "Brands & categories: add or edit brands (with logo) and categories, and show or hide them on the website.", ta: "Brands & categories: பிராண்ட் (லோகோவுடன்), வகைகளைச் சேர்க்க/மாற்ற, இணையதளத்தில் காட்ட/மறைக்க.", link: { label: "Brands & categories", to: "/admin/catalogue" } },
  { id: "field", about: ["field photo", "in the field", "gallery", "site photo", "project photo", "installation photo", "work photo"], can: MANAGERS, see: EVERYONE, en: "Photos (Field photos): upload real work photos with a caption, reorder them, and show or hide each one.", ta: "Photos (Field photos): உண்மையான வேலைப் படங்களை caption-உடன் பதிவேற்றலாம், வரிசை மாற்றலாம், காட்ட/மறைக்கலாம்.", link: { label: "Field photos", to: "/admin/field-photos" } },

  // ---- customers, money, people
  { id: "customers", about: ["customer", "customer list", "customer account", "disable customer", "customer password", "reset link"], can: MANAGERS, see: MANAGERS, en: "Customers lists registered customers with their enquiries and points. From a customer you can add or remove points, enable or disable the account, or create a password reset link to send on WhatsApp.", ta: "Customers-ல் பதிவு செய்த வாடிக்கையாளர்கள், அவர்களின் enquiries, புள்ளிகள். புள்ளிகள் சேர்க்க/குறைக்க, கணக்கை இயக்க/நிறுத்த, reset link உருவாக்கலாம்.", link: { label: "Customers", to: "/admin/customers" } },
  { id: "loyalty", about: ["loyalty", "point", "reward", "add point", "loyalty percentage", "pending point", "invite", "புள்ளி"], can: MANAGERS, see: MANAGERS, en: "Loyalty points are added automatically when a sale is recorded (0.5% by default; the owner or an admin sets the %). Buyers without an account get pending points and a WhatsApp invite. Points can also be added or removed by hand in Customers.", ta: "விற்பனை பதிவானதும் புள்ளிகள் தானாக சேரும் (இயல்பு 0.5%; சதவீதத்தை owner/admin மாற்றலாம்). கணக்கில்லாதவர்களுக்கு pending points மற்றும் WhatsApp அழைப்பு. Customers-ல் கைமுறையாகவும் சேர்க்கலாம்.", link: { label: "Customers", to: "/admin/customers" } },
  { id: "my-bonus", about: ["my bonus", "my incentive", "my commission", "my earning"], can: SALES, see: SALES, en: "My bonus shows your bonus for each sale you won, what is approved, and what has been paid.", ta: "My bonus-ல் நீங்கள் வென்ற ஒவ்வொரு விற்பனைக்கான bonus, அங்கீகரிக்கப்பட்டது, கொடுக்கப்பட்டது.", link: { label: "My bonus", to: "/admin/my-bonus" } },
  { id: "staff-bonus", about: ["staff bonus", "approve bonus", "pay bonus", "bonus rate", "bonus percentage", "payout", "bonus adjustment", "cancel payment"], can: MANAGERS, see: MANAGERS, en: "Staff bonus: set the bonus % (for everyone or per person), approve earned bonuses, record payments (date, method, reference) and make adjustments. A payment settles the balance, so nothing is paid twice.", ta: "Staff bonus: bonus % வைக்க (அனைவருக்கும்/ஒவ்வொருவருக்கும்), அங்கீகரிக்க, கொடுத்ததைப் பதிவு செய்ய, சரிசெய்ய. ஒரே bonus இரண்டு முறை கொடுக்கப்படாது.", link: { label: "Staff bonus", to: "/admin/bonus" } },
  { id: "performance", about: ["performance", "report", "sales report", "conversion", "win rate", "leaderboard"], can: MANAGERS, see: MANAGERS, en: "Performance shows enquiries, quotations, wins, sales value and win rate per person, by day, month or year, plus the reasons deals were not won.", ta: "Performance-ல் ஒவ்வொருவரின் enquiries, quotations, வெற்றிகள், விற்பனை மதிப்பு, வெற்றி விகிதம், நாள்/மாதம்/வருடம், மற்றும் இழந்த காரணங்கள்.", link: { label: "Performance", to: "/admin/performance" } },
  { id: "staff", about: ["add staff", "new staff", "staff account", "user account", "users", "staff role", "deactivate staff", "staff password", "remove staff", "staff member"], can: OWNER, see: OWNER, en: "Staff (owner only): add staff with a mobile number and a temporary password, choose the role (Admin, Price editor, Sales staff), or deactivate someone; their open enquiries are handed back automatically.", ta: "Staff (owner மட்டும்): மொபைல் எண், தற்காலிக கடவுச்சொல்லுடன் ஊழியரைச் சேர்க்க, பொறுப்பைத் தேர்வு செய்ய, அல்லது நிறுத்த; அவரது திறந்த enquiries தானாகத் திரும்பும்.", link: { label: "Staff", to: "/admin/users" } },
  { id: "settings", about: ["settings", "contact detail", "address", "announcement", "social", "instagram", "facebook", "business hour", "site setting"], can: MANAGERS, en: "Settings: contact details, business hours, social links, the announcement bar, WhatsApp message wording and the questions & answers. Changes are live on the website at once.", ta: "Settings: தொடர்பு விவரம், வேலை நேரம், social links, அறிவிப்புப் பட்டை, WhatsApp செய்திகள், கேள்வி பதில்கள். மாற்றங்கள் உடனே இணையதளத்தில்.", link: { label: "Settings", to: "/admin/settings" } },
  { id: "faq", about: ["faq", "question and answer", "questions and answers", "helper answer", "add question", "கேள்வி"], can: MANAGERS, en: "Questions & answers are in Settings (English, and Tamil if you like). They show on the FAQ page and the website helper answers with them. Use “Try a question” to test.", ta: "Questions & answers Settings-ல் உள்ளன (ஆங்கிலம், விரும்பினால் தமிழ்). அவை FAQ பக்கத்திலும் website helper-லும் வரும்.", link: { label: "Questions & answers", to: "/admin/settings#faqs" } },
  { id: "activity", about: ["activity", "audit", "history of change", "who changed", "log of change"], can: MANAGERS, see: MANAGERS, en: "Recent activity on the dashboard records who changed what and when: prices, products, enquiries, quotations, sign-ins and downloads.", ta: "டாஷ்போர்டில் Recent activity யார், எதை, எப்போது மாற்றினார்கள் என்று காட்டும்.", link: { label: "Dashboard", to: "/admin" } },

  // ---- personal and general
  { id: "excel", about: ["excel", "download", "export", "spreadsheet", "offline", "xlsx"], en: "Lists have a Download Excel button at the top. It saves what you can see (only your role's rows); every download is recorded.", ta: "பட்டியல்களின் மேலே Download Excel. நீங்கள் பார்ப்பதை மட்டும் சேமிக்கும்; ஒவ்வொரு download-உம் பதிவு செய்யப்படும்." },
  { id: "password", about: ["password", "change password", "கடவுச்சொல்"], en: "Use Password at the top of the admin (on phones: More → Password). Your other devices are signed out afterwards.", ta: "Admin மேலே உள்ள Password (கைபேசியில்: More → Password). பிறகு மற்ற சாதனங்கள் வெளியேற்றப்படும்." },
  { id: "signout", about: ["sign out", "signout", "log out", "logout"], en: "Use Sign out at the top of the admin (on phones: More → Sign out). You're also signed out after a period of no activity.", ta: "Admin மேலே Sign out (கைபேசியில்: More → Sign out). நீண்ட நேரம் பயன்படுத்தாவிட்டாலும் வெளியேற்றப்படுவீர்கள்." },
  { id: "phone", about: ["on phone", "on mobile", "phone app", "install app"], en: "The admin works on a phone, with bottom tabs for the most used sections and a More sheet for the rest.", ta: "Admin கைபேசியிலும் வேலை செய்யும்: அடிக்கடி பயன்படுத்துபவை கீழே tabs-ல், மற்றவை More-ல்." },
];

const T = {
  en: {
    myday: "Here's your day:",
    only: (who: string) => `That's only available to ${who}.`,
    viewOnly: (who: string) => `You can open this page to look, but only ${who} can change it.`,
    newQuote: (n: string) => (n ? `A new quotation for ${n} is ready to fill in:` : "Start a new quotation:"),
    openQuote: "New quotation",
    findRef: (r: string) => `Open ${r}:`,
    findMobile: (m: string) => `Search for ${m}:`,
    enquiries: "Enquiries",
    quotations: "Quotations",
    role: (r: string, can: string[]) => `You're signed in as ${r}. You can: ${can.join("; ")}.`,
    chips: ["My day", "Overdue follow-ups", "New quotation", "Log an enquiry", "How do I send a quotation?", "What can I do?"],
    chipsMgr: ["How do I upload product photos?", "How do I change a price?", "How do I set an offer?"],
    chipOffers: "Today's offers",
  },
  ta: {
    myday: "உங்கள் இன்றைய வேலை:",
    only: (who: string) => `இது ${who}-க்கு மட்டுமே.`,
    viewOnly: (who: string) => `இந்தப் பக்கத்தைப் பார்க்கலாம், ஆனால் ${who} மட்டுமே மாற்ற முடியும்.`,
    newQuote: (n: string) => (n ? `${n}-க்கு புதிய quotation தயார்:` : "புதிய quotation தொடங்குங்கள்:"),
    openQuote: "புதிய quotation",
    findRef: (r: string) => `${r} திற:`,
    findMobile: (m: string) => `${m} தேடு:`,
    enquiries: "Enquiries",
    quotations: "Quotations",
    role: (r: string, can: string[]) => `நீங்கள் ${r} ஆக உள்நுழைந்துள்ளீர்கள். நீங்கள் செய்யக்கூடியவை: ${can.join("; ")}.`,
    chips: ["என் இன்றைய வேலை", "தாமதமான follow-ups", "புதிய quotation", "Enquiry பதிவு செய்", "Quotation எப்படி அனுப்புவது?", "நான் என்ன செய்யலாம்?"],
    chipsMgr: ["பொருள் படம் எப்படி பதிவேற்றுவது?", "விலையை எப்படி மாற்றுவது?", "சலுகை எப்படி வைப்பது?"],
    chipOffers: "இன்றைய சலுகைகள்",
  },
};

const WHO = {
  owner: { en: "the owner", ta: "owner" },
  managers: { en: "the owner or an admin", ta: "owner அல்லது admin" },
  prices: { en: "the owner, an admin or a price editor", ta: "owner, admin அல்லது price editor" },
  sales: { en: "sales staff and price editors (the owner and admins use Staff bonus)", ta: "விற்பனை ஊழியர்கள் (owner/admin Staff bonus பயன்படுத்துவார்கள்)" },
};
function whoOf(roles: AdminRole[], lang: Lang): string {
  const key = roles.length === 1 && roles[0] === "owner" ? "owner" : roles.includes("owner") && roles.includes("price_editor") ? "prices" : roles.includes("owner") ? "managers" : "sales";
  return WHO[key][lang];
}

/** What this role can do, in a few words (for "what can I do?"). */
function roleSummary(role: AdminRole, lang: Lang): string[] {
  const ta = lang === "ta";
  const base = ta ? ["உங்கள் மற்றும் யாரும் எடுக்காத enquiries", "quotations உருவாக்கி அனுப்புதல்", "follow-ups மற்றும் My day", "Excel download"] : ["work on your own and unassigned enquiries", "create and send quotations", "follow-ups and My day", "download Excel"];
  if (role === "viewer") return [...base, ta ? "உங்கள் bonus பார்த்தல்" : "see your own bonus"];
  if (role === "price_editor") return [...base, ta ? "விலைகளை மாற்றுதல்" : "change prices", ta ? "உங்கள் bonus பார்த்தல்" : "see your own bonus"];
  const mgr = ta
    ? ["அனைத்து enquiries, மாற்றி ஒதுக்குதல்", "பொருட்கள், படங்கள், datasheets, stock, offers", "விலைகள்", "வாடிக்கையாளர்கள், புள்ளிகள்", "performance, staff bonus", "settings, கேள்வி பதில்கள்"]
    : ["all enquiries and reassigning", "products, photos, datasheets, stock and offers", "prices", "customers and loyalty points", "performance and staff bonus", "settings and questions & answers"];
  return role === "owner" ? [...mgr, ta ? "ஊழியர் கணக்குகள்" : "staff accounts and roles"] : mgr;
}

const plain = (q: string) => ` ${q.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim()} `;
const hasAny = (p: string, words: string[]) => words.some((w) => (/[஀-௿]/.test(w) ? p.includes(w) : p.includes(` ${w} `)));

export function staffWelcome(ctx: StaffContext): HelperAnswer {
  const t = T[ctx.lang];
  const hello =
    ctx.lang === "ta"
      ? "வணக்கம்! Admin-ன் எந்தப் பகுதியைப் பற்றியும் கேளுங்கள்: enquiries, quotations, பொருட்கள், படங்கள், விலைகள், உங்கள் இன்றைய வேலை, அல்லது ஒரு பொருளின் விலை, stock."
      : "Hi! Ask me about any part of the admin (enquiries, quotations, products, photos, prices, your day) or a product's price and stock.";
  const extra = MANAGERS.includes(ctx.role) ? t.chipsMgr : ctx.role === "price_editor" ? [t.chipsMgr[1]] : [];
  return { text: hello, chips: [...t.chips, ...extra, ...(ctx.cat.products.some((p) => p.offer) ? [t.chipOffers] : [])] };
}

function staffGuideAnswer(g: StaffGuide, ctx: StaffContext): HelperAnswer {
  const t = T[ctx.lang];
  if (!g.can || g.can.includes(ctx.role)) return guideAnswer(g, ctx.lang);
  if (!g.see || g.see.includes(ctx.role)) {
    const a = guideAnswer(g, ctx.lang);
    return { ...a, text: `${t.viewOnly(whoOf(g.can, ctx.lang))}\n${a.text}` };
  }
  return { text: t.only(whoOf(g.can, ctx.lang)) };
}

export function staffReply(question: string, ctx: StaffContext): HelperAnswer {
  const t = T[ctx.lang];
  const q = question.trim().slice(0, 300);
  const p = plain(q);
  if (!q || (hasAny(p, ["hi", "hello", "hey", "help", "menu", "வணக்கம்"]) && p.trim().split(" ").length <= 2)) return staffWelcome(ctx);

  // a reference or mobile number: open the list filtered to it (the server shows only what this person may see)
  const quoteRef = q.match(/\bVSQ-[A-Z0-9-]{3,}\b/i)?.[0];
  if (quoteRef) return { text: t.findRef(quoteRef.toUpperCase()), links: [{ label: t.quotations, to: `/admin/quotations?q=${encodeURIComponent(quoteRef.toUpperCase())}` }] };
  const enqRef = q.match(/\bVS-[A-Z0-9-]{3,}\b/i)?.[0];
  if (enqRef) return { text: t.findRef(enqRef.toUpperCase()), links: [{ label: t.enquiries, to: `/admin/enquiries?q=${encodeURIComponent(enqRef.toUpperCase())}` }] };
  const mobile = q.replace(/[\s-]/g, "").match(/(?:\+?91)?([6-9]\d{9})/)?.[1];

  // new quotation ("new quote for Ravi 98400 12345", "new quotation")
  const named = q.match(/\bfor\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s*(?:\+?91)?[6-9]\d|\s*$|,)/i)?.[1]?.trim() ?? "";
  const wantsNew = /\b(new|create|make|start|prepare)\b.*\bquot(e|ation)s?\b|புதிய quotation/i.test(q) && !/\bhow\b|எப்படி/i.test(q);
  if (wantsNew) {
    const params = new URLSearchParams();
    if (named) params.set("name", named);
    if (mobile) params.set("mobile", mobile);
    const qs = params.toString();
    return { text: t.newQuote(named), links: [{ label: t.openQuote, to: `/admin/quotations/new${qs ? `?${qs}` : ""}` }] };
  }
  if (mobile) return { text: t.findMobile(mobile), links: [{ label: t.enquiries, to: `/admin/enquiries?q=${mobile}` }, { label: t.quotations, to: `/admin/quotations?q=${mobile}` }] };

  // "today's offers" is a catalogue answer; "how do I set an offer" is a guide
  const asking = hasAny(p, ["how", "where", "can i", "set", "add", "change", "remove", "எப்படி"]);
  if (hasAny(p, ["offer", "offers", "discount", "deals", "சலுகை", "சலுகைகள்", "தள்ளுபடி"]) && !asking) return reply(q, { ...ctx, staff: true });

  // my day (the person's own work, from the same endpoint as the dashboard)
  if (hasAny(p, ["my day", "overdue", "pending", "due today", "follow up today", "follow ups today", "to do", "todo", "expiring", "my work", "my tasks", "தாமத", "இன்றைய வேலை"]) && !hasAny(p, ["how", "what is", "எப்படி"])) return { text: t.myday, need: "myday" };

  // "what can I do?"
  if (hasAny(p, ["what can i do", "my role", "my permissions", "what am i allowed", "நான் என்ன செய்யலாம்"])) return { text: t.role(ROLE_LABEL[ctx.role], roleSummary(ctx.role, ctx.lang)) };

  // how-to about any admin module, answered for this person's role
  const g = matchGuide(GUIDES, q);
  if (g) {
    // a plain product question ("price of 540 Wp panel") goes to the catalogue instead
    if (!g.asking) {
      const product = reply(q, { ...ctx, staff: true });
      if (product.products?.length) return product;
    }
    return staffGuideAnswer(g.guide, ctx);
  }

  // everything else: products, prices, offers, lessons (public catalogue) and the owner's answers
  return reply(q, { ...ctx, staff: true });
}
