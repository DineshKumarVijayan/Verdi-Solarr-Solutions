-- Simpler sales pipeline: New -> Contacted -> Quoted -> Won | Not won. Additive only.

-- "Not won" reason. Replaces ClosedReason, whose fixed CHECK list cannot be extended in SQLite
-- without rebuilding the table; the list is now validated by the Worker. Existing reasons are copied.
ALTER TABLE Enquiries ADD COLUMN NotWonReason TEXT;
UPDATE Enquiries SET NotWonReason = ClosedReason WHERE ClosedReason IS NOT NULL AND NotWonReason IS NULL;

-- "Lost" and "Cancelled" become one stage, Not won (stored as 'lost'); the reason says why.
UPDATE Enquiries SET Status = 'lost' WHERE Status = 'cancelled';

-- Next follow-up date (YYYY-MM-DD, India time) set by the responsible staff member.
ALTER TABLE Enquiries ADD COLUMN FollowUpOn TEXT CHECK (FollowUpOn IS NULL OR FollowUpOn GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
CREATE INDEX IX_Enquiries_FollowUp ON Enquiries(AssignedAdminId, FollowUpOn);

-- Each quotation belongs to a staff member (the creator; existing ones matched by e-mail).
ALTER TABLE Quotations ADD COLUMN OwnerAdminId INTEGER REFERENCES AdminUsers(AdminId) ON DELETE SET NULL;
UPDATE Quotations SET OwnerAdminId = (SELECT a.AdminId FROM AdminUsers a WHERE a.Email = Quotations.CreatedBy COLLATE NOCASE) WHERE OwnerAdminId IS NULL;
CREATE INDEX IX_Quotations_Owner ON Quotations(OwnerAdminId, CreatedAt);
