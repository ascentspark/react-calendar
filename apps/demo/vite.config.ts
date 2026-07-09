import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the library from source so demo dev/build never needs a dist build.
      '@ascentsparksoftware/react-calendar/styles.css': resolve(
        __dirname,
        '../../packages/react-calendar/src/styles/all.css',
      ),
      '@ascentsparksoftware/react-calendar/date-fns': resolve(
        __dirname,
        '../../packages/react-calendar/src/date-fns/index.ts',
      ),
      '@ascentsparksoftware/react-calendar/recurrence': resolve(
        __dirname,
        '../../packages/react-calendar/src/recurrence/index.ts',
      ),
      '@ascentsparksoftware/react-calendar/export': resolve(
        __dirname,
        '../../packages/react-calendar/src/export/index.ts',
      ),
      '@ascentsparksoftware/react-calendar': resolve(
        __dirname,
        '../../packages/react-calendar/src/index.ts',
      ),
    },
  },
});
