<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue'
import {
  canContinuePinyin,
  getAssociations,
  getCandidates,
  getRemainingPinyin,
  type Candidate
} from '../core/pinyin'
import { acquireExclusive, releaseExclusive } from '../core/exclusive'
import {
  applyLearning,
  recordSelection,
  setLearningPersistence,
  sortByLearning
} from '../core/learning'
import { DIGITS_PANEL_LOCKED, PANELS, type KeyDef, type KeyboardPanel } from '../core/layouts'

type PanelName = 'letters' | 'numbers' | 'symbols' | 'digits'
type LangName = 'zh' | 'en'

defineOptions({ name: 'xH-VirtualKeyboard', inheritAttrs: false })
const attrs = useAttrs()

/** class / style 单独处理，其余属性直接透传到键盘根节点 */
const restAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const props = withDefaults(
  defineProps<{
    /** 输入内容（支持 v-model） */
    modelValue?: string
    /** 是否显示（支持 v-model:visible） */
    visible?: boolean
    /** 键盘面板 */
    panel?: PanelName
    /** 输入语言：zh = 拼音中文，en = 英文 */
    lang?: LangName
    /** 主题 */
    theme?: 'light' | 'dark'
    /** 最大输入长度，0 表示不限制 */
    maxLength?: number
    /** 是否显示上方候选栏 */
    showCandidates?: boolean
    /** 是否开启联想词（一个词上屏后推荐下一个词），默认开启 */
    associations?: boolean
    /** 联想词最多显示几个 */
    maxAssociations?: number
    /** 定位方式：fixed 固定吸底（移动端常用），inline 跟随文档流 */
    position?: 'fixed' | 'inline'
    /** 回车键文案 */
    enterText?: string
    /** 键盘整体最大宽度 */
    maxWidth?: string
    /**
     * fixed 定位时是否挂载到 body。
     * 默认 true：避免祖先元素存在 transform / filter / perspective 时
     * position: fixed 失效（键盘跑到错误位置、点了没反应）。
     */
    teleport?: boolean
    /** 层级，默认 9999 */
    zIndex?: number
    /**
     * 是否与页面内其它键盘互斥（同一时间只显示一个）。
     * 默认 true：新键盘打开时会自动收起上一个。
     */
    exclusive?: boolean
    /**
     * 是否可拖动位置（仅 position="fixed" 生效）。
     * 开启后整条候选栏都可以按住拖动（按钮区域除外），双击把手复位。
     */
    draggable?: boolean
    /** 候选栏右侧是否显示设置按钮 */
    showSettings?: boolean
    /** 是否把用户的设置（主题 / 尺寸 / 拖动）保存到 localStorage */
    persistSettings?: boolean
    /** 是否学习用户选过的词（选得越多，下次越靠前），默认开启 */
    learn?: boolean
    /** 是否把学习数据保存到 localStorage（跨会话生效） */
    persistLearn?: boolean
    /**
     * 是否锁定面板：为 true 时隐藏所有面板切换键，用户无法离开当前面板。
     * 纯数字输入场景（金额 / 数量 / 手机号）应开启，确保只能输入数字。
     */
    lockPanel?: boolean
  }>(),
  {
    modelValue: '',
    visible: true,
    panel: 'letters',
    lang: 'zh',
    theme: 'light',
    maxLength: 0,
    showCandidates: true,
    associations: true,
    maxAssociations: 10,
    position: 'fixed',
    enterText: '完成',
    maxWidth: '35rem',
    teleport: true,
    zIndex: 9999,
    exclusive: true,
    draggable: false,
    showSettings: true,
    persistSettings: false,
    learn: true,
    persistLearn: false,
    lockPanel: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:visible': [value: boolean]
  'update:panel': [value: PanelName]
  'update:lang': [value: LangName]
  /** 正在输入的拼音（未上屏部分），可用于在输入框里实时回显 */
  'update:pinyin': [value: string]
  /** 主题变化（设置面板里切换时触发） */
  'update:theme': [value: 'light' | 'dark']
  /** 每次按键都会触发，便于业务方做埋点或拦截 */
  key: [payload: { key: string; text: string }]
  /** 点击「完成」 */
  confirm: [value: string]
  /** 收起键盘 */
  close: []
  /** 开始拖动 */
  dragstart: []
  /** 拖动结束，payload 为相对默认位置的偏移 */
  dragend: [offset: { x: number; y: number }]
}>()

/* ------------------------------------------------------------ 状态 */
const text = ref(props.modelValue ?? '')
const pinyin = ref('')
const candidates = ref<Candidate[]>([])
const currentPanel = ref<PanelName>(props.panel)
const currentLang = ref<LangName>(props.lang)
const shift = ref(false)
const caps = ref(false)
let lastCapsAt = 0

const panelDef = computed<KeyboardPanel>(() => {
  const name = currentPanel.value
  // 锁定面板时用不带切换键的版本，保证用户无法切走
  if (props.lockPanel && name === 'digits') return DIGITS_PANEL_LOCKED
  return PANELS[name] ?? PANELS.letters
})

const isZh = computed(() => currentLang.value === 'zh')

/** 联想词：只有在没有正在输入的拼音时才展示 */
const assocList = computed(() => {
  if (!props.associations) return []
  if (pinyin.value) return []
  if (!text.value) return []
  const list = getAssociations(text.value, props.maxAssociations)
  return props.learn ? sortByLearning(list, (w) => w) : list
})

/** 候选栏左侧的提示文案 */
const composeHint = computed(() => {
  if (assocList.value.length) return '联想'
  switch (panelDef.value.name) {
    case 'numbers':
      return '数字与符号'
    case 'symbols':
      return '更多符号'
    case 'digits':
      return '数字键盘'
    default:
      return isZh.value ? '拼音输入' : 'English'
  }
})

/* ------------------------------------------------------------ 双向同步 */
watch(
  () => props.modelValue,
  (v) => {
    const next = v ?? ''
    if (next !== text.value) text.value = next
  }
)

watch(text, (v) => {
  if (v !== props.modelValue) emit('update:modelValue', v)
})

// 拼音缓冲变化时同步给外部，便于输入框实时回显"正在输入"的拼音
watch(pinyin, (v) => {
  emit('update:pinyin', v)
  // 拼音清空（已上屏或退格删完）就收起展开的候选面板
  if (!v) expanded.value = false
})

watch(
  () => props.panel,
  (v) => {
    if (v !== currentPanel.value) currentPanel.value = v
  }
)

watch(
  () => props.lang,
  (v) => {
    if (v !== currentLang.value) currentLang.value = v
  }
)

/* ------------------------------------------------------------ 可见状态与互斥 */
const innerVisible = ref(props.visible)

/** 被页面内其它键盘抢占时调用 */
function closeByExclusive() {
  if (!innerVisible.value) return
  innerVisible.value = false
}

const exclusiveHandle = { close: closeByExclusive }

watch(
  () => props.visible,
  (v) => {
    if (v === innerVisible.value) return
    innerVisible.value = v
  }
)

watch(innerVisible, (v) => {
  // 收起时把未上屏的拼音直接落地，避免输入内容"凭空消失"
  if (!v) commitComposing()
  if (v !== props.visible) emit('update:visible', v)
  if (!props.exclusive) return
  if (v) acquireExclusive(exclusiveHandle)
  else releaseExclusive(exclusiveHandle)
})

onMounted(() => {
  if (props.exclusive && innerVisible.value) acquireExclusive(exclusiveHandle)
})

onUnmounted(() => releaseExclusive(exclusiveHandle))

/* ------------------------------------------------------------ 内部方法 */
function toChars(s: string): string[] {
  return Array.from(s)
}

function commitText(s: string) {
  if (!s) return
  let next = s
  if (props.maxLength > 0) {
    const room = props.maxLength - text.value.length
    if (room <= 0) return
    next = toChars(s).slice(0, room).join('')
  }
  text.value += next
}

function refreshCandidates() {
  const raw = pinyin.value ? getCandidates(pinyin.value) : []
  // 用户选过的词排到更前面
  candidates.value = props.learn ? applyLearning(raw) : raw
}

/** 把拼音缓冲上屏（优先取第一个候选） */
function commitComposing() {
  if (!pinyin.value) return
  const first = candidates.value[0]
  if (first) {
    commitText(first.text)
    pinyin.value = getRemainingPinyin(pinyin.value, first)
  } else {
    commitText(pinyin.value)
    pinyin.value = ''
  }
  refreshCandidates()
}

/** 追加一个拼音字母 */
function pushLetter(letter: string) {
  pinyin.value += letter.toLowerCase()
  refreshCandidates()
  // 已经不可能拼成任何音节/词组 -> 直接把这段当作普通字母落地
  if (!canContinuePinyin(pinyin.value)) {
    commitText(pinyin.value)
    pinyin.value = ''
    candidates.value = []
  }
}

function choose(c: Candidate) {
  commitText(c.text)
  if (props.learn) recordSelection(c.text)
  pinyin.value = getRemainingPinyin(pinyin.value, c)
  refreshCandidates()
}

/* ------------------------------------------------------------ 候选栏横滑 */
const candsEl = ref<HTMLElement | null>(null)
const candsDragging = ref(false)
/** 刚拖完的一次点击要忽略，否则会误选候选 */
let candsDragEndAt = 0
let candsStart = { x: 0, left: 0, moved: false }

/** 桌面用鼠标按住拖动；触摸屏交给原生滚动，避免两套手势打架 */
function onCandsDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const el = candsEl.value
  if (!el || el.scrollWidth <= el.clientWidth + 2) return
  candsStart = { x: e.clientX, left: el.scrollLeft, moved: false }
  candsDragging.value = true
  window.addEventListener('pointermove', onCandsMove, { passive: false })
  window.addEventListener('pointerup', onCandsUp)
  window.addEventListener('pointercancel', onCandsUp)
}

