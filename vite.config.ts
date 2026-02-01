import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (!env.LTA_DATAMALL_API_KEY) {
      console.warn("⚠️  WARNING: LTA_DATAMALL_API_KEY is missing!");
  } else {
      console.log("✅  SUCCESS: LTA API Key detected.");
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'SingaTransit',
          short_name: 'SingaTransit',
          description: 'Singapore Transit Routing & Arrival',
          theme_color: '#1a1a1a',
          background_color: '#1a1a1a',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        }
      })
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
    server: {
      proxy: {
        '/lta-api': {
          target: 'https://datamall2.mytransport.sg',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/lta-api/, '/ltaodataservice'),
          headers: {
            'AccountKey': env.LTA_DATAMALL_API_KEY || '',
            'accept': 'application/json'
          },
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('❌ Proxy Error:', err);
            });
            // Removed unused 'proxyRes' listener to fix build error
          }
        },
        '/api/onemap-proxy': {
          target: 'https://www.onemap.gov.sg',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/onemap-proxy/, '/api/common/elastic/search'),
          headers: {
            'accept': 'application/json',
            ...(env.ONEMAP_ACCESS_TOKEN && { 'Authorization': `Bearer ${env.ONEMAP_ACCESS_TOKEN}` })
          },
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('❌ OneMap Proxy Error:', err);
            });
          }
        }
      }
    }
  }
})