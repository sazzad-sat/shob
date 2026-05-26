import { app, nativeImage, type BrowserWindow } from "electron";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const WINDOWS_APP_ID = app.isPackaged ? "app.shob.desktop" : "app.shob.desktop.dev";

export function resolveAppIconPath(platform: NodeJS.Platform = process.platform) {
  const preferredExt =
    platform === "win32" ? ".ico" :
    platform === "darwin" ? ".icns" :
    ".png";
  const fallbackExts = [preferredExt, ".png", ".ico", ".icns"];
  const bases = [
    path.join(__dirname, "..", "electron", "icons"),
    path.join(process.resourcesPath, "electron", "icons"),
  ];
  const candidates: string[] = [];
  for (const base of bases) {
    for (const ext of fallbackExts) candidates.push(path.join(base, `icon${ext}`));
  }
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function applyWindowsAppIdentity() {
  if (process.platform !== "win32") return;
  app.setAppUserModelId(WINDOWS_APP_ID);
}

export function applyMacDockIcon() {
  if (process.platform !== "darwin") return;
  if (!app.dock) return;
  const appIconPath = resolveAppIconPath("darwin");
  if (!appIconPath) return;
  app.dock.setIcon(nativeImage.createFromPath(appIconPath));
}

export function applyWindowIcon(mainWindow: BrowserWindow) {
  const appIconPath = resolveAppIconPath();
  const winTaskbarIconPath = resolveAppIconPath("win32");

  if ((process.platform === "win32" || process.platform === "linux") && appIconPath) {
    mainWindow.setIcon(appIconPath);
  }
  if (process.platform === "win32") {
    mainWindow.setAppDetails({
      appId: WINDOWS_APP_ID,
      ...(winTaskbarIconPath ? { appIconPath: winTaskbarIconPath, appIconIndex: 0 } : {}),
      relaunchDisplayName: "shob",
    });
  }
}
