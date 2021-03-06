import reactRefresh from '@vitejs/plugin-react-refresh';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

process.env['VITE_COMMIT_REF'] = process.env['COMMIT_REF'] ?? '';

export default defineConfig({
  plugins: [
    reactRefresh({
      parserPlugins: ['classProperties', 'classPrivateProperties'],
    }),
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),
    VitePWA({
      manifest: {
        name: 'Shoppinglist',
        short_name: 'Shoppinglist',
        background_color: 'rgb(5,150,105)',
        theme_color: 'rgb(229,231,235)',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 400,
  },
});
