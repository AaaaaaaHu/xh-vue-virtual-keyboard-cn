/**
 * 全局键盘互斥：同一时间只允许一个键盘处于显示状态。
 * 新键盘打开时，会自动通知上一个键盘关闭。
 */

interface KeyboardHandle {
  close: () => void
}

let current: KeyboardHandle | null = null

/** 某个键盘要打开了：先关掉当前打开的那个 */
export function acquireExclusive(handle: KeyboardHandle): void {
  if (current && current !== handle) {
    try {
      current.close()
    } catch {
      // 实例已销毁时忽略
    }
  }
  current = handle
}

/** 某个键盘关闭了：让出占位 */
export function releaseExclusive(handle: KeyboardHandle): void {
  if (current === handle) current = null
}

/** 主动收起当前打开的键盘（业务侧可用，比如页面滚动、路由跳转时） */
export function closeActiveKeyboard(): void {
  const handle = current
  current = null
  if (handle) {
    try {
      handle.close()
    } catch {
      // ignore
    }
  }
}
