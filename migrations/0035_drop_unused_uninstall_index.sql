-- Nessuna query filtra o ordina lo storico delle disinstallazioni per data: l'indice costa solo
-- scritture. La colonna resta, scritta a ogni disinstallazione.
DROP INDEX uninstall_history_uninstalled_on_idx;
