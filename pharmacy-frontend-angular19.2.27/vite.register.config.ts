import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  root: 'src/react-registration',
  build: {
    outDir: '../../public/register',
    emptyOutDir: true,
  },
});
