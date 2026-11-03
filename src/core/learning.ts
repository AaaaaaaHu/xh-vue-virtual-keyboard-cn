/**
 * 用户词频学习：记录用户选过的词，下次同样输入时把它们排到更前面。
 *
 * 数据是**全局共享**的（页面内所有键盘实例共用一份），因为用户的使用习惯不应该
 * 按组件实例割裂。持久化需要显式开启（默认只存在内存里，刷新即失效），
 * 避免自助终端这类多用户共用设备被别人的习惯污染。
 */

import type { Candidate } from './pinyin'

const STORAGE_KEY = 'xh-virtual-keyboard-learning'
/** 单个词的权重上限，防止长期使用后某个词无限压制其它候选 */
const MAX_COUNT = 99
/** localStorage 里最多保留多少个词 */
const MAX_ENTRIES = 600

const freq = new Map<string, number>()
let persistEnabled = false
let loaded = false

function readStorage() {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Record<string, number>
    for (const [word, count] of Object.entries(data)) {
      if (typeof count === 'number' && count > 0) {
        freq.set(word, Math.min(Math.round(count), MAX_COUNT))
      }
    }
  } catch {
    /* 存储损坏时忽略 */
  }
}

function writeStorage() {
  if (!persistEnabled || typeof localStorage === 'undefined') return
  try {
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(top)))
  } catch {
    /* 隐私模式或超额时忽略 */
  }
}

/**
 * 开启持久化。开启后会从 localStorage 读一次已有数据。
 *
 * 数据是全局共享的，所以传 false **不会**关闭其它实例已开启的持久化，
 * 避免页面上多个键盘互相干扰。确需彻底关闭请用 `clearLearning()` 并自行清 storage。
 */
export function setLearningPersistence(enabled: boolean): void {
  if (!enabled) return
  persistEnabled = true
  if (!loaded) {
    loaded = true
    readStorage()
  }
}

/** 记一次用户选择 */
export function recordSelection(word: string): void {
  const w = word?.trim()
  if (!w) return
  const next = Math.min((freq.get(w) ?? 0) + 1, MAX_COUNT)
  freq.set(w, next)
  writeStorage()
}

/** 查询某个词被选过多少次 */
export function weightOf(word: string): number {
  return freq.get(word) ?? 0
}

/** 按学习权重稳定排序：权重高的在前，权重相同保持原顺序 */
export function sortByLearning<T>(items: T[], key: (item: T) => string): T[] {
  if (items.length < 2 || freq.size === 0) return items
  const weighted = items.map((item, index) => ({
    item,
    index,
    weight: freq.get(key(item)) ?? 0
  }))
  if (!weighted.some((x) => x.weight > 0)) return items
  weighted.sort((a, b) => b.weight - a.weight || a.index - b.index)
  return weighted.map((x) => x.item)
}

/** 对候选词应用学习权重 */
export function applyLearning(candidates: Candidate[]): Candidate[] {
  return sortByLearning(candidates, (c) => c.text)
}

/** 清空学习数据 */
export function clearLearning(): void {
  freq.clear()
  if (persistEnabled && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/** 导出学习数据（可用于备份 / 上报分析） */
export function exportLearning(): Record<string, number> {
  return Object.fromEntries(freq)
}

/** 导入学习数据（合并，同词取较大值） */
export function importLearning(data: Record<string, number>): void {
  for (const [word, count] of Object.entries(data ?? {})) {
    if (typeof count !== 'number' || count <= 0) continue
    const prev = freq.get(word) ?? 0
    freq.set(word, Math.min(Math.max(prev, Math.round(count)), MAX_COUNT))
  }
  writeStorage()
}
