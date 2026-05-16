/** Téléchargement binaire depuis payload IPC `{ base64 }` pour PDF/XLSX. */
export function downloadBase64Blob(
  payload: { base64: string; filenameSuggested?: string },
  mimeType: string,
  fallbackName: string,
): void {
  const raw = Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0));
  const blob = new Blob([raw], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filenameSuggested ?? fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
}
