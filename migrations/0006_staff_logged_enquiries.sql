-- Enquiries that staff log themselves (phone calls, WhatsApp chats, visits), kept in the same
-- Enquiries table as website enquiries so they share statuses, notes and quotations.
-- Additive only: two new columns with safe defaults (existing rows become 'website', no staff).
ALTER TABLE Enquiries ADD COLUMN Source TEXT NOT NULL DEFAULT 'website' CHECK (Source IN ('website', 'phone', 'whatsapp', 'visit'));
ALTER TABLE Enquiries ADD COLUMN CreatedByAdminId INTEGER REFERENCES AdminUsers(AdminId) ON DELETE SET NULL;

-- Performance reports group by staff member and day/month/year.
CREATE INDEX IX_Enquiries_CreatedBy ON Enquiries(CreatedByAdminId, CreatedAt);
CREATE INDEX IX_Enquiries_Source ON Enquiries(Source, CreatedAt);