function onCandsMove(e: PointerEvent) {
  if (!candsDragging.value) return
  const el = candsEl.value
  if (!el) return
  const dx = e.clientX - candsStart.x
  if (Math.abs(dx) > 4) candsStart.moved = true
  if (candsStart.moved) {
    e.preventDefault()
    el.scrollLeft = candsStart.left - dx
  }
}

function onCandsUp() {
  candsDragging.value = false
  if (candsStart.moved) candsDragEndAt = Date.now()
  window.removeEventListener('pointermove', onCandsMove)
  window.removeEventListener('pointerup', onCandsUp)
  window.removeEventListener('pointercancel', onCandsUp)
}

/** 横向拖拽结束后紧跟的那次 click 不该选中候选 */
function onCandClick(c: Candidate) {
  if (Date.now() - candsDragEndAt < 150) return
  choose(c)
}

/* ------------------------------------------------------------ 展开全部候选 */
const expanded = ref(false)
/** 面板最大高度：键盘上方到视口顶部之间还剩多少空间 */
const panelMaxH = ref('50vh')

function measurePanelSpace() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return
  const top = root.getBoundingClientRect().top
  // 上方空间太少时给个下限，让面板至少能显示几行（多了就内部滚动）
  const available = Math.max(120, top - 12)
  panelMaxH.value = `${Math.round(Math.min(available, window.innerHeight * 0.5))}px`
}

function toggleExpand() {
  expanded.value = !expanded.value
  if (expanded.value) nextTick(measurePanelSpace)
}

function chooseExpanded(c: Candidate) {
  choose(c)
  if (!pinyin.value) expanded.value = false
}


/** 点击联想词：直接补到文本后面，并继续产出下一轮联想 */
function chooseAssoc(word: string) {
  commitText(word)
  if (props.learn) recordSelection(word)
  emit('key', { key: 'assoc', text: word })
}

function backspace() {
  if (pinyin.value) {
    pinyin.value = pinyin.value.slice(0, -1)
    refreshCandidates()
    return
  }
  const arr = toChars(text.value)
  if (arr.length) {
    arr.pop()
    text.value = arr.join('')
  }
}

function clearAll() {
  pinyin.value = ''
  candidates.value = []
  text.value = ''
}

function switchPanel(name: PanelName) {
  if (name === currentPanel.value) return
  // 锁定面板时禁止从键盘内部切走（外部 v-model:panel 不受影响）
  if (props.lockPanel) return
  commitComposing()
  currentPanel.value = name
  emit('update:panel', name)
}

function toggleLang() {
  commitComposing()
  currentLang.value = isZh.value ? 'en' : 'zh'
  shift.value = false
  caps.value = false
  emit('update:lang', currentLang.value)
}

/* ------------------------------------------------------------ 对外方法 */
function insert(s: string) {
  commitComposing()
  commitText(s)
}

/** 收起键盘 */
function close() {
  innerVisible.value = false
}

/* ------------------------------------------------------------ 按键分发 */
function handleKey(key: KeyDef) {
  if (key.disabled) return
  // 调整边框 / 设置态下键盘只作为背景可见，不接受输入，避免误触
  if (settingsMode.value) return
  const code = key.code

  if (code.startsWith('char:')) {
    const raw = key.label
    const shifted = key.shiftLabel ?? raw
    const isAsciiLetter = /^[a-z]$/.test(raw)
    const useUpper = shift.value !== caps.value

    let output: string
    if (isAsciiLetter) {
      output = useUpper ? raw.toUpperCase() : raw
      if (isZh.value) {
        pushLetter(raw)
      } else {
        commitComposing()
        commitText(output)
      }
    } else {
      // 中文模式下符号键优先输出中文标点（, -> ，  . -> 。）
      output = isZh.value ? shifted : useUpper ? shifted : raw
      commitComposing()
      commitText(output)
    }

    if (shift.value) shift.value = false
    emit('key', { key: code, text: output })
    return
  }

  switch (code) {
    case 'Backspace':
      backspace()
      break
    case 'Space':
      if (pinyin.value) commitComposing()
      else commitText(' ')
      break
    case 'Clear':
      clearAll()
      break
    case 'Enter':
      commitComposing()
      emit('confirm', text.value)
      innerVisible.value = false
      emit('close')
      break
    case 'Shift':
      shift.value = !shift.value
      break
    case 'Caps': {
      // 单击：临时大写（等同 Shift）；双击：锁定大写
      const now = Date.now()
      if (now - lastCapsAt < 350) {
        caps.value = !caps.value
        shift.value = false
      } else if (caps.value) {
        caps.value = false
        shift.value = false
      } else {
        shift.value = !shift.value
      }
      lastCapsAt = now
      break
    }
    case 'Language':
      toggleLang()
      break
    case 'toLetters':
      switchPanel('letters')
      break
    case 'toNumbers':
      switchPanel('numbers')
      break
    case 'toSymbols':
      switchPanel('symbols')
      break
    case 'toDigits':
      switchPanel('digits')
      break
    default:
      break
  }

  emit('key', { key: code, text: '' })
}

/** 按键显示文案（随语言 / 大小写变化） */
function keyLabel(key: KeyDef): string {
  if (key.code === 'Language') return '中/英'
  if (key.code === 'Enter') return props.enterText
  if (key.code === 'Space') return isZh.value ? '空格' : 'space'
  const isAsciiLetter = /^[a-z]$/.test(key.label)
  if (!isAsciiLetter) {
    return isZh.value ? (key.shiftLabel ?? key.label) : key.label
  }
  const useUpper = shift.value !== caps.value
  return useUpper ? key.label.toUpperCase() : key.label
}

function isActive(key: KeyDef): boolean {
  return (
    ((key.code === 'Caps') && (caps.value || shift.value)) ||
    (key.code === 'Language' && !isZh.value)
  )
}

