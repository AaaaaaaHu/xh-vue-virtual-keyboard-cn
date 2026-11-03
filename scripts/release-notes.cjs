#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 里取出指定版本的段落，输出为 GitHub Release 正文。
 * 用法：node scripts/release-notes.cjs v0.1.3
 *
 * 为什么不把说明直接写进 workflow：
 * 版本说明属于「文档」，放在 CHANGELOG.md 里能用 PR 审阅、能跟着代码一起提交；
 * Release 只是它的展示层。CI 每发一个 tag 就自动取对应段落建 Release，避免两处各写一份。
 */
const fs = require('node:fs')
const path = require('node:path')

const raw = (process.argv[2] || '').trim()
const version = raw.replace(/^v/, '')

if (!version) {
  console.error('用法：node scripts/release-notes.cjs v0.1.3')
  process.exit(1)
}

const FILE = path.resolve(__dirname, '..', 'CHANGELOG.md')
const REPO = 'https://github.com/AaaaaaaHu/xh-vue-virtual-keyboard-cn'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let body = ''
let fromUnreleased = false
try {
  const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/)
  const section = (label) => {
    const header = new RegExp(`^##\\s*\\[${esc(label)}\\](\\s|$)`)
    const start = lines.findIndex((l) => header.test(l))
    if (start < 0) return ''
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((l) => /^##\s/.test(l))
    return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  }

  body = section(version)
  // 发版时常常还写在 [Unreleased] 下面没改标题，直接取用它，
  // 免得 Release 正文变成一句干巴巴的兜底说明
  if (!body) {
    body = section('Unreleased')
    if (body) fromUnreleased = true
  }
} catch (e) {
  console.error(`读取 CHANGELOG.md 失败：${e.message}`)
}

if (!body) {
  // 没写 changelog 也不能让发版流程挂，给个能点的兜底
  console.error(`::warning::CHANGELOG.md 里没有 ${version} 的段落，使用兜底说明`)
  body = `该版本的变更见 [CHANGELOG.md](${REPO}/blob/main/CHANGELOG.md)。`
}

if (fromUnreleased) {
  console.error(
    `::warning::CHANGELOG.md 里还没有 [${version}] 段落，Release 正文取自 [Unreleased]`
  )
  process.stdout.write(
    `> 说明：变更写在 CHANGELOG 的 \`[Unreleased]\` 下，发版后可把它改成 \`[${version}]\`。\n\n`
  )
}

process.stdout.write(`${body}\n\n---\n\n`)
process.stdout.write('```bash\nnpm i xh-vue-virtual-keyboard-cn@' + version + '\n```\n')
