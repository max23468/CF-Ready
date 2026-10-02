export function setSaveBarVisibility(id: string, visible: boolean) {
  if (typeof shopify === "undefined") return;
  void (visible ? shopify.saveBar.show(id) : shopify.saveBar.hide(id));
}

// Esiti positivi: toast nativo di App Bridge, visibile in qualunque punto della pagina.
export function showToast(message: string) {
  if (typeof shopify === "undefined") return;
  shopify.toast.show(message);
}
