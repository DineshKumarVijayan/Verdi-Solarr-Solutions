# Admin guide

This guide is for VERDI staff. You donâ€™t need any technical knowledge. Everything on the website that changes from time to time (products, brands, prices, datasheets, photos, contact details, enquiries, customers and reward points) is managed from the admin area. **No code changes are needed.**

## Signing in
1. Go to `/admin` (or the person icon â†’ **Staff / admin sign-in**; on phones it is in the â˜° menu).
2. Enter your **mobile number** and **password**, then click **Sign in**.
3. **You are signed out after 30 minutes without activity** (and after 12 hours at most). This applies to customers too. If it happens while you are editing, a sign-in box appears over the page. Your unsaved changes are kept: sign in again and then save.
4. **Change password**: use the link on the sign-in page (mobile number, current password, new password), or the **Password** button in the admin header. Changing your password signs out your other devices.
5. **New staff / forgotten password**: the owner adds the person, or resets their password, in **Staff** (formerly Admin users) with a *temporary* password. At their next sign-in they must choose their own password before they can continue. The temporary password then stops working.
6. Five wrong attempts lock the account for 15 minutes.

Passwords are stored only as salted one-way hashes, so nobody can read them, including the owner and the developer. The **Staff** (formerly Admin users) list also decides what each person may do.

| Role | Can do |
|---|---|
| Owner | Everything, including managing admin users |
| Admin | Everything except managing staff accounts: products, brands, categories, prices, photos, settings, all enquiries and quotations, customers, performance and bonus |
| Price editor | Same as Sales staff, plus changing prices |
| Sales staff | Their own enquiries (and unassigned ones they can take) and their own quotations; sees products and prices and their own bonus. Cannot change products, prices or settings |

### Adding staff (owner)
**Staff â†’ Add**: enter the mobile number (used to sign in), name, role and a temporary password. Email is optional. Share the temporary password privately. The list shows *Temporary password Â· must set their own* until the person has done so. To remove someone's access, edit the account and switch it to inactive. This signs them out immediately.

## Dashboard
Starts with **My day**: your follow-ups that are due or overdue, new enquiries nobody has taken yet, and your quotations that expire within 3 days. Below it: new enquiries, customer accounts, products, missing prices, images and datasheets, and recent activity. Each tile is a shortcut.

## Products
**Products â†’ Add product**
1. Enter the **product name**. The web address fills in automatically.
2. Choose the **brand** and **category**. If either is new, add it first under **Brands & categories**.
3. Enter your **SKU** (your own code, e.g. `VS-WAA-540`) and the manufacturer **model number**.
4. **Product family / series** and **Variant label** group models that share one datasheet (e.g. family â€œTOPCon 600â€“630 Wpâ€, variant â€œ610 Wpâ€).
5. Add a **short description**, **full description** and **highlights**. Only state facts from the manufacturer datasheet.
6. **Specifications:** use **Copy fields from a similar product** to get the same rows (blank values), then type each value exactly as in the datasheet. Keeping the same field keys (e.g. `power_wp`, `voc_v`) keeps search, compare and the calculators working.
7. Set the **price** (optional; leave blank for â€œPrice on requestâ€).
8. Click **Create product**. It is live on every page straight away.
9. Then add **images** (drag & drop; large photos are shrunk automatically, and the â˜… image is shown first) and the **datasheet PDF**. Customers can open the datasheet in the websiteâ€™s PDF viewer.

**Tips**
- **Duplicate** (copy icon in the list) is the fastest way to add another wattage of the same family. The copy starts hidden; edit it, then switch **Visible on website** on.
- To take a product off the site temporarily, switch **Visible on website** off. **Delete permanently** removes it and its price history (a copy stays in the audit log).
- If two people edit the same product at once, the second save is stopped. Reload and re-apply your change.

## Brands & categories
- **Add brand:** name, slug (short web name, e.g. `waaree`), description, manufacturer website and logo.
- **Add category:** name, slug (page address `/category/<slug>`), description and sort order (lower numbers appear first).
- Hiding a brand or category hides all of its products. You can only delete one that has no products.

