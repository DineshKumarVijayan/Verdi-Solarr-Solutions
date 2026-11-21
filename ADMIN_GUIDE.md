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
| Admin | Products, brands, categories, prices, photos, settings, enquiries and customers |
| Price editor | Change prices only; view everything else |
| Viewer | Look only |

### Adding staff (owner)
**Staff â†’ Add**: enter the mobile number (used to sign in), name, role and a temporary password. Email is optional. Share the temporary password privately. The list shows *Temporary password Â· must set their own* until the person has done so. To remove someone's access, edit the account and switch it to inactive. This signs them out immediately.

## Dashboard
Shows new enquiries, customer accounts, products, missing prices, images and datasheets, and recent activity. Each tile is a shortcut.

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
- Open an enquiry to see the items, call or WhatsApp the customer, set the **status** (Received â†’ Contacted â†’ Quoted â†’ Order confirmed / Closed / Cancelled) and keep **internal notes**. Customers never see the notes.
- For registered customers you can credit **reward points** right there.

### Logging enquiries from calls, WhatsApp and visits
- Tap **Log enquiry** (on a phone it is the green button at the top of the Dashboard). Choose how you reached the customer (phone call, WhatsApp or visit), enter their name, mobile and location, what they need, optionally pick products and quantities, and the status after the call.
- It is saved under **your** staff account in the same Enquiries list (marked *Phone*, *WhatsApp* or *Visit* with your name), so it can be followed up and turned into a quotation like any other enquiry. Every staff role can log enquiries.
- Each enquiry is labelled **From website** (the customer came to us through the site) or **Staff · Phone · name** (we reached out). Filter with **From customers (website)** or **Staff outreach**.

### Who is responsible, and moving an enquiry along
- Every enquiry has a **responsible staff member**. Enquiries a staff member logs are theirs. Website enquiries start **Unassigned**: owner/admin assign them (the *Responsible* box in the enquiry), or any staff member taps **Take this enquiry**.
- Staff sign in with their own mobile and password and can update **only their own** enquiries; owner and admins can update any. Use the **Mine / Unassigned** chips to find yours.
- Stages: **Received → Contacted → Quoted → Order confirmed (won)**, or **Lost / Cancelled**. Marking **Lost** or **Cancelled** asks *why* (price too high, bought elsewhere, postponed, product not available, delivery time, no response, budget, or Other with a note). Marking **won** asks for the **final sale amount** (pre-filled from the quotation).
- **Create quotation** from an enquiry links the two: the enquiry moves to *Quoted*, and when the quotation is marked **Accepted** the enquiry becomes *won* with the quotation total as the sale value.
- Every change is kept under **History** in the enquiry (who, what, when, why).

### Staff performance (owner and admins)
**Performance** shows, per staff member and by day, month or year (India time): enquiries, how many were contacted, reached a quotation, were won (with **sales value**), lost or cancelled, the win rate, and the average days to the first quotation and to closing. It also lists **why enquiries were lost or cancelled**. Filter by staff member, dates and source (website or staff outreach); **Show as a table** gives exact numbers.

## Quotations
Any admin (every role) can prepare quotations under **Quotations**. On an enquiry you can also click **Create quotation**, which fills in the customer details and products.
1. **New quotation**: enter the customer name. Mobile number, email, company and address are optional.
2. **Add products**: search the catalogue. Unit prices come from the catalogue and cannot be changed here; change them under Prices. Only products without a listed price, and **Custom lines**, take a typed price.
3. **Add a discount** to any line if needed: **%** or **â‚¹ off**. Totals update as you type.
4. **Preview PDF** saves the quotation and shows the PDF. From the preview you can:
   - **Download PDF**, to send it yourself (email, your own WhatsApp, print);
   - **Share PDF** (phones), which attaches the file to WhatsApp, Gmail or any app;
   - **WhatsApp to customer**, which opens a chat with the customer and a ready message containing a private link to the PDF. The quotation is then marked as **Sent**.
5. Set the status (Draft, Sent, Accepted, Declined) from the dropdown at the top right of the quotation.

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
- **Forgotten password:** open the customer â†’ **Create reset link** â†’ **Send on WhatsApp**. The link works once, within 48 hours.
- **Disable account:** switch **Account enabled** off. They are signed out everywhere immediately.

## Admin users (owner only)
Add a personâ€™s mobile number, password, email and role, and share the password with them privately. To reset someoneâ€™s password, edit them and type a new one. Switching a user to inactive, or changing their password, signs them out everywhere immediately. You canâ€™t remove your own owner access, and there is always at least one owner.

## Signing out
Click **Sign out** in the admin bar. On shared computers, always sign out.
