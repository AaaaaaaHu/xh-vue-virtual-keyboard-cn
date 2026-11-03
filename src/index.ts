import type { App, Plugin } from 'vue'
import VirtualKeyboard from './components/VirtualKeyboard.vue'
import KeyboardInput from './components/KeyboardInput.vue'

/** 全局注册的组件名（PascalCase 前缀 xH-） */
export const COMPONENT_NAMES = {
  keyboard: 'xH-VirtualKeyboard',
  input: 'xH-KeyboardInput'
} as const

/**
 * 全局注册时同时使用的 kebab-case 别名。
 * 浏览器会把手写 HTML 里的标签名转成小写，所以 <xh-virtual-keyboard> 也要能解析到。
 */
const KEBAB_NAMES = {
  keyboard: 'xh-virtual-keyboard',
  input: 'xh-keyboard-input'
} as const

export {
  VirtualKeyboard,
  KeyboardInput,
  // 带前缀的导出别名（xH- 不是合法 JS 标识符，所以导出名用 PascalCase 形式）
  VirtualKeyboard as XHVirtualKeyboard,
  KeyboardInput as XHKeyboardInput
}

export {
  getCandidates,
  getAssociations,
  getRemainingPinyin,
  segmentPinyin,
  canContinuePinyin,
  isValidSyllable,
  applyCandidate
} from './core/pinyin'
export type { Candidate, CandidateType } from './core/pinyin'

export {
  PANELS,
  LETTERS_PANEL,
  NUMBERS_PANEL,
  SYMBOLS_PANEL,
  DIGITS_PANEL,
  DIGITS_PANEL_LOCKED
} from './core/layouts'
export type { KeyDef, KeyboardPanel } from './core/layouts'

/** 主动收起页面上当前打开的那个键盘（例如路由跳转、页面滚动时） */
export { closeActiveKeyboard } from './core/exclusive'

/** 用户词频学习：选得越多的词，下次越靠前 */
export {
  recordSelection,
  weightOf,
  applyLearning,
  sortByLearning,
  clearLearning,
  exportLearning,
  importLearning,
  setLearningPersistence
} from './core/learning'

export interface VueVirtualKeyboardOptions {
  /** 自定键盘组件名，默认 xH-VirtualKeyboard */
  componentName?: string
  /** 自定义输入框组件名，默认 xH-KeyboardInput */
  inputComponentName?: string
}

const plugin: Plugin = {
  install(app: App, options: VueVirtualKeyboardOptions = {}) {
    const keyboardName = options.componentName ?? COMPONENT_NAMES.keyboard
    const inputName = options.inputComponentName ?? COMPONENT_NAMES.input

    app.component(keyboardName, VirtualKeyboard)
    app.component(inputName, KeyboardInput)

    // 兼容 kebab-case 写法（手写 HTML / 非 SFC 模板）
    if (keyboardName === COMPONENT_NAMES.keyboard) {
      app.component(KEBAB_NAMES.keyboard, VirtualKeyboard)
    }
    if (inputName === COMPONENT_NAMES.input) {
      app.component(KEBAB_NAMES.input, KeyboardInput)
    }
  }
}

export default plugin
