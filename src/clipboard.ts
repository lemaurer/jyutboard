/** Electron file:// pages use the OS clipboard; Safari uses its user-gesture API. */
export async function copyInvitation(text: string) {
  if (window.desktop?.copyText) {
    await window.desktop.copyText(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* older Safari fallback */
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  const previous = document.activeElement as HTMLElement | null;
  document.body.append(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  field.remove();
  previous?.focus({ preventScroll: true });
  if (!copied) throw Error("Select and copy the invitation above.");
}
