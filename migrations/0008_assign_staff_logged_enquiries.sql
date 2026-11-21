-- Enquiries logged by staff before the pipeline existed: make the staff member who logged them the
-- responsible person (from now on "responsible" is AssignedAdminId only, so an enquiry can be unassigned).
-- Fills an empty column only; nothing is overwritten or removed.
UPDATE Enquiries SET AssignedAdminId = CreatedByAdminId WHERE AssignedAdminId IS NULL AND CreatedByAdminId IS NOT NULL;
