<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import VirtualKeyboard from './VirtualKeyboard.vue'

type PanelName = 'letters' | 'numbers' | 'symbols' | 'digits'

defineOptions({ name: 'xH-KeyboardInput' })

const props = withDefaults(
  defineProps<{
    /** 输入内容（支持 v-model） */
    modelValue?: string
    /** 占位文案 */
    placeholder?: string
    /** 主题 */
    theme?: 'light' | 'dark'
    /** 最大长度，0 表示不限制 */
    maxLength?: number
    /** 输入语言 */
    lang?: 'zh' | 'en'
    /** 键盘面板 */
    panel?: PanelName
    /** 键盘最大宽度 */
    maxWidth?: string
    /**
     * 键盘层级，默认 999999。
     * 被页面里的浮层（弹窗 / 抽屉 / 自己的 fixed 底栏）压住时调大；
     * 也可以在业务 CSS 里覆盖 --vk-z-index，不用改这里。
     */
    zIndex?: number
    /** 键盘挂载容器，默认 'body'，可传选择器或元素（容器不要带 overflow: hidden） */
    appendTo?: string | HTMLElement
    /** 点击输入框以外的区域是否收起键盘，默认 true */
    closeOnClickOutside?: boolean
    /**
     * 是否禁用系统键盘（手机软键盘 / 物理键盘直接输入），默认 true。
     * true：输入框设为 readonly + inputmode="none"，点它只弹虚拟键盘，系统键盘不弹，
     *      粘贴 / 拖放也一并拦掉，避免绕过 maxLength 与词库。
     * false：输入框可正常编辑，系统键盘与虚拟键盘共存，原生输入会同步回 v-model。
     */
    disableSystemKeyboard?: boolean
    /** 输入框额外样式类 */
    fieldClass?: string
    /** 是否开启联想词 */
    associations?: boolean
    /** 是否与页面内其它键盘互斥（同一时间只显示一个） */
    exclusive?: boolean
    /** 键盘是否可拖动位置 */
    draggable?: boolean
    /** 候选栏右侧是否显示设置按钮 */
    showSettings?: boolean
    /** 是否把用户设置（主题 / 拉伸 / 拖动）保存到 localStorage */
    persistSettings?: boolean
    /** 是否学习用户选过的词，选得越多下次越靠前 */
    learn?: boolean
    /** 是否把学习数据保存到 localStorage */
    persistLearn?: boolean
    /**
     * 数字键盘（panel="digits"）默认锁定：不显示任何切换键，用户只能输数字。
     * 确实需要允许切到字母 / 符号面板时，设为 true。
     */
    allowPanelSwitch?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: '点击输入',
    theme: 'light',
    maxLength: 0,
    lang: 'zh',
    panel: 'letters',
    maxWidth: '35rem',
    zIndex: 999999,
    appendTo: 'body',
    closeOnClickOutside: true,
    disableSystemKeyboard: true,
    fieldClass: '',
    associations: true,
    exclusive: true,
    draggable: false,
    showSettings: true,
    persistSettings: false,
    learn: true,
    persistLearn: false,
    allowPanelSwitch: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  key: [payload: { key: string; text: string }]
  confirm: [value: string]
}>()

const visible = ref(false)
const localLang = ref<'zh' | 'en'>(props.lang)
const localPanel = ref<PanelName>(props.panel)
/** 正在输入但还没上屏的拼音 */
const composing = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

/**
 * 只有业务声明面板为 digits 时才锁定（纯数字输入场景）。
 * 不能看 localPanel：用户自己从字母页切到数字键盘时需要保留返回键。
 */
const lockPanel = computed(
  () => props.panel === 'digits' && !props.allowPanelSwitch
)

watch(
  () => props.lang,
  (v) => (localLang.value = v)
)
watch(
  () => props.panel,
  (v) => (localPanel.value = v)
)

const inner = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => emit('update:modelValue', v)
})

/** 输入框里显示的内容 = 已上屏文本 + 正在输入的拼音 */
const displayValue = computed(() => inner.value + composing.value)

// 拼音变长时把输入框滚到末尾，避免长拼音被截断看不到
watch(displayValue, async () => {
  await nextTick()
  const el = inputRef.value
  if (el) el.scrollLeft = el.scrollWidth
})

/**
 * 允许系统键盘时（disableSystemKeyboard=false），把原生输入同步回 v-model。
 * 输入框显示的是「已上屏 + 正在输入的拼音」，回写前要把拼音尾巴去掉，
 * 否则原生输入一次，拼音就被当成上屏文本又保留了一份。
 */
function onNativeInput(e: Event) {
  if (props.disableSystemKeyboard) return
  const el = e.target as HTMLInputElement
  let v = el.value
  if (composing.value && v.endsWith(composing.value)) {
    v = v.slice(0, v.length - composing.value.length)
  }
  inner.value = props.maxLength > 0 ? Array.from(v).slice(0, props.maxLength).join('') : v
}