## Prices
1. Go to **Prices**, find the product, and click **Edit**.
2. Enter the **selling price** (e.g. `16500` or `16,500.50`; empty = â€œPrice on requestâ€), plus optional **MRP**, **GST rate**, **GST included**, **unit** and a **reason**.
3. Click **Save price**. The website updates on the next page load, and every change is kept in **price history**.

When a customer sends an enquiry, the site re-checks your latest price first. If it changed since they added the item, they see the old and new prices before sending.

## Field photos
Photos for the **In the field** page and the home-page filmstrip.
- Pick a **tag** (Rooftop, Inverters, Mountingâ€¦), then **Upload photos** (several at once is fine).
- Edit each **caption** and click **Save**. Use **Portrait** for tall photos, **Visible** to hide or show, and the arrows to reorder.
- Use only your own photos or properly licensed stock, and keep captions factual.

## Settings
Contact person, phone, WhatsApp number (where enquiries are sent), email, address, business hours, Instagram, Facebook, YouTube and LinkedIn links, and an **announcement bar** at the top of every page. Empty fields fall back to the built-in defaults.

## Enquiries
Every enquiry sent from the basket is saved with a reference number (e.g. `VS-261113-K7QPM`), which also appears in the customerâ€™s WhatsApp message.
- Filter by status, or search by reference, name or mobile.
- Open an enquiry to see the items, call or WhatsApp the customer, see its **stage** and the **next step**, set a **follow-up date** and keep **internal notes**. Customers never see the notes.
- Owner and admins can credit **reward points** to registered customers right there.

### Logging enquiries from calls, WhatsApp and visits
- Tap **Log enquiry** (on a phone it is the green button at the top of the Dashboard). Choose how you reached the customer (phone call, WhatsApp or visit), enter their name, mobile and location, what they need, optionally pick products and quantities, whether you have spoken to them yet (*Contacted*) or not (*Not reached yet*), and optionally the next follow-up date.
- It is saved under **your** staff account in the same Enquiries list (marked *Phone*, *WhatsApp* or *Visit* with your name), so it can be followed up and turned into a quotation like any other enquiry. Every staff role can log enquiries.
- Each enquiry is labelled **From website** (the customer came to us through the site) or **Staff · Phone · name** (we reached out). Filter with **From customers (website)** or **Staff outreach**.

### Who is responsible, and moving an enquiry along
- Every enquiry has a **responsible staff member**. Enquiries a staff member logs are theirs. Website enquiries start **Unassigned**: owner/admin assign them (the *Responsible* box in the enquiry), or any staff member taps **Take this enquiry**.
- Staff sign in with their own mobile and password. Sales staff see **only their own** enquiries plus unassigned ones they can take, and update only their own; owner and admins see and update all. Use the **Mine / Unassigned** chips.
- **Stages (one simple path):** **New → Contacted → Quoted → Won**, or **Not won**. Customers see *Received → Contacted → Quoted → Order confirmed* (or *Closed*).
  | Stage | What it means | How it gets there |
  |---|---|---|
  | New | Nobody has spoken to the customer yet | Website enquiry, or logged as *Not reached yet* |
  | Contacted | You have spoken to the customer | **Mark as contacted** |
  | Quoted | A quotation was made | Automatic when you **Create quotation** from the enquiry |
  | Won | The customer is buying | Automatic when its quotation is marked **Accepted** (the quotation total is the sale). Only enquiries without a quotation use **Won without a quotation** and ask for the sale amount |
  | Not won | Closed without a sale | **Not won** asks why: price too high, bought elsewhere, postponed, not available, delivery time, no response, budget, order cancelled by customer, duplicate / wrong entry, or Other with a note |