function spanOf(key: KeyDef): number {
  return Math.round((key.flex ?? 1) * 2)
}

/* ------------------------------------------------------------ 设置模式与尺寸 */
const settingsMode = ref(false)
/** 调整边框：设置模式下的二级开关，打开后才出现虚框与四周缩放手柄 */
const resizeMode = ref(false)
const resizing = ref(false)
const innerTheme = ref<'light' | 'dark'>(props.theme)
const innerDraggable = ref(props.draggable)

const MIN_SCALE = 0.75
const MAX_SCALE = 1.5
/** 键盘缩放比例，1 = 默认大小；高度通过它间接控制 */
const scale = ref(1)
/** 自定义宽度（px），null 表示默认 100% / maxWidth */
const customWidth = ref<number | null>(null)
/** 自定义左边距（px），null 表示水平居中 */
const customLeft = ref<number | null>(null)

/** 宽高相对视口的上下限 */
const MIN_W_RATIO = 0.4
const MAX_W_RATIO = 0.98
const MIN_H_RATIO = 0.26
const MAX_H_RATIO = 0.86

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type ResizeDir = (typeof RESIZE_DIRS)[number]

/** 边框可调（设置模式 + 调整边框开关同时打开） */
const canResize = computed(() => settingsMode.value && resizeMode.value)

const cardEl = ref<HTMLElement | null>(null)

/**
 * 卡片在吸底小高度下会滚动，而「调整边框」是最后一行，
 * 不滚到底用户看不到也点不到，所以打开设置后贴到底部。
 */
function scrollCardToEnd() {
  const el = cardEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(settingsMode, (on) => {
  if (on) nextTick(scrollCardToEnd)
})

/** 调整边框开关：打开后整张设置卡片隐藏，只留居中操作按钮 */
function toggleResizeMode() {
  if (resizing.value) return
  resizeMode.value = !resizeMode.value
  if (resizeMode.value) {
    // 结束可能进行中的拖动，但保留 dragOffset：fixed 的纵向位置就靠它，
    // 清掉会让键盘瞬间掉回屏幕底部。横向则固化进 customLeft，避免与 left 重复叠加。
    endDragIfAny()
    syncLeftFromRect()
  }
}

let rzStart = { x: 0, y: 0, w: 0, h: 0, scale: 1, offset: 0, maxOffset: 0 }
let rzDir: ResizeDir = 'n'

const STORAGE_KEY = 'xh-virtual-keyboard-settings'

watch(
  () => props.theme,
  (v) => {
    if (v !== innerTheme.value) innerTheme.value = v
  }
)

watch(
  () => props.draggable,
  (v) => {
    if (v !== innerDraggable.value) innerDraggable.value = v
  }
)

function loadSettings() {
  if (!props.persistSettings || typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as {
      theme?: string
      scale?: number
      draggable?: boolean
      width?: number | null
      left?: number | null
    }
    if (saved.theme === 'light' || saved.theme === 'dark') innerTheme.value = saved.theme
    if (typeof saved.scale === 'number') {
      scale.value = clampNum(saved.scale, MIN_SCALE, MAX_SCALE)
    }
    if (typeof saved.width === 'number') customWidth.value = saved.width
    if (typeof saved.left === 'number') customLeft.value = saved.left
    if (typeof saved.draggable === 'boolean') innerDraggable.value = saved.draggable
  } catch {
    /* 忽略损坏的本地存储 */
  }
}

function saveSettings() {
  if (!props.persistSettings || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: innerTheme.value,
        scale: scale.value,
        draggable: innerDraggable.value,
        width: customWidth.value,
        left: customLeft.value
      })
    )
  } catch {
    /* 隐私模式下可能不可写 */
  }
}

/** 进入 / 退出设置模式（整块切换，不是顶部展开） */
function toggleSettings() {
  expanded.value = false
  settingsMode.value = !settingsMode.value
  // 每次进出设置都重置"调整边框"，避免下次一进设置就处于可拖状态
  resizeMode.value = false
  if (settingsMode.value) {
    // 进入设置时若还在拖动先收尾；保留 dragOffset，fixed 的纵向位置依赖它
    endDragIfAny()
  } else {
    // 退出设置模式回到居中吸底，宽度自定义保留
    customLeft.value = null
  }
  saveSettings()
}

function setTheme(t: 'light' | 'dark') {
  if (innerTheme.value === t) return
  innerTheme.value = t
  emit('update:theme', t)
  saveSettings()
}

function toggleDraggable() {
  innerDraggable.value = !innerDraggable.value
  if (!innerDraggable.value) dragOffset.value = { x: 0, y: 0 }
  saveSettings()
}

/** 恢复默认大小 */
function resetSize() {
  customWidth.value = null
  customLeft.value = null
  scale.value = 1
  saveSettings()
}

/* ------------------------------------------------------------ 拖边框调尺寸 */
/**
 * 左边缘的"偏移基准"：
 * - fixed：视口坐标 left，但要扣掉 transform 拖动的横向位移，
 *          因为 left 控制的是"本体位置"，视觉位置 = left + dragX
 * - inline：margin-left（相对父容器），否则 left 对 relative 定位只是视觉位移，会溢出容器
 */
function readOffset(): { offset: number; maxOffset: number } {
  const el = rootEl.value
  if (!el) return { offset: 0, maxOffset: window.innerWidth }
  if (props.position === 'fixed') {
    return {
      offset: el.getBoundingClientRect().left - dragOffset.value.x,
      maxOffset: window.innerWidth
    }
  }
  const margin = parseFloat(getComputedStyle(el).marginLeft) || 0
  return { offset: margin, maxOffset: el.parentElement?.clientWidth ?? window.innerWidth }
}

function onResizeStart(dir: ResizeDir, e: PointerEvent) {
  const el = rootEl.value
  if (!el) return
  e.preventDefault()
  e.stopPropagation()
  const rect = el.getBoundingClientRect()
  const { offset, maxOffset } = readOffset()
  resizing.value = true
  rzDir = dir
  rzStart = {
    x: e.clientX,
    y: e.clientY,
    w: rect.width,
    h: rect.height,
    scale: scale.value,
    offset,
    maxOffset
  }
  window.addEventListener('pointermove', onResizeMove, { passive: false })
  window.addEventListener('pointerup', onResizeEnd)
  window.addEventListener('pointercancel', onResizeEnd)
}

function onResizeMove(e: PointerEvent) {
  if (!resizing.value) return
  e.preventDefault()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const dx = e.clientX - rzStart.x
  const dy = e.clientY - rzStart.y

  // ---- 宽度：东西方向，左右独立跟手
  let width = rzStart.w
  let offset = rzStart.offset
  if (rzDir.includes('e')) width = rzStart.w + dx
  if (rzDir.includes('w')) {
    width = rzStart.w - dx
    offset = rzStart.offset + dx
  }
  const minW = vw * MIN_W_RATIO
  const maxW = vw * MAX_W_RATIO
  width = clampNum(width, minW, maxW)

  if (rzDir.includes('w')) {
    // 往左拖：右边缘保持不动，左边缘不能越过容器左边
    const right = rzStart.offset + rzStart.w
    offset = clampNum(offset, 0, Math.max(0, right - width))
    width = Math.min(width, right)
  } else if (rzDir.includes('e')) {
    // 往右拖：左边缘保持不动，右边缘不能越过容器右边
    width = Math.min(width, rzStart.maxOffset - rzStart.offset)
  } else {
    // 只拖上下时宽度靠缩放间接变化，保证整体仍留在容器内
    offset = clampNum(offset, 0, Math.max(0, rzStart.maxOffset - width))
  }
  width = Math.max(width, minW)
  offset = Math.max(0, offset)

  // ---- 高度：底部固定，通过缩放基准字号实现
  const baseHeight = rzStart.h / rzStart.scale
  let targetHeight = rzStart.h
  if (rzDir.includes('n')) targetHeight = rzStart.h - dy
  if (rzDir.includes('s')) targetHeight = rzStart.h + dy
  targetHeight = clampNum(targetHeight, vh * MIN_H_RATIO, vh * MAX_H_RATIO)
  const nextScale = clampNum(targetHeight / baseHeight, MIN_SCALE, MAX_SCALE)

  customWidth.value = Math.round(width)
  customLeft.value = Math.round(offset)
  scale.value = Math.round(nextScale * 100) / 100
}

