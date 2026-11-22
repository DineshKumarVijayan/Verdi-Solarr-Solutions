-- Questions & answers written by the owner or an admin. Shown on the public /faq page and used by the
-- website helper (read-only). Answers are the business's own words; nothing is pre-filled.
CREATE TABLE Faqs (
  FaqId INTEGER PRIMARY KEY AUTOINCREMENT,
  Topic TEXT NOT NULL DEFAULT 'General',
  Question TEXT NOT NULL,
  Answer TEXT NOT NULL,
  QuestionTa TEXT,
  AnswerTa TEXT,
  Keywords TEXT,
  SortOrder INTEGER NOT NULL DEFAULT 0,
  IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
  CreatedAt TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL,
  UpdatedBy TEXT
);
CREATE INDEX IX_Faqs_Active ON Faqs(IsActive, SortOrder);