- Each open enquiry shows a **step bar**, a one-line hint and **one main button** for the next step, so nobody has to guess.
- **Follow-up date:** set it when you update an enquiry (*Tomorrow*, *In 3 days*, *Next week* or any date). It shows on the enquiry (red when overdue) and in **My day** on the Dashboard. Closing an enquiry clears it.
- **Closed is closed:** only the owner or an admin can **Reopen** a Won or Not won enquiry. Reopening a won sale removes its staff bonus and customer points.
- When a staff member is **deactivated**, their open enquiries become *Unassigned* (noted in History) so others can take them. Their bonuses and quotations stay as they are.
- **Reassign several at once** (owner and admins): **Enquiries → Reassign several**, tick the enquiries (or *Select open ones on this page*), choose the person or *Unassigned*, then **Move**. Use it for leave, a resignation or to share out work. Only open enquiries move; Won and Not won stay with whoever closed them. Their open quotations move too, and each move is noted in History.
- **WhatsApp messages:** the **WhatsApp** button on an enquiry offers ready messages for its stage (first contact, follow-up, quotation reminder, thank you, review request), already filled with the customer's name, reference, quotation and amount. WhatsApp opens with the text ready to edit and send. A sent quotation has **Remind on WhatsApp**. Owner and admins change the wording and add the Google review link under **Settings → WhatsApp messages**.
- The Enquiries list shows the latest 300 and Quotations the latest 200; search finds older ones.
- *Duplicate / wrong entry* does not count for or against anyone in Performance.
- Every change is kept under **History** in the enquiry (who, what, when, why).

### Staff performance (owner and admins)
**Performance** shows, per staff member and by day, month or year (India time): enquiries, how many were contacted, reached a quotation, were won (with **sales value**) or not won, the win rate, **overdue follow-ups** (right now), and the average days to the first quotation and to closing. It also lists **why enquiries were not won**. Duplicates and wrong entries are left out. Filter by staff member, dates and source (website or staff outreach); **Show as a table** gives exact numbers.

## Quotations
Every staff member can prepare quotations under **Quotations**; each quotation belongs to the person who made it. Sales staff see and change only their own; owner and admins see all (filter **Mine / Everyone**) and only they can delete a quotation. On an enquiry, **Create quotation** fills in the customer details and products and links the two.
- **Quotation without an enquiry** (you met or called the customer yourself): **New quotation** asks *How did you reach them?* and needs the customer's **mobile number**. An enquiry is created automatically under your name at *Quoted*, so the sale, your bonus and the customer's points are recorded when the quotation is accepted, and it counts in Performance.
- Deleting a quotation that is the only one on its enquiry moves the enquiry back to *Contacted*. Accepted quotations cannot be deleted (set the status back first).
- Accepting is refused if the enquiry is already *Won* (by another quotation or a recorded sale) or closed as *Not won* (reopen it first). If two people press Accept at the same moment, only one is recorded.
1. **New quotation**: enter the customer name. Mobile number, email, company and address are optional.
2. **Add products**: search the catalogue. Unit prices come from the catalogue and cannot be changed here; change them under Prices. Only products without a listed price, and **Custom lines**, take a typed price.
3. **Add a discount** to any line if needed: **%** or **â‚¹ off**. Totals update as you type.
4. **Preview PDF** saves the quotation and shows the PDF. From the preview you can:
   - **Download PDF**, to send it yourself (email, your own WhatsApp, print);
   - **Share PDF** (phones), which attaches the file to WhatsApp, Gmail or any app;
   - **WhatsApp to customer**, which opens a chat with the customer and a ready message containing a private link to the PDF. The quotation is then marked as **Sent**.
5. **Status:** **Draft → Sent → Accepted** or **Declined**, set from the dropdown at the top right; a line under the title says what the status means and what to do next.
   - **Accepted** records the sale: the linked enquiry becomes *Won* with the quotation total. Accepted quotations are locked; only the owner or an admin can set one back, which also undoes the sale, its staff bonus and customer points.
   - **Declined** offers two next steps: **Revise and send again** (back to Draft) or **Close the enquiry as Not won**.
   - A Draft or Sent quotation past its validity date shows **Expired**: change *Valid for* and send it again.

Prices are copied onto the quotation when it is saved. Later catalogue price changes do not alter an existing quotation.

