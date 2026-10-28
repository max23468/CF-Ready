-- Area della pagina che ha prodotto lo spostamento più ampio della visita, solo per i
-- campioni CLS (D-199). NULL per le altre metriche e dove il browser non espone
-- `layout-shift`.
ALTER TABLE performance_samples ADD COLUMN layout_shift_source TEXT
  CHECK (
    layout_shift_source IS NULL OR layout_shift_source IN (
      'notice', 'checkin', 'setup', 'validation', 'trial', 'plans', 'aside', 'support', 'page'
    )
  );
