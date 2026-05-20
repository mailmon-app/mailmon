import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sdkRoot = join(repoRoot, "sdks", "typescript");
const packageJsonPath = join(sdkRoot, "package.json");
const changelogPath = join(sdkRoot, "CHANGELOG.md");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} terminated with signal ${signal}`
            : `${command} ${args.join(" ")} exited with code ${code}`,
        ),
      );
    });
  });

let changelog;
try {
  changelog = await readFile(changelogPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

const packageJson = await readJson(packageJsonPath);
const version = packageJson.version;

await run("pnpm", ["openapi:generate"]);
await run("speakeasy", [
  "run",
  "-y",
  "--output",
  "console",
  "--target",
  "mailmon-typescript",
  "--set-version",
  version,
  "--skip-versioning",
]);

if (changelog !== undefined) {
  await mkdir(dirname(changelogPath), { recursive: true });
  await writeFile(changelogPath, changelog);
}