**PDF details** (owner and admin roles): GSTIN, default validity, signatory name, terms, bank details and the **GPay / UPI QR code** with UPI ID. To add or change the QR code: **Quotations → PDF details → Upload / Replace QR code**. In GPay, tap your profile photo, then your QR code, then Share / Download, and upload that image. The QR is printed in a Payment box under the total. These are printed on every PDF but are not shown on the public website.

## Staff bonus (owner and admins)
A staff member earns a **% of each sale** they win (the enquiry they are responsible for is marked *won* with the sale amount, or its quotation is accepted).
- **Rates:** Admin → **Bonus** → *Default bonus for everyone* (e.g. 2%); tap a staff member's rate to give them their own %, or *Use default*. The rate is locked into each bonus when the sale is won, so changing it never alters bonuses already earned.
- A bonus is created as **Pending** automatically. If the sale is undone or its amount corrected, a **reversing entry** is added automatically (nothing is deleted).
- **Approve** pending bonuses (tick them, *Approve*), and add **adjustments** (extra or deduction, with a reason the staff member sees).
- **Pay bonus** (e.g. with the salary): choose the date range and which bonuses, the payment date and method (with salary, bank transfer, UPI, cash, cheque) and a reference, then confirm the exact total. Those bonuses become **Paid** and the person's unpaid balance resets to ₹0. A bonus can belong to only one payment: paying twice, or two people paying at the same time, is refused. A payment recorded by mistake can be **cancelled** with a reason; its bonuses become unpaid again.
- Staff see only their own bonuses and payments under **My bonus**.

## Customers & reward points
Customers create their own accounts (mobile number + password) under the person icon â†’ **Create an account**. They see their enquiry history, status and points under **My account**. Customer accounts are completely separate from admin access.
- **Reward points:** open a customer â†’ enter `+500` (credit) or `-200` (redeem) with a reason. The customer sees the reason in their history. The balance canâ€™t go below zero.
- **Loyalty points on sales:** when an enquiry is marked **Won** with a sale amount, the customer automatically earns the loyalty percentage of the sale as points (starts at **0.5 %**; 1 point = ₹1, rounded down). Example: ₹2,00,000 sale → 1,000 points. The enquiry must belong to the customer's account, or have the same mobile number as an account. If the sale amount is corrected the points are corrected; if the sale is undone (Not won, reopened, or its quotation acceptance undone) they are taken back. Accepting a quotation that is linked to an enquiry counts as the sale too.
- **Buyers without an account:** their points are kept **waiting** against their mobile number. The won enquiry shows *"N points waiting"* with an **Invite to register** WhatsApp button, and **Customers → Points waiting to be claimed** lists everyone waiting. When the buyer registers (or signs in) with that number, the points move into their account automatically. Waiting points do not expire. Corrections and cancellations adjust waiting points the same way.
- Points are given to whoever registers with that mobile number. Before redeeming points, check that the request comes from the customer's own number (for example on WhatsApp).
- If a sale is cancelled after the customer already used its points, taking the points back can leave a negative balance; it is cleared by their next purchase.
- **Points for a sale by hand** (e.g. a shop counter sale): open the customer → **For a sale** → enter the sale amount and a reason. The form shows how many points that gives before you apply it.
- **Change the loyalty %** (owner and admins): **Customers** → **Change** next to "Loyalty points". The new % applies to sales from then on; points already given stay as they are. Every change is recorded.
- **Forgotten password:** open the customer â†’ **Create reset link** â†’ **Send on WhatsApp**. The link works once, within 48 hours.
- **Disable account:** switch **Account enabled** off. They are signed out everywhere immediately.

## Admin users (owner only)
Add a personâ€™s mobile number, password, email and role, and share the password with them privately. To reset someoneâ€™s password, edit them and type a new one. Switching a user to inactive, or changing their password, signs them out everywhere immediately. You canâ€™t remove your own owner access, and there is always at least one owner.

## Signing out
Click **Sign out** in the admin bar. On shared computers, always sign out.
