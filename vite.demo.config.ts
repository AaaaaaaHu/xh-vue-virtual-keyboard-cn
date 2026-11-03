import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const builtAt = new Date().toLocaleString('zh-CN', { hour12: false })

// 构建一个纯静态 demo（相对路径），可直接双击/内置预览打开，不依赖 dev server
export default defineConfig({
  base: './',
  plugins: [vue()],
  // 页脚显示版本与构建时间，方便确认预览到的是不是最新构建
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_PKG_NAME__: JSON.stringify(pkg.name),
    __BUILD_TIME__: JSON.stringify(builtAt)
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    sourcemap: false
  }
})
