-- Colonne di stato UI previste da §12.2 e rimandate a M6, che è la milestone che le usa.
-- `address2_conflict_declared_at` registra la dichiarazione FR-058 del merchant: è una
-- dichiarazione, non un rilevamento, perché CF Ready non legge quell'impostazione (D-125).
ALTER TABLE app_state ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed'));
ALTER TABLE app_state ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_state ADD COLUMN setup_checklist_dismissed_at TEXT;
ALTER TABLE app_state ADD COLUMN address2_conflict_declared_at TEXT;
