-- Customer loyalty points: a % of each sale (default 0.5 %), 1 point = Rs 1 of that %, rounded down.
-- The rate keeps its history (latest row wins). Owner and admins change it from Customers.
CREATE TABLE LoyaltyRates (
  RateId          INTEGER PRIMARY KEY AUTOINCREMENT,
  RateBasisPoints INTEGER NOT NULL CHECK (RateBasisPoints BETWEEN 0 AND 10000),
  SetBy           TEXT    NOT NULL,
  CreatedAt       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO LoyaltyRates (RateBasisPoints, SetBy) VALUES (50, 'initial setting (0.5 %)');

-- RewardTransactions stays append-only. Kind: 'manual' (typed by staff), 'sale' (earned on a sale),
-- 'reversal' (cancels an earlier sale credit when the sale is undone or corrected).
ALTER TABLE RewardTransactions ADD COLUMN Kind TEXT NOT NULL DEFAULT 'manual' CHECK (Kind IN ('manual', 'sale', 'reversal'));
ALTER TABLE RewardTransactions ADD COLUMN SalePaise INTEGER;
ALTER TABLE RewardTransactions ADD COLUMN RateBasisPoints INTEGER;
ALTER TABLE RewardTransactions ADD COLUMN ReversesId INTEGER REFERENCES RewardTransactions(TransactionId);
CREATE INDEX IX_Rewards_Enquiry ON RewardTransactions(EnquiryId, Kind);
