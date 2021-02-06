import reactRefresh from '@vitejs/plugin-react-refresh';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

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
      },
    }),
  ],
});
