-- Availability and offers, set by the owner or an admin per product. Every product starts "In stock"
-- (the business's decision); "Limited stock" and "Out of stock" are set by hand. An offer is separate
-- (a product can be in stock AND on offer), with an optional short label such as "Festival offer".
ALTER TABLE Products ADD COLUMN StockStatus TEXT NOT NULL DEFAULT 'in_stock' CHECK (StockStatus IN ('in_stock', 'limited', 'out_of_stock'));
ALTER TABLE Products ADD COLUMN OnOffer INTEGER NOT NULL DEFAULT 0 CHECK (OnOffer IN (0, 1));
ALTER TABLE Products ADD COLUMN OfferLabel TEXT;
CREATE INDEX IX_Products_Offer ON Products(OnOffer, IsActive);
