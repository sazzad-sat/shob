import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const electronDir = path.join(rootDir, "node_modules", "electron");
const distDir = path.join(electronDir, "dist");
const pathFile = path.join(electronDir, "path.txt");

function getPlatformPath() {
  switch (os.platform()) {
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${os.platform()}`);
  }
}

function isElectronReady(platformPath = getPlatformPath()) {
  return fs.existsSync(pathFile) && fs.existsSync(path.join(distDir, platformPath));
}

function expandZipOnWindows(zipPath) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "& { param($zip, $dest) Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force }",
      zipPath,
      distDir,
    ],
    { stdio: "inherit" },
  );
}

export async function ensureElectronInstalled() {
  if (!fs.existsSync(electronDir)) {
    throw new Error('Missing Electron package. Run "bun i" first.');
  }

  const platformPath = getPlatformPath();
  if (isElectronReady(platformPath)) return;

  if (os.platform() !== "win32") {
    execFileSync(process.execPath, [path.join(electronDir, "install.js")], { cwd: rootDir, stdio: "inherit" });
    if (isElectronReady(platformPath)) return;
    throw new Error('Electron failed to install correctly. Delete node_modules/electron and run "bun i" again.');
  }

  const { downloadArtifact } = require("@electron/get");
  const { version } = require(path.join(electronDir, "package.json"));
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: "win32",
    arch: process.arch,
    checksums: require(path.join(electronDir, "checksums.json")),
  });

  expandZipOnWindows(zipPath);
  fs.writeFileSync(pathFile, platformPath);

  if (!isElectronReady(platformPath)) {
    throw new Error("Electron binary repair finished, but electron.exe is still missing.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureElectronInstalled().catch((error) => {
    console.error(`[electron] ${error.message}`);
    process.exit(1);
  });
}
