import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest.json is already hand-written and linked in index.html — don't generate a second one.
      manifest: false,
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/icons/fonts) so Home/Practice/
        // Progress/Settings and the static sentence bank work with no connection.
        // Groq-backed features (chat, transcription, AI sentence generation) are
        // intentionally NOT cached — they should fail fast offline, not serve stale
        // data, and OfflineBanner tells the user why.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
})
