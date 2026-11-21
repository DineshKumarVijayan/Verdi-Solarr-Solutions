-- Sales pipeline for enquiries: a responsible staff member, a stage history (who moved it, when, why),
-- the reason when an enquiry is lost or cancelled, the final sale value, and quotations linked to the
-- enquiry they answer. Additive only: new nullable columns, a new table and indexes.

-- Staff member responsible for following the enquiry up (website enquiries are assigned or picked up;
-- for staff-logged enquiries the creator is responsible until reassigned).
ALTER TABLE Enquiries ADD COLUMN AssignedAdminId INTEGER REFERENCES AdminUsers(AdminId) ON DELETE SET NULL;
-- Why it was lost / cancelled (fixed list + 'other' with a note), and when it was closed.
ALTER TABLE Enquiries ADD COLUMN ClosedReason TEXT CHECK (ClosedReason IS NULL OR ClosedReason IN ('price', 'bought_elsewhere', 'postponed', 'unavailable', 'delivery_time', 'no_response', 'budget', 'other'));
ALTER TABLE Enquiries ADD COLUMN ClosedNote TEXT;
ALTER TABLE Enquiries ADD COLUMN ClosedAt TEXT;
-- Final sale value (integer paise) when the enquiry is won.
ALTER TABLE Enquiries ADD COLUMN SalePaise INTEGER CHECK (SalePaise IS NULL OR SalePaise >= 0);

CREATE INDEX IX_Enquiries_Assigned ON Enquiries(AssignedAdminId, CreatedAt);

-- Every stage change and (re)assignment, append-only. Powers the performance report.
CREATE TABLE EnquiryEvents (
  EventId        INTEGER PRIMARY KEY AUTOINCREMENT,
  EnquiryId      INTEGER NOT NULL REFERENCES Enquiries(EnquiryId) ON DELETE CASCADE,
  Kind           TEXT    NOT NULL CHECK (Kind IN ('created', 'status', 'assigned')),
  FromStatus     TEXT,
  ToStatus       TEXT,
  AssignedTo     INTEGER REFERENCES AdminUsers(AdminId) ON DELETE SET NULL,
  Reason         TEXT,
  Note           TEXT,
  SalePaise      INTEGER CHECK (SalePaise IS NULL OR SalePaise >= 0),
  ByAdminId      INTEGER REFERENCES AdminUsers(AdminId) ON DELETE SET NULL,
  ByIdentity     TEXT,
  CreatedAt      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IX_EnquiryEvents_Enquiry ON EnquiryEvents(EnquiryId, CreatedAt);
CREATE INDEX IX_EnquiryEvents_By ON EnquiryEvents(ByAdminId, CreatedAt);

-- A quotation made from an enquiry is linked to it (enquiry -> quotation -> sale conversion).
ALTER TABLE Quotations ADD COLUMN EnquiryId INTEGER REFERENCES Enquiries(EnquiryId) ON DELETE SET NULL;
CREATE INDEX IX_Quotations_Enquiry ON Quotations(EnquiryId);
