import { access, cp } from 'node:fs/promises';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-generated-script',
      apply: 'build',
      async closeBundle() {
        try {
          const generated = path.resolve('generated');
          await access(generated);
          await cp(generated, path.resolve('dist/generated'), {
            recursive: true,
            filter: (source) => {
              const relative = path.relative(generated, source);
              return (
                relative !== 'fonts' && !relative.startsWith(`fonts${path.sep}`)
              );
            },
          });
        } catch {
          // Script generation needs the pinned Typst toolchain; keep plain UI builds usable.
        }
        await cp(
          path.resolve('assets/manifest.yaml'),
          path.resolve('dist/assets/manifest.yaml'),
        );
        for (const directory of ['bg', 'ch', 'cg', 'bgm', 'se', 'ui']) {
          const source = path.resolve('assets', directory);
          try {
            await access(source);
            await cp(source, path.resolve('dist/assets', directory), {
              recursive: true,
            });
          } catch {
            // Asset categories are populated as owner-supplied materials arrive.
          }
        }
      },
    },
  ],
  server: { host: '127.0.0.1' },
  build: { sourcemap: true },
});
