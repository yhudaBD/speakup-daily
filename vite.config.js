import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// The libraries in chunks of their own (CRITICAL_REVIEW.md §39): they change
// far less often than the app, so after an update the service worker
// downloads only the app's chunks again, not Firebase and React.
const VENDOR_CHUNKS = [
  ['firebase', /[\\/]node_modules[\\/](@firebase|firebase|re2js)[\\/]/],
  ['react', /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/],
]

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return VENDOR_CHUNKS.find(([, test]) => test.test(id))?.[0]
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // We register the service worker ourselves via the React hook
      // (UpdateBanner.jsx, virtual:pwa-register/react) so we can show the
      // user a "new version available" banner instead of silently swapping
      // the app out from under an open tab — the plugin's auto-injected
      // register script would double-register alongside it.
      injectRegister: false,
      // manifest.json is already hand-written and linked in index.html — don't generate a second one.
      manifest: false,
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/icons/fonts) so Home/Practice/
        // Progress/Settings and the static sentence bank work with no connection.
        // Groq-backed features (chat, transcription, AI sentence generation) are
        // intentionally NOT cached — they should fail fast offline, not serve stale
        // data, and OfflineBanner tells the user why.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // /__/* is proxied to Firebase (see netlify.toml) so the sign-in flow
        // is same-origin. Both the auth handler and its relay iframe are
        // navigation requests, so without this denylist the fallback would
        // answer them with our cached index.html instead of Firebase's auth
        // pages — breaking sign-in all over again, and silently.
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
})
