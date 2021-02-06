import reactRefresh from '@vitejs/plugin-react-refresh';
import legacy from '@vitejs/plugin-legacy';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    reactRefresh({
      parserPlugins: ['classProperties', 'classPrivateProperties'],
    }),
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),
  ],
});
