import { isTauri } from "./tauri";

/** Open an http(s) link in the system browser (Tauri opener plugin) or a new tab. */
export async function openLink(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (err) { console.warn("[levels] opener failed", err); }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
