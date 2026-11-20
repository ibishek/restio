import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const dotVersionPath = path.join(rootDir, ".version");
const pkgPath = path.join(rootDir, "package.json");
const cargoPath = path.join(rootDir, "src-tauri/Cargo.toml");
const tauriConfPath = path.join(rootDir, "src-tauri/tauri.conf.json");

const targetVersion = process.argv[2];

function readVersions() {
  const dotVersion = fs.existsSync(dotVersionPath)
    ? fs.readFileSync(dotVersionPath, "utf8").trim()
    : null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  const cargo = fs.readFileSync(cargoPath, "utf8");
  const cargoMatch = cargo.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);

  return {
    dotVersion,
    packageJson: pkg.version,
    tauriConf: tauriConf.version,
    cargoToml: cargoMatch ? cargoMatch[1] : null,
  };
}

if (!targetVersion || targetVersion === "--check") {
  const versions = readVersions();
  console.log(`Current versions:
  .version:                ${versions.dotVersion}
  package.json:            ${versions.packageJson}
  src-tauri/tauri.conf.json: ${versions.tauriConf}
  src-tauri/Cargo.toml:    ${versions.cargoToml}
`);

  if (
    versions.dotVersion === versions.packageJson &&
    versions.packageJson === versions.tauriConf &&
    versions.packageJson === versions.cargoToml
  ) {
    console.log(`✓ All versions are synchronized (${versions.packageJson}).`);
    process.exit(0);
  } else {
    console.error("✗ Version mismatch detected across version files!");
    process.exit(1);
  }
}

// Semver format check
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
if (!semverRegex.test(targetVersion)) {
  console.error(`Invalid semver format: "${targetVersion}". Expected X.Y.Z or X.Y.Z-tag`);
  process.exit(1);
}

console.log(`Updating version to: ${targetVersion}`);

// 1. .version
fs.writeFileSync(dotVersionPath, `${targetVersion}\n`);

// 2. package.json
const pkgText = fs.readFileSync(pkgPath, "utf8");
const updatedPkg = pkgText.replace(/"version":\s*"[^"]+"/, `"version": "${targetVersion}"`);
fs.writeFileSync(pkgPath, updatedPkg);

// 3. tauri.conf.json
const tauriText = fs.readFileSync(tauriConfPath, "utf8");
const updatedTauri = tauriText.replace(/"version":\s*"[^"]+"/, `"version": "${targetVersion}"`);
fs.writeFileSync(tauriConfPath, updatedTauri);

// 4. Cargo.toml
const cargoText = fs.readFileSync(cargoPath, "utf8");
const updatedCargo = cargoText.replace(
  /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
  `$1"${targetVersion}"`,
);
fs.writeFileSync(cargoPath, updatedCargo);

console.log(
  "✓ Successfully synchronized versions in .version, package.json, tauri.conf.json, and Cargo.toml.",
);
