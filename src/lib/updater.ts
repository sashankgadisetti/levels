/**
 * In-app auto-update (tauri-plugin-updater + tauri-plugin-process).
 * The app polls GitHub Releases' latest.json (endpoint + pubkey in tauri.conf.json → plugins.updater).
 * A found update is announced through the normal System pop-up path; its INSTALL & RELAUNCH button carries
 * arg "update:install", which src/store/actions.ts routes to installPendingUpdate().
 * Background checks never surface errors (e.g. 404 before the first signed release); only the Settings button reports them.
 */
import type { Update } from "@tauri-apps/plugin-updater";
import { routeEffects } from "../store/effects";
import { isTauri } from "./tauri";

export const UPDATE_INSTALL_ARG = "update:install";
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateCheckResult = { status: "up-to-date" | "available" | "error"; version?: string; message?: string };

let pending: Update | undefined;
let installing = false;
let installed = false;
const announced = new Set<string>();

async function fetchUpdate(): Promise<Update | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (update) pending = update;
  return update;
}

function announce(update: Update): void {
  if (announced.has(update.version)) return;
  announced.add(update.version);
  const notes = (update.body ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  routeEffects([{
    kind: "popup",
    spec: {
      id: `update-${update.version}`.slice(0, 64),
      variant: "info",
      glyph: "diamond",
      title: "UPDATE AVAILABLE",
      blocks: [{ type: "text", text: `Levels v${update.version} is ready.${notes ? ` ${notes}` : ""}` }],
      actions: [
        { label: "INSTALL & RELAUNCH", kind: "accept", arg: UPDATE_INSTALL_ARG, primary: true },
        { label: "LATER", kind: "dismiss" },
      ],
      sound: "ding",
      timeoutMs: 0,
    },
  }]);
}

async function backgroundCheck(): Promise<void> {
  try {
    const update = await fetchUpdate();
    if (update) announce(update);
  } catch (err) {
    console.debug("[updater] background check failed (ignored)", err);
  }
}

/** Main window only: check 15 s after launch, then every 6 h. No-op outside Tauri. */
export function installUpdater(): void {
  if (!isTauri() || installed) return;
  installed = true;
  setTimeout(() => { void backgroundCheck(); }, FIRST_CHECK_MS);
  setInterval(() => { void backgroundCheck(); }, CHECK_EVERY_MS);
}

/** For Settings → General → [CHECK FOR UPDATES]. Shows the pop-up too when an update exists. */
export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  if (!isTauri()) return { status: "error", message: "Updates are only available in the desktop app." };
  try {
    const update = await fetchUpdate();
    if (!update) return { status: "up-to-date" };
    announced.delete(update.version);
    announce(update);
    return { status: "available", version: update.version };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Download + install the update found by the last check, then relaunch. */
export async function installPendingUpdate(): Promise<void> {
  if (!isTauri() || installing) return;
  installing = true;
  try {
    const update = pending ?? (await fetchUpdate());
    if (!update) { console.info("[updater] no update to install"); return; }
    let total = 0;
    let done = 0;
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") { total = e.data.contentLength ?? 0; console.info(`[updater] downloading v${update.version} (${total || "?"} bytes)`); }
      else if (e.event === "Progress") { done += e.data.chunkLength; if (total) console.debug(`[updater] ${Math.round((done / total) * 100)}%`); }
      else if (e.event === "Finished") console.info("[updater] download finished, installing");
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    console.warn("[updater] install failed", err);
  } finally {
    installing = false;
  }
}

/** The running app's version ("" outside Tauri). */
export async function currentAppVersion(): Promise<string> {
  if (!isTauri()) return "";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}
