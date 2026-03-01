export type AppMode = "local" | "hosted";

export function getAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_APP_MODE === "hosted" ? "hosted" : "local";
}

export function isHostedMode() {
  return getAppMode() === "hosted";
}
