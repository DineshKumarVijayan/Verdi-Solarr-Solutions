-- Indexes for the "has this entry been reversed?" checks used whenever a sale changes
-- (bonus, loyalty points in accounts and points waiting). Additive only.
CREATE INDEX IF NOT EXISTS IX_BonusEntries_Reverses ON BonusEntries(ReversesEntryId) WHERE ReversesEntryId IS NOT NULL;
CREATE INDEX IF NOT EXISTS IX_Rewards_Reverses ON RewardTransactions(ReversesId) WHERE ReversesId IS NOT NULL;
CREATE INDEX IF NOT EXISTS IX_PendingRewards_Reverses ON PendingRewards(ReversesId) WHERE ReversesId IS NOT NULL;
-- "My day": what each person did today
CREATE INDEX IF NOT EXISTS IX_Quotations_OwnerStatus ON Quotations(OwnerAdminId, Status);
