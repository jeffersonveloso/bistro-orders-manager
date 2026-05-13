import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];

if (!target) {
  console.error("Missing database path argument.");
  process.exit(1);
}

const resolvedPath = path.isAbsolute(target)
  ? target
  : path.join(process.cwd(), target);

for (const candidate of [
  resolvedPath,
  `${resolvedPath}-shm`,
  `${resolvedPath}-wal`,
]) {
  fs.rmSync(candidate, { force: true });
}

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
