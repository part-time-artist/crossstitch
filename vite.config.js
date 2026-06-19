import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// styled-jsx (the <style jsx> blocks in App.jsx) is kept via its Babel plugin so
// the existing styles port unchanged.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/crossstitch/' : '/',
  plugins: [react({ babel: { plugins: ['styled-jsx/babel'] } })],
  server: {
    port: 3000,
    // None of these folders are imported by the app — they're reference images,
    // dev screenshots and notes. Watching them is pointless and, on Windows,
    // dropping a file there can crash the dev server with an EBUSY watch error
    // on the OS temp file (e.g. "…png.~tmp"). Exclude them from the watcher.
    watch: {
      ignored: [
        '**/cross stitch refereences assests/**',
        '**/assets/**',
        '**/scripts/**',
        '**/Beadwork/**',
        '**/dist/**',
      ],
    },
  },
}))
