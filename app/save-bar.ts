export function notifySaveBarFields(form: HTMLFormElement | null, namePrefix: string) {
  requestAnimationFrame(() => {
    form
      ?.querySelectorAll(`[name^="${namePrefix}"]`)
      .forEach((field) => field.dispatchEvent(new Event("input", { bubbles: true })));
  });
}
