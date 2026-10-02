-- Fuso IANA dello store, letto da Shopify durante la riconciliazione: serve a
-- mostrare gli orari nel fuso dello store anche dove il loader usa solo D1.
ALTER TABLE shops ADD COLUMN iana_timezone TEXT;
