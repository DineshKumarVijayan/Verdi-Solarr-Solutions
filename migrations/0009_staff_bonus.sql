-- Staff bonus: a % of each sale they win. Rates keep their history; bonus entries are append-only
-- (a sale that is undone or corrected gets a reversing entry, never an edit); payouts settle a staff
-- member's unpaid bonuses in one go so the same bonus can never be paid twice. Money in integer paise.

-- Bonus rate in basis points (200 = 2.00%). AdminId NULL = the default rate for everyone;
-- a row for a staff member overrides it (RateBasisPoints NULL = back to the default). Latest row wins.
CREATE TABLE BonusRates (
  RateId          INTEGER PRIMARY KEY AUTOINCREMENT,
  AdminId         INTEGER REFERENCES AdminUsers(AdminId) ON DELETE CASCADE,
  RateBasisPoints INTEGER CHECK (RateBasisPoints IS NULL OR RateBasisPoints BETWEEN 0 AND 10000),
  SetBy           TEXT    NOT NULL,
  CreatedAt       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IX_BonusRates_Admin ON BonusRates(AdminId, RateId);

-- One payment to a staff member (e.g. with the salary). Token lets the request find its own row.
CREATE TABLE BonusPayouts (
  PayoutId     INTEGER PRIMARY KEY AUTOINCREMENT,
  Token        TEXT    NOT NULL UNIQUE,
  AdminId      INTEGER NOT NULL REFERENCES AdminUsers(AdminId),
  AmountPaise  INTEGER NOT NULL DEFAULT 0,
  EntryCount   INTEGER NOT NULL DEFAULT 0,
  PaidOn       TEXT    NOT NULL,
  Method       TEXT,
  Reference    TEXT,
  Note         TEXT,
  Status       TEXT    NOT NULL DEFAULT 'paid' CHECK (Status IN ('paid', 'cancelled')),
  CancelReason TEXT,
  CancelledBy  TEXT,
  CancelledAt  TEXT,
  PaidBy       TEXT    NOT NULL,
  CreatedAt    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IX_BonusPayouts_Admin ON BonusPayouts(AdminId, CreatedAt);

-- Bonus earned (sale), taken back (reversal, negative) or added/deducted by hand (adjustment).
-- Paid = linked to a payout; an entry can belong to one payout only.
CREATE TABLE BonusEntries (
  EntryId         INTEGER PRIMARY KEY AUTOINCREMENT,
  AdminId         INTEGER NOT NULL REFERENCES AdminUsers(AdminId),
  EnquiryId       INTEGER REFERENCES Enquiries(EnquiryId) ON DELETE SET NULL,
  Kind            TEXT    NOT NULL CHECK (Kind IN ('sale', 'reversal', 'adjustment')),
  SalePaise       INTEGER,
  RateBasisPoints INTEGER,
  AmountPaise     INTEGER NOT NULL,
  Reason          TEXT,
  ReversesEntryId INTEGER REFERENCES BonusEntries(EntryId),
  Status          TEXT    NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending', 'approved', 'paid')),
  ApprovedBy      TEXT,
  ApprovedAt      TEXT,
  PayoutId        INTEGER REFERENCES BonusPayouts(PayoutId),
  CreatedBy       TEXT    NOT NULL,
  CreatedAt       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IX_BonusEntries_Admin ON BonusEntries(AdminId, Status, CreatedAt);
CREATE INDEX IX_BonusEntries_Enquiry ON BonusEntries(EnquiryId);
CREATE INDEX IX_BonusEntries_Payout ON BonusEntries(PayoutId);
