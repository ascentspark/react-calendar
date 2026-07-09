import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

/**
 * Library build: ESM entries with types, `"use client"` banner on the main entry
 * (the view components are client components for Next.js/RSC consumers), and the
 * component stylesheet concatenated to dist/styles.css.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'date-fns': 'src/date-fns/index.ts',
    recurrence: 'src/recurrence/index.ts',
    export: 'src/export/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  banner: { js: '"use client";' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'date-fns', 'date-fns-tz', 'rrule'],
  onSuccess: async () => {
    // Re-attach the "use client" directive: tsup's rollup treeshake pass strips
    // module-level directives, so the banner option alone does not survive.
    for (const name of ['index.js', 'date-fns.js', 'recurrence.js', 'export.js']) {
      const entry = join(import.meta.dirname, 'dist', name);
      const js = readFileSync(entry, 'utf8');
      if (!js.startsWith('"use client";')) {
        writeFileSync(entry, `"use client";\n${js}`);
      }
    }

    // Assemble dist/styles.css from src/styles/*.css in a stable order.
    const stylesDir = join(import.meta.dirname, 'src/styles');
    const order = readFileSync(join(stylesDir, 'order.txt'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const seen = new Set([...order, 'all.css']); // all.css is the dev-only @import aggregate
    for (const file of readdirSync(stylesDir).sort()) {
      if (file.endsWith('.css') && !seen.has(file)) {
        order.push(file);
      }
    }
    const css = order.map((file) => readFileSync(join(stylesDir, file), 'utf8')).join('\n');
    mkdirSync(join(import.meta.dirname, 'dist'), { recursive: true });
    writeFileSync(join(import.meta.dirname, 'dist/styles.css'), css);
    copyFileSync(join(import.meta.dirname, '../../LICENSE'), join(import.meta.dirname, 'LICENSE'));
    copyFileSync(join(import.meta.dirname, '../../README.md'), join(import.meta.dirname, 'README.md'));
  },
});
