import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(dirname(packageRoot));
const sourcePath = join(packageRoot, "package.json");
const workspacePath = join(workspaceRoot, "pnpm-workspace.yaml");
const distPath = join(packageRoot, "dist", "package.json");

const sourceManifest = JSON.parse(await readFile(sourcePath, "utf8"));
const workspaceConfig = await readFile(workspacePath, "utf8");

const catalog = new Map();
let inCatalog = false;

for (const line of workspaceConfig.split(/\r?\n/)) {
  if (/^\S/.test(line)) {
    inCatalog = line === "catalog:";
    continue;
  }

  if (!inCatalog) {
    continue;
  }

  const match = line.match(/^\s{2}("?[^":]+"?):\s*(.+)$/);
  if (match) {
    catalog.set(match[1].replaceAll('"', ""), match[2].trim());
  }
}

const resolveDependencySpec = (name, spec) => {
  if (spec !== "catalog:") {
    return spec;
  }

  const resolved = catalog.get(name);
  if (!resolved) {
    throw new Error(`No default catalog entry found for ${name}`);
  }

  return resolved;
};

const dependencies = Object.fromEntries(
  Object.entries(sourceManifest.dependencies ?? {}).map(([name, spec]) => [
    name,
    resolveDependencySpec(name, spec),
  ]),
);

const bin = Object.fromEntries(
  Object.entries(sourceManifest.bin ?? {}).map(([name, path]) => [
    name,
    path.startsWith("dist/") ? path.slice("dist/".length) : path,
  ]),
);

const publishManifest = {
  name: sourceManifest.name,
  version: sourceManifest.version,
  private: false,
  description: sourceManifest.description,
  license: sourceManifest.license,
  repository: sourceManifest.repository,
  bin,
  type: sourceManifest.type,
  publishConfig: {
    access: sourceManifest.publishConfig.access,
  },
  dependencies,
};

await mkdir(dirname(distPath), { recursive: true });
await writeFile(distPath, `${JSON.stringify(publishManifest, null, 2)}\n`);
