-- Attribuzione dell'interazione peggiore, solo per i campioni INP: sottotempi in millisecondi
-- interi e file dello script più lungo del long animation frame che la contiene, ridotto a
-- origine e percorso (niente query, frammento o testi). NULL sulle righe esistenti, per le altre
-- metriche e dove il browser non espone `event` o `long-animation-frame`.
ALTER TABLE performance_samples ADD COLUMN inp_input_delay_ms INTEGER
  CHECK (
    inp_input_delay_ms IS NULL
    OR (metric_name = 'INP' AND inp_input_delay_ms BETWEEN 0 AND 600000)
  );

ALTER TABLE performance_samples ADD COLUMN inp_processing_ms INTEGER
  CHECK (
    inp_processing_ms IS NULL
    OR (metric_name = 'INP' AND inp_processing_ms BETWEEN 0 AND 600000)
  );

ALTER TABLE performance_samples ADD COLUMN inp_presentation_delay_ms INTEGER
  CHECK (
    inp_presentation_delay_ms IS NULL
    OR (metric_name = 'INP' AND inp_presentation_delay_ms BETWEEN 0 AND 600000)
  );

ALTER TABLE performance_samples ADD COLUMN inp_script_source TEXT
  CHECK (
    inp_script_source IS NULL
    OR (
      metric_name = 'INP'
      AND length(inp_script_source) BETWEEN 8 AND 200
      AND (inp_script_source LIKE 'https://%' OR inp_script_source LIKE 'http://%')
      AND instr(inp_script_source, '?') = 0
      AND instr(inp_script_source, '#') = 0
    )
  );
