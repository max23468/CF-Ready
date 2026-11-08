export function setSaveBarVisibility(id: string, visible: boolean) {
  if (typeof shopify === "undefined") return;
  void (visible ? shopify.saveBar.show(id) : shopify.saveBar.hide(id));
}

export function showToast(message: string) {
  if (typeof shopify === "undefined") return;
  shopify.toast.show(message);
}
