import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';

function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const rootDir = process.cwd();
      const outDir = path.resolve(rootDir, 'dist');
      const dirsToCopy = ['css', 'js', 'data', 'assets'];
      const filesToCopy = ['index.html', 'manifest.webmanifest', 'sw.js'];

      for (const dir of dirsToCopy) {
        const src = path.resolve(rootDir, dir);
        const dest = path.resolve(outDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true, force: true });
        }
      }

      for (const file of filesToCopy) {
        const src = path.resolve(rootDir, file);
        const dest = path.resolve(outDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    basicSsl(),
    copyStaticAssetsPlugin()
  ],
  server: {
    port: 3000,
    host: true
  }
});
