import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_URL =
  "https://github.com/ggml-org/llama.cpp/releases/download/b9222/llama-b9222-bin-win-cpu-x64.zip";
const RELEASE_SHA256 = "a3484954606f3ade0937fc7fef86d434e35936db21264938c242bfced58a91b2";
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const RESOURCE_DIRECTORY = path.join(PROJECT_DIRECTORY, "src-tauri", "resources", "llama");

async function isPinnedRuntimePrepared() {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(RESOURCE_DIRECTORY, "llama-runtime.json"), "utf8"),
    );
    const files = await readdir(RESOURCE_DIRECTORY);
    return (
      manifest.repository === "ggml-org/llama.cpp" &&
      manifest.tag === "b9222" &&
      manifest.archiveSha256 === RELEASE_SHA256 &&
      files.includes("llama-server.exe") &&
      files.includes("llama.dll") &&
      files.some((file) => file.toLowerCase().endsWith(".dll"))
    );
  } catch {
    return false;
  }
}

if (process.platform !== "win32") {
  throw new Error(
    "Amanda's native release currently targets Windows x64. Build the installer on Windows or use the Windows GitHub Actions workflow.",
  );
}

if (await isPinnedRuntimePrepared()) {
  console.log("Verified llama.cpp b9222 runtime is already prepared; skipping download.");
} else {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "amanda-llama-b9222-"));
  const archivePath = path.join(temporaryDirectory, "llama-runtime.zip");
  const extractedDirectory = path.join(temporaryDirectory, "extracted");

  try {
    const response = await fetch(RELEASE_URL, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Could not download the pinned llama.cpp runtime (HTTP ${response.status}).`);
    }

    const archive = Buffer.from(await response.arrayBuffer());
    const archiveHash = createHash("sha256").update(archive).digest("hex");
    if (archiveHash !== RELEASE_SHA256) {
      throw new Error(
        "The llama.cpp runtime checksum did not match the pinned release; packaging was stopped.",
      );
    }
    await writeFile(archivePath, archive);

    await mkdir(extractedDirectory, { recursive: true });
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:AMANDA_LLAMA_ZIP, $env:AMANDA_LLAMA_STAGE)",
      ],
      {
        env: {
          ...process.env,
          AMANDA_LLAMA_ZIP: archivePath,
          AMANDA_LLAMA_STAGE: extractedDirectory,
        },
        stdio: "inherit",
      },
    );

    const releaseFiles = await readdir(extractedDirectory);
    const bundledFiles = releaseFiles.filter(
      (file) => file.toLowerCase().endsWith(".dll") || file.toLowerCase() === "llama-server.exe",
    );
    if (!bundledFiles.includes("llama-server.exe") || !bundledFiles.includes("llama.dll")) {
      throw new Error(
        "The pinned llama.cpp archive did not contain the expected server and runtime libraries.",
      );
    }

    await rm(RESOURCE_DIRECTORY, { recursive: true, force: true });
    await mkdir(RESOURCE_DIRECTORY, { recursive: true });
    await Promise.all(
      bundledFiles.map((file) =>
        copyFile(path.join(extractedDirectory, file), path.join(RESOURCE_DIRECTORY, file)),
      ),
    );
    await writeFile(
      path.join(RESOURCE_DIRECTORY, "llama-runtime.json"),
      JSON.stringify(
        {
          repository: "ggml-org/llama.cpp",
          tag: "b9222",
          archiveSha256: RELEASE_SHA256,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `Prepared llama.cpp b9222 for Windows x64 (${bundledFiles.length} verified runtime files).`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
