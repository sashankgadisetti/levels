// Ensure dist/index.js starts with a node shebang and is executable (bin entry).
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
const file = new URL("../dist/index.js", import.meta.url);
let src = readFileSync(file, "utf8");
if (!src.startsWith("#!")) {
  src = "#!/usr/bin/env node\n" + src;
  writeFileSync(file, src);
}
try { chmodSync(file, 0o755); } catch { /* Windows: no-op */ }