/** 禁用系统键盘时连粘贴 / 拖放一起拦掉，否则能绕过 maxLength 与词库 */
function blockIf(e: Event) {
  if (props.disableSystemKeyboard) e.preventDefault()
}

async function open() {
  visible.value = true
  await nextTick()
  // 键盘要挂载 + 跑完入场动画才拿得到稳定高度，这里校正两次
  window.setTimeout(ensureFieldVisible, 60)
  window.setTimeout(ensureFieldVisible, 340)
}

/**
 * 吸底键盘会盖住页面底部，而页面往往已经滚到底了，
 * 只调用 scrollIntoView 是顶不上去的（没有多的滚动空间）。
 *
 * 所以先给 body 预留出键盘高度的空白，再把输入框滚到键盘上方。
 * 用模块级 owner 标记：多个输入框切换时，被抢占的那个不会把别人留的空间清掉。
 */
let spaceOwner: symbol | null = null
let savedPadding = ''
const mySpaceId = Symbol('vk-input')

function reserveBottomSpace(height: number) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (spaceOwner === null) {
    savedPadding = body.style.paddingBottom
  }
  spaceOwner = mySpaceId
  body.style.paddingBottom = `${Math.round(height) + 16}px`
}

function releaseBottomSpace() {
  if (typeof document === 'undefined' || spaceOwner !== mySpaceId) return
  document.body.style.paddingBottom = savedPadding
  spaceOwner = null
}

/**
 * 把输入框滚到键盘上方，保证用户看得到自己输入的内容。
 * 用绝对位置 scrollTo 而不是 scrollBy：后者被反复调用会叠加甚至反向。
 */
function ensureFieldVisible() {
  const el = inputRef.value
  if (!el || typeof window === 'undefined') return
  const kb = Array.from(document.querySelectorAll('.vk-root--fixed')).find(
    (n) => (n as HTMLElement).getBoundingClientRect().height > 0
  )
  if (!kb) return

  const kbH = kb.getBoundingClientRect().height
  reserveBottomSpace(kbH)

  const rect = el.getBoundingClientRect()
  const safeBottom = window.innerHeight - kbH - 12
  const delta = rect.bottom - safeBottom
  if (delta <= 0) return // 已经露出来了，不要再滚（否则会反向）

  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight
  )
  const target = Math.min(window.scrollY + delta, maxScroll)
  window.scrollTo({ top: target, behavior: 'smooth' })
}

watch(visible, (v) => {
  if (!v) releaseBottomSpace()
})

onBeforeUnmount(() => {
  if (visible.value) releaseBottomSpace()
})

</script>

<template>
  <div class="vk-input" data-vk-anchor>
    <input
      ref="inputRef"
      class="vk-input__field"
      :class="[fieldClass, { 'is-active': visible, 'is-composing': composing }]"
      :value="displayValue"
      :placeholder="placeholder"
      :readonly="disableSystemKeyboard"
      :inputmode="disableSystemKeyboard ? 'none' : 'text'"
      autocomplete="off"
      @click="open"
      @input="onNativeInput"
      @compositionend="onNativeInput"
      @paste="blockIf"
      @drop="blockIf"
    />
    <VirtualKeyboard
      v-model="inner"
      v-model:visible="visible"
      v-model:pinyin="composing"
      v-model:lang="localLang"
      v-model:panel="localPanel"
      :theme="theme"
      :max-length="maxLength"
      :max-width="maxWidth"
      :z-index="zIndex"
      :append-to="appendTo"
      :close-on-click-outside="closeOnClickOutside"
      :associations="associations"
      :exclusive="exclusive"
      :draggable="draggable"
      :show-settings="showSettings"
      :persist-settings="persistSettings"
      :learn="learn"
      :persist-learn="persistLearn"
      :lock-panel="lockPanel"
      @key="emit('key', $event)"
      @confirm="emit('confirm', $event)"
    />
  </div>
</template>

<style>
/* 与键盘同一套自适应基准，保证输入框和键盘字号一致 */
.vk-input {
  font-size: clamp(0.875rem, 0.55rem + 1.5vw, 1.0625rem);
}

.vk-input__field {
  display: block;
  width: 100%;
  min-height: 2.7em;
  padding: 0.65em 0.85em;
  border: 0.09em solid #e4e7ec;
  border-radius: 0.6em;
  background: #fff;
  color: #101828;
  font-size: 1em;
  font-family: inherit;
  line-height: 1.5;
  cursor: text;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  -webkit-appearance: none;
  appearance: none;
}

.vk-input__field.is-active {
  border-color: #1677ff;
  box-shadow: 0 0 0 0.18em rgba(22, 119, 255, 0.12);
}

/* 拼音还没上屏时的状态：和已确认文本做视觉区分 */
.vk-input__field.is-composing {
  border-color: #1677ff;
  background: #f5f9ff;
  color: #1677ff;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.vk-input__field::placeholder {
  color: #98a2b3;
}
</style>
