import fs from "node:fs";
import path from "node:path";

const TARGETS = ["TesseraID", "ConfidentialTBill", "ConfidentialUSDC"];

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "..", "web", "lib", "abi");
fs.mkdirSync(outDir, { recursive: true });

for (const name of TARGETS) {
  const artifactPath = path.resolve(
    root,
    "artifacts",
    "contracts",
    `${name}.sol`,
    `${name}.json`,
  );
  if (!fs.existsSync(artifactPath)) {
    console.warn(`skipping ${name}: artifact not found at ${artifactPath}`);
    continue;
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(
    path.join(outDir, `${name}.json`),
    JSON.stringify({ abi: artifact.abi }, null, 2),
  );
  console.log(`synced ${name} ABI -> ${path.join(outDir, `${name}.json`)}`);
}
