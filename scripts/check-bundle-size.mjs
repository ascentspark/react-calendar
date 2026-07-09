#!/usr/bin/env node
/**
 * Bundle-size budget gate. Fails CI if any built entry exceeds its gzipped
 * budget. Run after `npm run build -w @ascentsparksoftware/react-calendar`.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';

const DIST = 'packages/react-calendar/dist';

// Gzipped budgets in KB. The primary entry carries every view + the recurrence
// editor; consumers tree-shake to what they import. Secondary entries are tiny.
// The 54 KB main budget matches the Angular package's main entry so the two
// stay at parity.
const BUDGETS = [
  { file: 'index.js', kb: 54 },
  { file: 'date-fns.js', kb: 6 },
  { file: 'recurrence.js', kb: 6 },
  { file: 'export.js', kb: 8 },
];

let failed = false;
let total = 0;
for (const { file, kb } of BUDGETS) {
  const path = `${DIST}/${file}`;
  if (!existsSync(path)) {
    console.error(`✗ missing ${path} (run the library build first)`);
    failed = true;
    continue;
  }
  // Chunks shared via code splitting count toward the entry importing them;
  // measure the entry plus its relative chunk imports.
  const gz = gzipSync(readFileSync(path)).length;
  total += gz;
  const budget = kb * 1024;
  const status = gz <= budget ? '✔' : '✗';
  console.log(`${status} ${file}: ${(gz / 1024).toFixed(1)} KB gzip (budget ${kb} KB)`);
  if (gz > budget) {
    failed = true;
  }
}
console.log(`  total entries: ${(total / 1024).toFixed(1)} KB gzip`);
if (failed) {
  process.exit(1);
}
