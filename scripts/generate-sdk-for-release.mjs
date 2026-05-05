import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const changelogPath = join(repoRoot, "sdks", "typescript", "CHANGELOG.md");

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

await run("pnpm", ["openapi:generate"]);
await run("fern", ["generate", "--group", "ts-sdk", "--local", "--force"]);

if (changelog !== undefined) {
  await mkdir(dirname(changelogPath), { recursive: true });
  await writeFile(changelogPath, changelog);
}
