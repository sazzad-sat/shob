import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const sourceIcon = path.join(rootDir, "src", "assets", "icon", "shob.png");
const iconDir = path.join(rootDir, "electron", "icons");
const iconPng = path.join(iconDir, "icon.png");
const iconIco = path.join(iconDir, "icon.ico");
const iconIcns = path.join(iconDir, "icon.icns");

async function ensureSourceIcon() {
  if (!fsSync.existsSync(sourceIcon)) {
    throw new Error(`Source icon not found: ${sourceIcon}`);
  }
}

async function syncPng() {
  await fs.mkdir(iconDir, { recursive: true });
  await fs.copyFile(sourceIcon, iconPng);
}

async function syncIco() {
  const ico = await pngToIco(sourceIcon);
  await fs.writeFile(iconIco, ico);
}

async function syncIcns() {
  if (process.platform !== "darwin") return;
  try {
    execFileSync("sips", ["-s", "format", "icns", sourceIcon, "--out", iconIcns], { stdio: "inherit" });
  } catch (error) {
    console.warn("[icons] failed to generate icon.icns with sips:", error instanceof Error ? error.message : error);
  }
}

async function main() {
  await ensureSourceIcon();
  await syncPng();
  await syncIco();
  await syncIcns();
  console.log("[icons] synced app icons from src/assets/icon/shob.png");
}

main().catch((error) => {
  console.error("[icons] sync failed:", error);
  process.exit(1);
});

