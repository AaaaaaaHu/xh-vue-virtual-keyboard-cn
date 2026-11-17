import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const builtAt = new Date().toLocaleString('zh-CN', { hour12: false })

export default defineConfig(({ command }) => ({
  // demo 页脚读这三个全局常量，dev 和 build:demo 都要注入。
  // 少注入一处就会在浏览器里报 __APP_PKG_NAME__ is not defined（白屏）。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_PKG_NAME__: JSON.stringify(pkg.name),
    __BUILD_TIME__: JSON.stringify(command === 'serve' ? `${builtAt}（dev）` : builtAt)
  },
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
