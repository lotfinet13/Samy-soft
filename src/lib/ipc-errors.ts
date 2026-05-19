/** Human-readable IPC failure messages for renderer UI. */
export function formatIpcError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("could not be cloned")) {
      return "Erreur de communication (données non sérialisables côté serveur).";
    }
    return error.message;
  }
  return "Erreur de communication avec l'application.";
}
