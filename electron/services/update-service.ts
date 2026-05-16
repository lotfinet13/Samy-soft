/** Abstraction mise à jour (Phase 7) — téléchargements distants volontairement absents pour l'instant. */

export type ReleaseChannel = "stable" | "extended" | "dev";

export type UpdateCheckOutcome =
  | { status: "disabled" }
  | { status: "ready"; channel: ReleaseChannel }
  | { status: "error"; message: string };

export async function checkForUpdatesPlanned(params: {
  channel: ReleaseChannel;
}): Promise<UpdateCheckOutcome> {
  void params.channel;
  return { status: "disabled" };
}
