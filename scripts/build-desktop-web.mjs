import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const backupRoot = path.join(root, ".desktop-build-backup");
const apiBackupDir = path.join(backupRoot, "api");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [nextBin, "build"],
      {
        cwd: root,
        env: { ...process.env, TAURI_BUILD: "true" },
        stdio: "inherit",
      }
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`desktop web build failed with code ${code ?? -1}`));
    });

    child.on("error", reject);
  });
}

async function moveApiForDesktopBuild() {
  if (existsSync(backupRoot)) {
    throw new Error("api backup path already exists, stop to avoid覆盖");
  }

  if (!existsSync(apiDir)) {
    return false;
  }

  await mkdir(backupRoot, { recursive: true });
  await rename(apiDir, apiBackupDir);
  return true;
}

async function restoreApiAfterDesktopBuild(moved) {
  if (!moved) return;
  if (!existsSync(apiBackupDir)) return;
  await rename(apiBackupDir, apiDir);
  await rm(backupRoot, { recursive: true, force: true });
}

let moved = false;

try {
  moved = await moveApiForDesktopBuild();
  await runNextBuild();
} finally {
  await restoreApiAfterDesktopBuild(moved);
}
