import { execFileSync } from "node:child_process";

const output = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8" },
);
const [{ files }] = JSON.parse(output);
const paths = new Set(files.map(({ path }) => path));
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "assets/demo.png",
  "extensions/index.ts",
  "src/config.ts",
  "src/format.ts",
];

for (const path of required) {
  if (!paths.has(path)) throw new Error(`Missing package file: ${path}`);
}

const forbidden = [...paths].filter(
  (path) => path.startsWith("tests/") || path.startsWith(".github/workflows/"),
);
if (forbidden.length > 0) {
  throw new Error(`Unexpected package files: ${forbidden.join(", ")}`);
}