function onResizeEnd(e: PointerEvent) {
  if (!resizing.value) return
  resizing.value = false
  try {
    ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
  saveSettings()
}

/* ------------------------------------------------------------ 拖动定位 */
const rootEl = ref<HTMLElement | null>(null)
/** 相对默认吸底位置的偏移（px 由浏览器实时计算，不写死在样式里） */
const dragOffset = ref({ x: 0, y: 0 })
const dragging = ref(false)
let dragStart = { x: 0, y: 0, baseX: 0, baseY: 0 }
let dragBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }

function clampNum(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/**
 * 计算拖动偏移（dragOffset）的允许范围。
 *
 * 以「视觉左 / 上边缘」为准，用 min/max 统一表达两种情形：
 *   键盘不超视口：左边缘 ∈ [0, 视口 - 键盘]，整体始终留在视口内；
 *   键盘超出视口：左边缘 ∈ [视口 - 键盘, 0]，允许负偏移，横向平移就能看到被裁掉的部分。
 *
 * 若一律按"整体留在视口内"计算，键盘比视口宽时会出现 minX > maxX，
 * clampNum 会把偏移恒定钳在同一个值上 —— 键盘彻底拖不动（宽度同理适用于纵向）。
 */
function calcDragBounds(rect: DOMRect, ox: number, oy: number) {
  const baseLeft = rect.left - ox
  const baseTop = rect.top - oy
  const roomX = window.innerWidth - rect.width
  const roomY = window.innerHeight - rect.height
  return {
    minX: Math.min(0, roomX) - baseLeft,
    maxX: Math.max(0, roomX) - baseLeft,
    minY: Math.min(0, roomY) - baseTop,
    maxY: Math.max(0, roomY) - baseTop
  }
}

/**
 * 是否可以拖动（内部开关 + 仅 fixed 模式）
 * 设置 / 调整边框态下必须禁用：那时位置由 customLeft + 缩放共同决定，
 * 再叠一层 transform 位移会和 left 互相干扰，导致拖动后调尺寸、调完再拖时组件乱跑。
 */
const canDrag = computed(
  () => innerDraggable.value && props.position === 'fixed' && !settingsMode.value
)

function onDragStart(e: PointerEvent) {
  if (!canDrag.value) return
  const el = rootEl.value
  if (!el) return
  e.preventDefault()
  dragging.value = true

  const rect = el.getBoundingClientRect()
  const ox = dragOffset.value.x
  const oy = dragOffset.value.y
  dragStart = { x: e.clientX, y: e.clientY, baseX: ox, baseY: oy }
  // 超宽 / 超高时允许负偏移平移，保证键盘比视口大也照样能左右、上下移动
  dragBounds = calcDragBounds(rect, ox, oy)

  // 指针捕获失败时（合成事件 / 老浏览器）靠 window 监听兜底
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
  emit('dragstart')
}

function onDragMove(e: PointerEvent) {
  if (!dragging.value) return
  e.preventDefault()
  dragOffset.value = {
    x: clampNum(dragStart.baseX + (e.clientX - dragStart.x), dragBounds.minX, dragBounds.maxX),
    y: clampNum(dragStart.baseY + (e.clientY - dragStart.y), dragBounds.minY, dragBounds.maxY)
  }
}

function onDragEnd(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  try {
    ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  emit('dragend', { ...dragOffset.value })
}

/** 双击把手：复位到默认吸底位置 */
function resetPosition() {
  dragOffset.value = { x: 0, y: 0 }
  emit('dragend', { x: 0, y: 0 })
}

/** 若正在拖动则立即结束（进入设置 / 调整边框时调用），避免残留监听与位移 */
function endDragIfAny() {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

/**
 * 把组件当前位置固化到 customLeft（供调整边框使用）。
 * fixed 下 rect.left 含 transform 拖动位移，必须扣掉 dragX：
 * left 管本体位置，视觉位置 = left + dragX，两者叠加不能重复计算。
 */
function syncLeftFromRect() {
  const el = rootEl.value
  if (!el) return
  if (props.position === 'fixed') {
    customLeft.value = Math.round(el.getBoundingClientRect().left - dragOffset.value.x)
  } else {
    // inline 的位移量就是 margin-left，直接用计算值，left 会溢出容器不能用
    customLeft.value = Math.round(parseFloat(getComputedStyle(el).marginLeft) || 0)
  }
}

/** 视口变化时把键盘位置和展开面板高度都重新校正 */
function onWindowResize() {
  clampPositionToViewport()
  if (expanded.value) measurePanelSpace()
}

function clampPositionToViewport() {
  const el = rootEl.value
  if (!el) return
  const ox = dragOffset.value.x
  const oy = dragOffset.value.y
  if (!ox && !oy) return
  const rect = el.getBoundingClientRect()
  // 与 onDragStart 共用同一套边界：超宽时保留可平移范围，不会把位置钳死
  const b = calcDragBounds(rect, ox, oy)
  dragOffset.value = {
    x: clampNum(ox, b.minX, b.maxX),
    y: clampNum(oy, b.minY, b.maxY)
  }
}

onMounted(() => {
  setLearningPersistence(props.persistLearn)
  loadSettings()
  window.addEventListener('resize', onWindowResize, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})

/** 候选栏空白处也可以按住拖动（按钮区域除外，避免误触） */
function onBarPointerDown(e: PointerEvent) {
  if (!canDrag.value) return
  const target = e.target as HTMLElement | null
  if (target && target.closest('button')) return
  onDragStart(e)
}

const dragTransform = computed(() => {
  const { x, y } = dragOffset.value
  return x || y ? `translate3d(${x}px, ${y}px, 0)` : undefined
})

const rootStyle = computed(() => {
  const style: Record<string, string | undefined> = {
    maxWidth: props.maxWidth,
    zIndex: String(props.zIndex),
    transform: dragTransform.value,
    '--vk-scale': String(scale.value)
  }
  if (customWidth.value) {
    style.width = `${customWidth.value}px`
    style.maxWidth = 'none'
  }
  // 调整边框时固定左边缘，左右边缘才能独立跟手
  if (canResize.value && customLeft.value !== null) {
    if (props.position === 'fixed') {
      style.left = `${customLeft.value}px`
      style.right = 'auto'
      style.marginLeft = '0'
      style.marginRight = '0'
    } else {
      // inline 是 relative 定位，left 只会造成视觉位移并溢出容器，必须用 margin
      style.marginLeft = `${customLeft.value}px`
      style.marginRight = '0'
    }
  }
  return style
})

/** 仅 fixed 定位才 teleport，避免 inline 模式改变布局位置 */
const canTeleport = computed(
  () => props.teleport && props.position === 'fixed' && typeof document !== 'undefined'
)

defineExpose({
  insert,
  backspace,
  clear: clearAll,
  commitComposing,
  close,
  resetPosition,
  resetSize
})
</script>

<template>
  <Teleport to="body" :disabled="!canTeleport">
    <Transition name="vk-fade">
      <div
        v-if="innerVisible"
        ref="rootEl"
        v-bind="restAttrs"
        class="vk-root"
        :class="[
          `vk-theme-${innerTheme}`,
          position === 'fixed' ? 'vk-root--fixed' : 'vk-root--inline',
          {
            'vk-root--dragging': dragging,
            'vk-root--settings': settingsMode,
            'vk-root--resize': resizeMode,
            'vk-root--resizing': resizing,
            'vk-root--expanded': expanded
          },
          attrs.class
        ]"
        :style="[attrs.style, rootStyle]"
        role="application"
        aria-label="虚拟键盘"
      >
        <!-- 候选栏 -->
        <div
          v-if="showCandidates || canDrag || showSettings"
          class="vk-bar"
          @pointerdown="onBarPointerDown"
        >
          <button
            v-if="canDrag"
            type="button"
            class="vk-drag"
            :class="{ 'is-dragging': dragging }"
            aria-label="拖动键盘，双击复位"
            title="按住任意空白处可拖动，双击复位"
            @pointerdown.stop="onDragStart"
            @dblclick="resetPosition"
          >
            <svg viewBox="0 0 10 16" aria-hidden="true">
              <circle cx="3" cy="3" r="1.2" />
              <circle cx="7" cy="3" r="1.2" />
              <circle cx="3" cy="8" r="1.2" />
              <circle cx="7" cy="8" r="1.2" />
              <circle cx="3" cy="13" r="1.2" />
              <circle cx="7" cy="13" r="1.2" />
            </svg>
          </button>
          <div v-if="showCandidates" class="vk-compose" :class="{ 'vk-compose--idle': !pinyin }">
            <template v-if="pinyin">{{ pinyin }}</template>
            <template v-else>{{ composeHint }}</template>
          </div>
          <div
            v-if="showCandidates"
            ref="candsEl"
            class="vk-cands"
            :class="{ 'is-dragging': candsDragging }"
            @pointerdown="onCandsDown"
          >
            <template v-if="pinyin">
              <button
                v-for="(c, i) in candidates"
                :key="`${c.text}-${i}`"
                type="button"
                class="vk-cand"
                :class="{ 'vk-cand--word': c.type === 'word' }"
                @click="onCandClick(c)"
              >
                {{ c.text }}
              </button>
              <span v-if="!candidates.length" class="vk-cands__empty">
                继续输入…
              </span>
            </template>
            <template v-else-if="assocList.length">
              <button
                v-for="w in assocList"
                :key="`assoc-${w}`"
                type="button"
                class="vk-cand vk-cand--assoc"
                @click="chooseAssoc(w)"
              >
                {{ w }}
              </button>
            </template>
          </div>
          <button
            v-if="showSettings && pinyin"
            type="button"
            class="vk-settings vk-settings--toggle"
            :class="{ 'is-open': expanded }"
            :aria-label="expanded ? '收起候选' : '展开全部候选'"
            :title="expanded ? '收起候选' : '展开全部候选'"
            @click="toggleExpand"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 9.5 12 15.5 18 9.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            v-else-if="showSettings"
            type="button"
            class="vk-settings"
            :class="{ 'is-open': settingsMode }"
            aria-label="设置"
            title="设置"
            @click="toggleSettings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="4.4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              />
              <path
                d="M12 6V1.8M12 18v4.2M6 12H1.8M18 12h4.2M7.76 16.24L4.79 19.21M16.24 16.24l2.97 2.97M16.24 7.76l2.97-2.97M7.76 7.76L4.79 4.79"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <!-- 展开的全部候选 -->
        <Transition name="vk-cand-panel">
          <div
            v-if="expanded && candidates.length"
            class="vk-cand-panel"
            :style="{ '--vk-panel-max-h': panelMaxH }"
          >
            <div class="vk-cand-panel__head">
              <span class="vk-cand-panel__title">
                <b>{{ pinyin }}</b>
                <span class="vk-cand-panel__count">{{ candidates.length }} 个候选</span>
              </span>
              <button
                type="button"
                class="vk-cand-panel__close"
                aria-label="收起"
                @click="expanded = false"
              >
                收起
              </button>
            </div>
            <div class="vk-cand-panel__list">
              <button
                v-for="(c, i) in candidates"
                :key="`p-${c.text}-${i}`"
                type="button"
                class="vk-cand-panel__item"
                :class="{ 'is-word': c.type === 'word' }"
                @click="chooseExpanded(c)"
              >
                {{ c.text }}
              </button>
            </div>
          </div>
        </Transition>

        <!-- 设置模式：内部蒙版 + 设置卡片（「调整边框」打开时收起卡片，露出可拖边框） -->
        <Transition name="vk-panel">
          <div
            v-if="settingsMode && !resizeMode"
            class="vk-settings-overlay"
            @click.self="toggleSettings"
          >
            <div ref="cardEl" class="vk-settings-card" role="dialog" aria-label="键盘设置">
              <!-- 头部：图标 + 标题 + 说明 -->
              <div class="vk-set-head">
                <span class="vk-set-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                    />
                    <path
                      d="M12 6V3.6M12 20.4V18M6 12H3.6M20.4 12H18M7.76 16.24 6.06 17.94M17.94 6.06l-1.7 1.7M16.24 7.76l1.7-1.7M6.06 6.06l1.7 1.7"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <div class="vk-set-heading">
                  <span class="vk-set-title">键盘设置</span>
                </div>
              </div>

              <!-- 设置项 -->
              <div class="vk-set-list">
                <div class="vk-set-row">
                  <span class="vk-set-label">主题</span>
                  <div class="vk-seg">
                    <button
                      type="button"
                      :class="{ 'is-on': innerTheme === 'light' }"
                      @click="setTheme('light')"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                        <path
                          d="M12 4.4V2.6M12 21.4v-1.8M4.4 12H2.6M21.4 12h-1.8M6.6 17.4l-1.3 1.3M18.7 5.3l-1.3 1.3M17.4 17.4l1.3 1.3M5.3 5.3l1.3 1.3"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linecap="round"
                        />
                      </svg>
                      浅色
                    </button>
                    <button
                      type="button"
                      :class="{ 'is-on': innerTheme === 'dark' }"
                      @click="setTheme('dark')"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M20.6 14.6A8.6 8.6 0 1 1 9.4 3.4a6.9 6.9 0 0 0 11.2 11.2Z"
                          fill="currentColor"
                        />
                      </svg>
                      深色
                    </button>
                  </div>
                </div>

                <div class="vk-set-row">
                  <span class="vk-set-label">拖动</span>
                  <div class="vk-set-ctrl">
                    <span v-if="position !== 'fixed'" class="vk-set-note">仅吸底</span>
                    <button
                      type="button"
                      class="vk-switch"
                      :class="{ 'is-on': innerDraggable, 'is-disabled': position !== 'fixed' }"
                      role="switch"
                      :aria-checked="innerDraggable"
                      :disabled="position !== 'fixed'"
                      @click="toggleDraggable"
                    >
                      <span class="vk-switch__dot" />
                    </button>
                  </div>
                </div>

                <div class="vk-set-row">
                  <span class="vk-set-label">调整边框</span>
                  <div class="vk-set-ctrl">
                    <span v-if="!resizeMode" class="vk-set-note">开启后可拖</span>
                    <button
                      type="button"
                      class="vk-switch"
                      :class="{ 'is-on': resizeMode }"
                      role="switch"
                      :aria-checked="resizeMode"
                      title="开启后卡片收起，拖动四周/四角即可调整键盘大小"
                      @click="toggleResizeMode"
                    >
                      <span class="vk-switch__dot" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- 调整边框模式：键盘保持可见，只浮一层轻量操作条 -->
        <Transition name="vk-panel">
          <div v-if="canResize" class="vk-rz-layer">
            <div class="vk-rz-actions">
              <button type="button" class="vk-step" @click="resetSize">默认大小</button>
              <button type="button" class="vk-step vk-step--primary" @click="toggleResizeMode">
                完成调整
              </button>
            </div>

            <p class="vk-rz-tip">拖动四周边框调整大小 · 点「完成调整」退出</p>
          </div>
        </Transition>

        <!-- 四周缩放手柄（仅在"调整边框"打开后渲染） -->
        <template v-if="canResize">
          <div
            v-for="dir in RESIZE_DIRS"
            :key="dir"
            :class="['vk-rz', `vk-rz--${dir}`, { 'is-resizing': resizing }]"
            @pointerdown="onResizeStart(dir, $event)"
          />
        </template>

        <!-- 键区 -->
        <div class="vk-body" :class="{ 'vk-body--grid3': panelDef.compactGrid }">
          <div
            v-for="(row, ri) in panelDef.rows"
            :key="ri"
            class="vk-row"
            :class="{
              'vk-row--inset': panelDef.name === 'letters' && ri === 1
            }"
          >
            <button
              v-for="key in row"
              :key="key.code + key.label"
              type="button"
              class="vk-key"
              :class="[
                key.variant ? `vk-key--${key.variant}` : '',
                { 'is-active': isActive(key), 'is-disabled': key.disabled }
              ]"
              :style="{ gridColumn: `span ${spanOf(key)}` }"
              :disabled="key.disabled"
              @click="handleKey(key)"
            >
              <span class="vk-key__label">{{ keyLabel(key) }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.vk-root {
  position: relative;
  --vk-bg: #d3d6db;
  --vk-key-bg: #ffffff;
  --vk-key-color: #101828;
  --vk-key-fn-bg: #b6bcc6;
  --vk-key-fn-color: #101828;
  --vk-key-accent-bg: #1677ff;
  --vk-key-accent-color: #ffffff;
  --vk-bar-bg: #f7f8fa;
  --vk-bar-color: #101828;
  --vk-bar-muted: #98a2b3;

  /* 设置面板专用 */
  --vk-set-surface: #ffffff;
  --vk-set-divider: rgba(16, 24, 40, 0.08);
  --vk-set-soft: rgba(16, 24, 40, 0.055);
  --vk-set-soft-hover: rgba(16, 24, 40, 0.1);
  --vk-set-chip-on: #ffffff;
  --vk-set-accent-soft: rgba(22, 119, 255, 0.12);
  --vk-set-switch-off: rgba(16, 24, 40, 0.16);
  --vk-set-muted: #667085;

  /* 遮罩：设置面板与调整边框共用同一层暗色 */
  --vk-mask: rgba(8, 12, 20, 0.55);

  /* 尺寸统一用 em 表达，基准字号由下面的 clamp 随视口自适应，全程不使用 px */
  --vk-key-height: 2.7em;
  --vk-gap: 0.36em;
  --vk-radius: 0.5em;
  --vk-font-size: 1em;
  --vk-shadow: 0 -0.12em 1.1em rgba(16, 24, 40, 0.12);

  box-sizing: border-box;
  width: 100%;
  /* 窄屏约 14px，桌面约 17px；--vk-scale 由设置面板的拉伸功能控制 */
  font-size: calc(clamp(0.875rem, 0.55rem + 1.5vw, 1.0625rem) * var(--vk-scale, 1));
  background: var(--vk-bg);
  color: var(--vk-key-color);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei',
    'Helvetica Neue', Arial, sans-serif;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.vk-root *,
.vk-root *::before,
.vk-root *::after {
  box-sizing: border-box;
}

.vk-root--fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0 auto;
  border-radius: 0.85em 0.85em 0 0;
  box-shadow: var(--vk-shadow);
  padding-bottom: env(safe-area-inset-bottom, 0);
  transition: box-shadow 0.15s ease;
}

.vk-root--fixed.vk-root--dragging {
  box-shadow: 0 0.2em 1.6em rgba(16, 24, 40, 0.28);
  transition: none;
}

.vk-root--inline {
  border-radius: 0.7em;
  overflow: hidden;
}

/* ---------------------------------------------------------- 主题 */
.vk-theme-dark {
  --vk-bg: #22242a;
  --vk-key-bg: #3d4048;
  --vk-key-color: #f2f4f7;
  --vk-key-fn-bg: #5a5e68;
  --vk-key-fn-color: #f2f4f7;
  --vk-key-accent-bg: #3b82f6;
  --vk-key-accent-color: #ffffff;
  --vk-bar-bg: #191b20;
  --vk-bar-color: #f2f4f7;
  --vk-bar-muted: #6b7280;
  --vk-shadow: 0 -0.12em 1.1em rgba(0, 0, 0, 0.45);

  /* 设置面板专用：深色下要提亮，否则文字糊在一起 */
  --vk-set-surface: #32353d;
  --vk-set-divider: rgba(255, 255, 255, 0.09);
  --vk-set-soft: rgba(255, 255, 255, 0.08);
  --vk-set-soft-hover: rgba(255, 255, 255, 0.14);
  --vk-set-chip-on: rgba(255, 255, 255, 0.16);
  --vk-set-accent-soft: rgba(59, 130, 246, 0.2);
  --vk-set-switch-off: rgba(255, 255, 255, 0.2);
  --vk-set-muted: #9aa3af;
}

/* ---------------------------------------------------------- 候选栏 */
.vk-bar {
  display: flex;
  align-items: center;
  gap: 0.45em;
  min-height: 2.4em;
  padding: 0.32em 0.5em;
  background: var(--vk-bar-bg);
  border-bottom: 0.06em solid rgba(0, 0, 0, 0.06);
}

/* 拖动把手 */
.vk-drag {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5em;
  height: 1.9em;
  padding: 0;
  border: none;
  border-radius: 0.4em;
  background: transparent;
  color: var(--vk-bar-muted);
  cursor: grab;
  touch-action: none;
  transition: color 0.12s ease, background-color 0.12s ease;
}

.vk-drag:hover {
  color: var(--vk-key-accent-bg);
  background: rgba(22, 119, 255, 0.08);
}

.vk-drag:active,
.vk-drag.is-dragging {
  cursor: grabbing;
  color: var(--vk-key-accent-bg);
  background: rgba(22, 119, 255, 0.15);
}

.vk-drag svg {
  display: block;
  width: 0.62em;
  height: 1em;
  fill: currentColor;
}

.vk-compose {
  flex: 0 0 auto;
  max-width: 40%;
  padding: 0.22em 0.6em;
  font-size: 0.9em;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--vk-bar-color);
  background: rgba(22, 119, 255, 0.12);
  border-radius: 0.45em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vk-compose--idle {
  color: var(--vk-bar-muted);
  background: transparent;
  font-weight: 400;
  letter-spacing: 0;
}

.vk-cands {
  display: flex;
  align-items: center;
  gap: 0.28em;
  flex: 1 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
}

/* 候选栏横滑：桌面可按住拖动，触摸屏走原生滚动 */
.vk-cands {
  cursor: grab;
}

.vk-cands.is-dragging {
  cursor: grabbing;
}

/* 拖动过程中不要让候选吃掉指针事件，否则会误触 */
.vk-cands.is-dragging .vk-cand {
  pointer-events: none;
}

/* 有候选时右侧按钮是下箭头，展开时翻转朝上 */
.vk-settings--toggle.is-open {
  transform: rotate(180deg);
}

/* ---------------------------------------------------------- 展开的全部候选 */
/* 展开面板在键盘上方弹出，键盘保持可见可继续打字。
   max-height 由 JS 按"键盘顶部到视口顶部还剩多少空间"算出。 */
.vk-root--inline.vk-root--expanded {
  /* 面板跑到键盘外面，不能被 inline 的圆角裁掉 */
  overflow: visible;
}

.vk-cand-panel {
  position: absolute;
  left: 0.3em;
  right: 0.3em;
  bottom: 100%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  max-height: var(--vk-panel-max-h, 50vh);
  margin-bottom: 0.3em;
  border-radius: 0.75em;
  background: var(--vk-set-surface);
  box-shadow: 0 0.4em 1.4em rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.vk-cand-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  padding: 0.55em 0.75em;
  border-bottom: 0.06em solid var(--vk-set-divider);
}

.vk-cand-panel__title {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  min-width: 0;
  font-size: 0.85em;
  color: var(--vk-set-muted);
}

.vk-cand-panel__title b {
  overflow: hidden;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--vk-key-color);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vk-cand-panel__count {
  flex: 0 0 auto;
  font-size: 0.9em;
}

.vk-cand-panel__close {
  flex: 0 0 auto;
  padding: 0.25em 0.55em;
  border: none;
  border-radius: 0.35em;
  background: var(--vk-set-soft);
  color: var(--vk-key-color);
  font-size: 0.75em;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
}

.vk-cand-panel__close:hover {
  background: var(--vk-set-soft-hover);
}

.vk-cand-panel__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.1em, 1fr));
  align-content: start;
  gap: 0.25em;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0.5em;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.vk-cand-panel__item {
  padding: 0.5em 0.2em;
  border: none;
  border-radius: 0.4em;
  background: transparent;
  color: var(--vk-key-color);
  font-size: 1em;
  font-family: inherit;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.vk-cand-panel__item:hover {
  background: rgba(22, 119, 255, 0.1);
}

/* 滚动条：细一些，和整体风格一致（这里不隐藏，要让人看出能滚） */
.vk-cand-panel__list::-webkit-scrollbar {
  width: 0.32em;
}

.vk-cand-panel__list::-webkit-scrollbar-thumb {
  border-radius: 1em;
  background: var(--vk-set-switch-off);
}

.vk-cand-panel__list::-webkit-scrollbar-track {
  background: transparent;
}

.vk-cand-panel__item.is-word {
  font-weight: 600;
  color: var(--vk-key-accent-bg);
}

.vk-cand-panel-enter-active,
.vk-cand-panel-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.vk-cand-panel-enter-from,
.vk-cand-panel-leave-to {
  opacity: 0;
  transform: translateY(0.4em);
}

.vk-cands::-webkit-scrollbar {
  display: none;
}

.vk-cand {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.3em;
  height: 2.2em;
  padding: 0 0.65em;
  border: none;
  border-radius: 0.45em;
  background: transparent;
  color: var(--vk-bar-color);
  font-size: 0.95em;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.vk-cand:hover {
  background: rgba(22, 119, 255, 0.1);
}

.vk-cand:active {
  background: rgba(22, 119, 255, 0.2);
}

.vk-cand--word {
  font-weight: 600;
}

/* 联想词：和"正在输入的候选"做视觉区分 */
.vk-cand--assoc {
  border: 0.06em dashed rgba(22, 119, 255, 0.35);
  opacity: 0.92;
}

.vk-cand--assoc:hover {
  border-color: rgba(22, 119, 255, 0.8);
  background: rgba(22, 119, 255, 0.08);
}

.vk-cands__empty {
  flex: 0 0 auto;
  padding: 0 0.5em;
  font-size: 0.82em;
  color: var(--vk-bar-muted);
  white-space: nowrap;
}

/* ---------------------------------------------------------- 设置按钮 / 面板 */
.vk-settings {
  position: relative;
  z-index: 4;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.9em;
  height: 1.9em;
  padding: 0;
  border: none;
  border-radius: 0.4em;
  background: transparent;
  color: var(--vk-bar-muted);
  cursor: pointer;
  transition: color 0.12s ease, background-color 0.12s ease, transform 0.25s ease,
    opacity 0.15s ease;
}

.vk-settings:hover {
  color: var(--vk-key-accent-bg);
  background: rgba(22, 119, 255, 0.08);
}

.vk-settings.is-open {
  color: var(--vk-key-accent-bg);
  background: rgba(22, 119, 255, 0.14);
  transform: rotate(60deg);
}

.vk-settings svg {
  display: block;
  width: 1em;
  height: 1em;
}

/* ---------------------------------------------------------- 设置模式 */
/* 普通设置模式：只做轻微内描边，提示"正在设置"，不可拖 */
.vk-root--settings {
  overflow: visible;
}

/* 调整边框模式：实感虚线框 + 手柄 */
.vk-root--resize {
  outline: 0.12em dashed var(--vk-key-accent-bg);
  outline-offset: -0.12em;
}

/* 设置模式下齿轮会浮在卡片边缘，视觉冲突；退出方式改为点空白处 */
.vk-root--settings .vk-settings {
  opacity: 0;
  pointer-events: none;
}

/* 内部蒙版：压暗键盘本体，让设置内容聚焦 */
.vk-settings-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.7em;
  background: var(--vk-mask);
}

/* 卡片高度受键盘组件约束：组件过窄/过矮时内容整体可滚动，避免底部被裁掉。
   滚动条隐藏（内容仍可滚），避免侧边出现细条破坏卡片外观 */
.vk-settings-card {
  display: flex;
  flex-direction: column;
  width: min(100%, 24em);
  max-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  border-radius: 0.9em;
  background: var(--vk-set-surface);
  color: var(--vk-key-color);
  box-shadow: 0 0.6em 1.8em rgba(0, 0, 0, 0.38);
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* 旧 Edge */
}

.vk-settings-card::-webkit-scrollbar {
  display: none; /* Chrome / Safari */
}

/* 头部与设置项保持自然高度，不被 flex 压扁；超出部分交给卡片滚动 */
.vk-set-head {
  flex: 0 0 auto;
}

.vk-set-list {
  flex: 1 0 auto;
}

/* ---------------- 头部 ---------------- */
.vk-set-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.65em;
  padding: 0.85em 0.95em 0.75em;
  background: var(--vk-set-surface);
}

