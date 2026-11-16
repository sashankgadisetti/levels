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
export type InstallState = { phase: "idle" | "downloading" | "installing" | "failed"; percent?: number; message?: string };
let installState: InstallState = { phase: "idle" };
const listeners = new Set<(s: InstallState) => void>();
/** Subscribe to install progress (Settings row). Returns an unsubscribe. */
export function onInstallState(fn: (s: InstallState) => void): () => void { listeners.add(fn); fn(installState); return () => { listeners.delete(fn); }; }
function setInstallState(s: InstallState): void { installState = s; listeners.forEach((fn) => fn(s)); }
export const pendingUpdateVersion = (): string | undefined => pending?.version;

function progressWindow(version: string, text: string, failed = false): void {
  routeEffects([{ kind: "popup", spec: {
    id: "update-progress", variant: failed ? "warning" : "info", glyph: failed ? "alert" : "diamond",
    title: failed ? "UPDATE FAILED" : "UPDATING",
    blocks: [{ type: "text", text: `Levels v${version}: ${text}`.slice(0, 400), tone: failed ? "red" : "cyan" }],
    actions: failed ? [{ label: "RETRY", kind: "accept", arg: UPDATE_INSTALL_ARG, primary: true }, { label: "CLOSE", kind: "dismiss" }] : [],
    sound: "none", timeoutMs: failed ? 0 : 0,
  } }]);
}

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
    if (!update) { console.info("[updater] no update to install"); setInstallState({ phase: "failed", message: "No update found." }); return; }
    let total = 0;
    let done = 0;
    let lastShown = -1;
    setInstallState({ phase: "downloading", percent: 0 });
    progressWindow(update.version, "downloading…");
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") { total = e.data.contentLength ?? 0; console.info(`[updater] downloading v${update.version} (${total || "?"} bytes)`); }
      else if (e.event === "Progress") {
        done += e.data.chunkLength;
        const pct = total ? Math.round((done / total) * 100) : 0;
        setInstallState({ phase: "downloading", percent: pct });
        if (pct >= lastShown + 10) { lastShown = pct; progressWindow(update.version, `downloading… ${pct}%`); }
      } else if (e.event === "Finished") { console.info("[updater] download finished, installing"); setInstallState({ phase: "installing" }); progressWindow(update.version, "installing… the app will relaunch."); }
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[updater] install failed", err);
    setInstallState({ phase: "failed", message });
    progressWindow(pending?.version ?? "?", `install failed — ${message}. If Levels is running from the .dmg, move it to Applications first.`, true);
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
