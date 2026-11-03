/** 一个按键的定义 */
export interface KeyDef {
  /** 逻辑键值：字符键为 'char:<字符>'，功能键为功能名（Backspace / Enter / Shift ...） */
  code: string
  /** 主显示文本 */
  label: string
  /** Shift 态下的显示文本（字母键使用大写） */
  shiftLabel?: string
  /** 相对宽度，1 表示标准键宽；同一行所有键的 flex 之和为 10 */
  flex?: number
  /** 视觉样式 */
  variant?: 'fn' | 'accent' | 'ghost'
  /** 是否为不可点击的占位 */
  disabled?: boolean
}

/** 一个键盘面板（字母页 / 数字页 / 符号页） */
export interface KeyboardPanel {
  name: 'letters' | 'numbers' | 'symbols' | 'digits'
  /** 是否使用三列的大按键布局（数字键盘） */
  compactGrid?: boolean
  rows: KeyDef[][]
}

const ch = (c: string, shift?: string): KeyDef => ({
  code: `char:${c}`,
  label: c,
  shiftLabel: shift
})

const BACKSPACE: KeyDef = {
  code: 'Backspace',
  label: '⌫',
  flex: 1.5,
  variant: 'fn'
}

const rowLetters = 'qwertyuiop'.split('').map((c) => ch(c, c.toUpperCase()))
const rowLetters2 = 'asdfghjkl'.split('').map((c) => ch(c, c.toUpperCase()))
const rowLetters3 = 'zxcvbnm'.split('').map((c) => ch(c, c.toUpperCase()))

// 每行合计 10 个标准键宽
export const LETTERS_PANEL: KeyboardPanel = {
  name: 'letters',
  rows: [
    rowLetters,
    rowLetters2,
    [
      { code: 'Caps', label: '⇧', flex: 1.5, variant: 'fn' },
      ...rowLetters3,
      BACKSPACE
    ],
    [
      { code: 'toNumbers', label: '123', flex: 1.5, variant: 'fn' },
      { code: 'Language', label: '中', flex: 1.5, variant: 'fn' },
      ch(',', '，'),
      { code: 'Space', label: '空格', flex: 3 },
      ch('.', '。'),
      { code: 'Enter', label: '完成', flex: 2, variant: 'accent' }
    ]
  ]
}

export const NUMBERS_PANEL: KeyboardPanel = {
  name: 'numbers',
  rows: [
    '1234567890'.split('').map((c) => ch(c)),
    ['-', '/', ':', ';', '(', ')', '¥', '&', '@', '"'].map((c) => ch(c)),
    [
      { code: 'toSymbols', label: '#+=', flex: 3, variant: 'fn' },
      ch(','),
      ch('.'),
      ch('?'),
      ch('!'),
      ch("'"),
      { code: 'Backspace', label: '⌫', flex: 2, variant: 'fn' }
    ],
    [
      { code: 'toLetters', label: 'ABC', flex: 1.5, variant: 'fn' },
      { code: 'toDigits', label: '0-9', flex: 1.5, variant: 'fn' },
      { code: 'Language', label: '中', flex: 1.5, variant: 'fn' },
      { code: 'Space', label: '空格', flex: 3.5 },
      { code: 'Enter', label: '完成', flex: 2, variant: 'accent' }
    ]
  ]
}

export const SYMBOLS_PANEL: KeyboardPanel = {
  name: 'symbols',
  rows: [
    ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='].map((c) => ch(c)),
    ['_', '\\', '|', '~', '<', '>', '·', '€', '$', '`'].map((c) => ch(c)),
    [
      { code: 'toNumbers', label: '123', flex: 3, variant: 'fn' },
      ch(','),
      ch('.'),
      ch('?'),
      ch('!'),
      ch("'"),
      { code: 'Backspace', label: '⌫', flex: 2, variant: 'fn' }
    ],
    [
      { code: 'toLetters', label: 'ABC', flex: 1.5, variant: 'fn' },
      { code: 'Language', label: '中', flex: 1.5, variant: 'fn' },
      { code: 'Space', label: '空格', flex: 5 },
      { code: 'Enter', label: '完成', flex: 2, variant: 'accent' }
    ]
  ]
}

/** 三列大按键的数字键盘（金额 / 数量 / 密码场景） */
export const DIGITS_PANEL: KeyboardPanel = {
  name: 'digits',
  compactGrid: true,
  rows: [
    ['1', '2', '3'].map((c) => ch(c)),
    ['4', '5', '6'].map((c) => ch(c)),
    ['7', '8', '9'].map((c) => ch(c)),
    [ch('.'), ch('0'), { code: 'Backspace', label: '⌫', variant: 'fn' }],
    [
      { code: 'toNumbers', label: '123', flex: 1, variant: 'fn' },
      { code: 'Clear', label: '清空', flex: 0.5, variant: 'fn' },
      { code: 'Enter', label: '完成', flex: 1.5, variant: 'accent' }
    ]
  ]
}

/**
 * 锁定版数字键盘：纯数字输入场景（金额 / 数量 / 手机号）。
 * 不含任何面板切换键，用户无法切到字母或符号面板。
 */
export const DIGITS_PANEL_LOCKED: KeyboardPanel = {
  name: 'digits',
  compactGrid: true,
  rows: [
    ['1', '2', '3'].map((c) => ch(c)),
    ['4', '5', '6'].map((c) => ch(c)),
    ['7', '8', '9'].map((c) => ch(c)),
    [ch('.'), ch('0'), { code: 'Backspace', label: '⌫', variant: 'fn' }],
    [
      { code: 'Clear', label: '清空', flex: 1, variant: 'fn' },
      { code: 'Enter', label: '完成', flex: 2, variant: 'accent' }
    ]
  ]
}

export const PANELS: Record<string, KeyboardPanel> = {
  letters: LETTERS_PANEL,
  numbers: NUMBERS_PANEL,
  symbols: SYMBOLS_PANEL,
  digits: DIGITS_PANEL
}
