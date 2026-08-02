export function setSaveBarVisibility(id: string, visible: boolean) {
  if (typeof shopify === "undefined") return;
  void (visible ? shopify.saveBar.show(id) : shopify.saveBar.hide(id));
}