.vk-set-badge {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2.1em;
  height: 2.1em;
  border-radius: 0.55em;
  background: var(--vk-set-accent-soft);
  color: var(--vk-key-accent-bg);
}

.vk-set-badge svg {
  display: block;
  width: 1.15em;
  height: 1.15em;
}

.vk-set-heading {
  display: flex;
  flex-direction: column;
  gap: 0.16em;
  min-width: 0;
}

.vk-set-title {
  font-size: 0.95em;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.01em;
}

.vk-set-sub {
  font-size: 0.72em;
  line-height: 1.3;
  color: var(--vk-set-muted);
}

/* ---------------- 设置项 ---------------- */
.vk-set-list {
  display: flex;
  flex-direction: column;
  padding: 0 0.95em;
  border-top: 0.06em solid var(--vk-set-divider);
}

.vk-set-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6em;
  min-height: 2.9em;
  padding: 0.3em 0;
}

.vk-set-row + .vk-set-row {
  border-top: 0.06em solid var(--vk-set-divider);
}

.vk-set-label {
  flex: 0 0 auto;
  font-size: 0.86em;
  font-weight: 500;
  white-space: nowrap;
}

.vk-set-ctrl {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

/* 不可用项的说明（例如 inline 模式下的"仅吸底"） */
.vk-set-note {
  padding: 0.16em 0.44em;
  border-radius: 0.32em;
  background: var(--vk-set-soft);
  font-size: 0.68em;
  line-height: 1.4;
  color: var(--vk-set-muted);
  white-space: nowrap;
}

/* 主题分段控件 */
.vk-seg {
  display: flex;
  gap: 0.14em;
  padding: 0.16em;
  border-radius: 0.52em;
  background: var(--vk-set-soft);
}

.vk-seg button {
  display: inline-flex;
  align-items: center;
  gap: 0.32em;
  padding: 0.32em 0.62em;
  border: none;
  border-radius: 0.4em;
  background: transparent;
  color: var(--vk-set-muted);
  font-size: 0.8em;
  font-family: inherit;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.vk-seg button svg {
  display: block;
  width: 0.95em;
  height: 0.95em;
}

.vk-seg button:hover:not(.is-on) {
  color: var(--vk-key-color);
}

.vk-seg button.is-on {
  background: var(--vk-set-chip-on);
  color: var(--vk-key-accent-bg);
  font-weight: 700;
  box-shadow: 0 0.08em 0.26em rgba(0, 0, 0, 0.14);
}

/* ---------------- 底部操作区 ---------------- */
/* 设置卡片已去掉底部区域（尺寸/关闭提示/操作按钮），关闭方式为点蒙版空白处。
   .vk-set-size / .vk-set-actions 仍被「调整边框」居中浮层复用，保留定义。 */
.vk-set-size {
  padding: 0.2em 0.52em;
  border-radius: 0.36em;
  background: var(--vk-set-accent-soft);
  color: var(--vk-key-accent-bg);
  font-size: 0.72em;
  font-weight: 600;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vk-set-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.36em;
  margin-left: auto;
}

.vk-step {
  padding: 0.36em 0.68em;
  border: 0.06em solid transparent;
  border-radius: 0.44em;
  background: var(--vk-set-soft);
  color: var(--vk-key-color);
  font-size: 0.8em;
  font-family: inherit;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.vk-step:hover:not(:disabled) {
  background: var(--vk-set-soft-hover);
}

.vk-step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vk-step--primary {
  background: var(--vk-key-accent-bg);
  color: var(--vk-key-accent-color);
}

.vk-step--primary:hover:not(:disabled) {
  background: var(--vk-key-accent-bg);
  color: var(--vk-key-accent-color);
  filter: brightness(1.1);
}

/* ---------------- 开关 ---------------- */
.vk-switch {
  position: relative;
  flex: 0 0 auto;
  width: 2.5em;
  height: 1.45em;
  padding: 0;
  border: none;
  border-radius: 0.75em;
  background: var(--vk-set-switch-off);
  cursor: pointer;
  transition: background-color 0.18s ease;
}

.vk-switch.is-on {
  background: var(--vk-key-accent-bg);
}

.vk-switch__dot {
  position: absolute;
  top: 0.18em;
  left: 0.18em;
  width: 1.09em;
  height: 1.09em;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0.06em 0.18em rgba(0, 0, 0, 0.28);
  transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1);
}

.vk-switch.is-on .vk-switch__dot {
  transform: translateX(1.05em);
}

.vk-switch.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ---------------------------------------------------------- 调整边框层 */
/* 键盘保持可见，只压一层轻遮罩 + 一个轻量操作条
   外层容器 pointer-events:none，只有按钮本身接收点击，避免挡住键盘 */
.vk-rz-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45em;
  padding: 0.7em;
  /* 遮罩与「键盘设置」蒙版共用同一变量，改一处即可同步 */
  background: var(--vk-mask);
  pointer-events: none;
}

/* 按钮组：浮层中唯一的操作块，只有它接收点击 */
.vk-rz-actions {
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.36em;
  padding: 0.34em;
  border-radius: 0.6em;
  background: var(--vk-set-surface);
  color: var(--vk-key-color);
  box-shadow: 0 0.35em 1em rgba(0, 0, 0, 0.28);
}

/* 没有蒙版打底后，提示语自己带一块半透明底板，浅/深色主题都能读 */
.vk-rz-tip {
  margin: 0;
  padding: 0.2em 0.55em;
  border-radius: 0.5em;
  background: var(--vk-set-surface);
  color: var(--vk-set-muted);
  font-size: 0.7em;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 0.2em 0.7em rgba(0, 0, 0, 0.18);
}

/* ---------------------------------------------------------- 四周缩放手柄 */
.vk-rz {
  position: absolute;
  z-index: 3;
  background: transparent;
  touch-action: none;
}

.vk-rz--n {
  top: 0;
  left: 14%;
  right: 14%;
  height: 0.8em;
  cursor: ns-resize;
}

.vk-rz--s {
  bottom: 0;
  left: 14%;
  right: 14%;
  height: 0.8em;
  cursor: ns-resize;
}

.vk-rz--e {
  right: 0;
  top: 14%;
  bottom: 14%;
  width: 0.8em;
  cursor: ew-resize;
}

.vk-rz--w {
  left: 0;
  top: 14%;
  bottom: 14%;
  width: 0.8em;
  cursor: ew-resize;
}

.vk-rz--ne,
.vk-rz--nw,
.vk-rz--se,
.vk-rz--sw {
  width: 1.1em;
  height: 1.1em;
}

.vk-rz--ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.vk-rz--nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.vk-rz--se {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}

.vk-rz--sw {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

/* 四个角给一个小方块，明确"这里能拉" */
.vk-rz--ne::after,
.vk-rz--nw::after,
.vk-rz--se::after,
.vk-rz--sw::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.45em;
  height: 0.45em;
  margin: -0.225em 0 0 -0.225em;
  border-radius: 0.1em;
  background: var(--vk-key-accent-bg);
  box-shadow: 0 0 0 0.12em rgba(255, 255, 255, 0.55);
}

.vk-rz.is-resizing {
  background: transparent;
}

.vk-panel-enter-active,
.vk-panel-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.vk-panel-enter-from,
.vk-panel-leave-to {
  opacity: 0;
  transform: translateY(-0.4em);
}

/* ---------------------------------------------------------- 键区 */
.vk-body {
  display: flex;
  flex-direction: column;
  gap: var(--vk-gap);
  padding: 0.5em var(--vk-gap) var(--vk-gap);
}

.vk-row {
  display: grid;
  grid-template-columns: repeat(20, minmax(0, 1fr));
  gap: var(--vk-gap);
}

.vk-row--inset {
  padding: 0 calc(100% / 20);
}

.vk-body--grid3 .vk-row {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.vk-key {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--vk-key-height);
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: var(--vk-radius);
  background: var(--vk-key-bg);
  color: var(--vk-key-color);
  font-size: var(--vk-font-size);
  font-family: inherit;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 0.06em 0 rgba(0, 0, 0, 0.28);
  transition: transform 0.06s ease;
  overflow: hidden;
}

.vk-key__label {
  display: block;
  max-width: 100%;
  padding: 0 0.1em;
  /* 必须明显大于 1：line-height 等于字号时行框装不下 g / y / p / q / j 的下伸部分，
     配合 overflow: hidden 会把字母下半截切掉。1.3 给不同系统字体留足余量。 */
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vk-key:active {
  transform: translateY(0.05em) scale(0.98);
  filter: brightness(0.94);
}

/* 功能键只缩小文字，键高保持不变 */
.vk-key--fn {
  background: var(--vk-key-fn-bg);
  color: var(--vk-key-fn-color);
}

.vk-key--fn .vk-key__label {
  font-size: 0.82em;
  font-weight: 600;
}

.vk-key--accent {
  background: var(--vk-key-accent-bg);
  color: var(--vk-key-accent-color);
}

.vk-key--accent .vk-key__label {
  font-size: 0.88em;
  font-weight: 600;
}

.vk-key--ghost {
  background: transparent;
  box-shadow: none;
}

.vk-key.is-active {
  background: var(--vk-key-accent-bg);
  color: var(--vk-key-accent-color);
}

.vk-key.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 小屏：键略矮一点，保证 10 列不显拥挤 */
@media (max-width: 24rem) {
  .vk-root {
    --vk-key-height: 2.5em;
    --vk-gap: 0.3em;
    --vk-radius: 0.42em;
  }
}

@media (min-width: 48rem) {
  .vk-root--inline {
    --vk-key-height: 2.85em;
  }
}

/* ---------------------------------------------------------- 过渡 */
.vk-fade-enter-active,
.vk-fade-leave-active {
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease;
}

.vk-fade-enter-from,
.vk-fade-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.vk-root--inline.vk-fade-enter-from,
.vk-root--inline.vk-fade-leave-to {
  transform: translateY(0.75em);
}
</style>
