import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    command === 'build'
      ? dts({
          include: ['src/**/*.ts', 'src/**/*.vue'],
          tsconfigPath: './tsconfig.build.json',
          outDir: 'dist',
          insertTypesEntry: true,
          cleanVueFileName: true
        })
      : null
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'XhVueVirtualKeyboardCn',
      fileName: 'xh-vue-virtual-keyboard-cn',
      formats: ['es', 'umd'],
      cssFileName: 'xh-vue-virtual-keyboard-cn'
    },
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        exports: 'named'
      }
    }
  }
}))
