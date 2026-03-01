import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return readFileSync(filePath, "utf8").trim();
}

function parseRepoFromRemote() {
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    if (!remote) return "";
    if (remote.startsWith("git@github.com:")) {
      return remote.replace("git@github.com:", "").replace(/\.git$/, "");
    }
    if (remote.startsWith("https://github.com/")) {
      return remote.replace("https://github.com/", "").replace(/\.git$/, "");
    }
  } catch {
    return "";
  }
  return "";
}

const tauriConfig = readJson(resolve("src-tauri/tauri.conf.json"));
const version = String(tauriConfig.version || "").trim();
if (!version) {
  throw new Error("无法读取应用版本号");
}

const artifactPath = resolve(
  process.env.RELEASE_ARTIFACT || "src-tauri/target/release/bundle/macos/ClawDesk.app.tar.gz"
);
const signaturePath = resolve(process.env.RELEASE_SIGNATURE || `${artifactPath}.sig`);
const outputPath = resolve(process.env.RELEASE_MANIFEST_PATH || "src-tauri/target/release/bundle/latest.json");

const repo = (process.env.RELEASE_REPO || parseRepoFromRemote()).trim();
if (!repo) {
  throw new Error("缺少仓库信息，请设置 RELEASE_REPO=owner/repo");
}

const tag = (process.env.RELEASE_TAG || `v${version}`).trim();
const target = (process.env.RELEASE_TARGET || "darwin-aarch64").trim();
const notes = process.env.RELEASE_NOTES || `release ${tag}`;
const assetName = process.env.RELEASE_ASSET_NAME || "ClawDesk.app.tar.gz";
const signature = readText(signaturePath);

if (!signature) {
  throw new Error("签名文件为空，请先完成带签名的 tauri build");
}

const url = `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [target]: {
      signature,
      url,
    },
  },
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`已生成更新清单: ${outputPath}`);
