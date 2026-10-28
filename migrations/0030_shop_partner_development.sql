-- Tipo di store letto da Shopify (`Shop.plan.partnerDevelopment`) durante la
-- riconciliazione: il primo paint della Home lo usa per decidere il check-in senza
-- attendere la conferma (D-199). NULL finché la prima riconciliazione non lo scrive.
ALTER TABLE shops ADD COLUMN partner_development INTEGER
  CHECK (partner_development IS NULL OR partner_development IN (0, 1));
