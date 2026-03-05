import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const sourceDir = resolve(packageDir, "src", "web", "monty");
const targetDir = resolve(packageDir, "build", "web", "monty");

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

process.stdout.write(`Copied web runtime assets to ${targetDir}\n`);
