/** Téléchargement texte CSV/JSON depuis le renderer avec BOM UTF-8 pour compatibilité Excel. */
export function downloadTextFile(payload: {
  content: string;
  filenameSuggested: string;
  mimeType?: string;
  useBom?: boolean;
}): void {
  const raw = `${payload.useBom !== false ? "\uFEFF" : ""}${payload.content}`;
  const blob = new Blob([raw], { type: payload.mimeType ?? "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filenameSuggested;
  anchor.click();
  URL.revokeObjectURL(url);
}
