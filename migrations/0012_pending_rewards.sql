-- Loyalty points for customers who have no account yet: held against their mobile number and moved into
-- their account when they register (or sign in) with that number. Append-only like RewardTransactions:
-- a corrected or undone sale gets a reversing row; claiming only stamps ClaimedAt / ClaimedByCustomerId.
CREATE TABLE PendingRewards (
  PendingId           INTEGER PRIMARY KEY AUTOINCREMENT,
  Mobile              TEXT    NOT NULL,                     -- normalised, e.g. 919876543210
  ContactName         TEXT,
  Points              INTEGER NOT NULL CHECK (Points <> 0 AND Points BETWEEN -10000000 AND 10000000),
  Reason              TEXT    NOT NULL,
  EnquiryId           INTEGER REFERENCES Enquiries(EnquiryId) ON DELETE SET NULL,
  Kind                TEXT    NOT NULL CHECK (Kind IN ('sale', 'reversal')),
  SalePaise           INTEGER,
  RateBasisPoints     INTEGER,
  ReversesId          INTEGER REFERENCES PendingRewards(PendingId),
  CreatedBy           TEXT    NOT NULL,
  CreatedAt           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ClaimedByCustomerId INTEGER REFERENCES Customers(CustomerId) ON DELETE SET NULL,
  ClaimedAt           TEXT
);
CREATE INDEX IX_PendingRewards_Mobile ON PendingRewards(Mobile, ClaimedAt);
CREATE INDEX IX_PendingRewards_Enquiry ON PendingRewards(EnquiryId, Kind);
