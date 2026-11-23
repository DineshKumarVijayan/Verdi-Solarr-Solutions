-- One-time submission keys: a create request sent twice (a retry after a lost reply on a weak
-- connection) returns the first result instead of creating a second enquiry, quotation, bonus
-- adjustment or points entry. Rows are short-lived (kept about a day) and hold no personal data
-- beyond the saved reply.
CREATE TABLE IF NOT EXISTS IdempotencyKeys (
  KeyHash        TEXT    PRIMARY KEY,
  Status         TEXT    NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending', 'done')),
  ResponseStatus INTEGER,
  ResponseBody   TEXT,
  CreatedAt      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS IX_IdempotencyKeys_Created ON IdempotencyKeys(CreatedAt);
