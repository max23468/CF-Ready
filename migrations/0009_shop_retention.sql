CREATE INDEX shops_uninstalled_at_idx
  ON shops(uninstalled_at)
  WHERE installation_status = 'uninstalled';
