<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { XHVirtualKeyboard, XHKeyboardInput, clearLearning } from '../src/index'

type PanelName = 'letters' | 'numbers' | 'symbols' | 'digits'

/** 构建信息：用于确认预览到的是不是最新构建 */
const buildInfo = {
  name: __APP_PKG_NAME__,
  version: __APP_VERSION__,
  time: __BUILD_TIME__
}

const text = ref('')
const pinyin = ref('')
const visible = ref(true)
const theme = ref<'light' | 'dark'>('light')
const lang = ref<'zh' | 'en'>('zh')
const panel = ref<PanelName>('letters')
const pos = ref<'inline' | 'fixed'>('inline')
const kbRef = ref<InstanceType<typeof XHVirtualKeyboard> | null>(null)
const lastKey = ref('—')
const confirmed = ref('')
const amount = ref('')
const nickname = ref('')

const placeholder = computed(() =>
  panel.value === 'digits' ? '点击输入金额' : '点击这里，用虚拟键盘输入'
)

function open() {
  visible.value = true
}

/** 切换定位时重置尺寸，两种模式的合适尺寸不同 */
async function setPos(p: 'inline' | 'fixed') {
  pos.value = p
  await nextTick()
  kbRef.value?.resetSize()
}

function onKey(payload: { key: string; text: string }) {
  lastKey.value = payload.text || payload.key
}

function onConfirm(value: string) {
  confirmed.value = value
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}

/** 清除用户词频学习数据 */
function resetMemory() {
  clearLearning()
  text.value = ''
  pinyin.value = ''
  lastKey.value = '记忆已清空'
}

function scopedInput() {
  text.value = ''
  panel.value = 'letters'
  lang.value = 'zh'
  visible.value = true
}
</script>

<template>
  <div class="page">
    <header class="head">
      <div class="logo">⌨</div>
      <div>
        <h1>xh-vue-virtual-keyboard-cn</h1>
        <p>Vue 3 虚拟键盘组件 · 内置拼音中文输入法</p>
      </div>
    </header>

    <main class="card">
      <label class="card__label">输入内容</label>
      <div class="field" :class="{ 'field--composing': pinyin }" @click="open">
        <span v-if="text" class="field__text">{{ text }}</span>
        <span v-if="pinyin" class="field__pinyin">{{ pinyin }}</span>
        <span v-if="!text && !pinyin" class="field__ph">{{ placeholder }}</span>
        <span v-if="visible" class="field__caret" />
      </div>
      <div class="meta">
        <span>长度 {{ text.length }}</span>
        <span>最近按键：{{ lastKey }}</span>
        <span v-if="confirmed">已确认：{{ confirmed }}</span>
      </div>
    </main>

    <section class="ops">
      <div class="ops__group">
        <span class="ops__title">面板</span>
        <button
          v-for="p in (['letters', 'numbers', 'digits'] as PanelName[])"
          :key="p"
          class="chip"
          :class="{ 'is-on': panel === p }"
          @click="panel = p"
        >
          {{ p === 'letters' ? '字母' : p === 'numbers' ? '符号' : '数字' }}
        </button>
      </div>
      <div class="ops__group">
        <span class="ops__title">语言</span>
        <button class="chip" :class="{ 'is-on': lang === 'zh' }" @click="lang = 'zh'">
          中文
        </button>
        <button class="chip" :class="{ 'is-on': lang === 'en' }" @click="lang = 'en'">
          English
        </button>
      </div>
      <div class="ops__group">
        <span class="ops__title">主题</span>
        <button class="chip" :class="{ 'is-on': theme === 'light' }" @click="theme = 'light'">
          浅色
        </button>
        <button class="chip" :class="{ 'is-on': theme === 'dark' }" @click="theme = 'dark'">
          深色
        </button>
      </div>
      <div class="ops__group">
        <span class="ops__title">定位</span>
        <button class="chip" :class="{ 'is-on': pos === 'inline' }" @click="setPos('inline')">
          内嵌
        </button>
        <button class="chip" :class="{ 'is-on': pos === 'fixed' }" @click="setPos('fixed')">
          吸底可拖
        </button>
      </div>
      <div class="ops__group">
        <button class="chip chip--primary" @click="scopedInput">清空重来</button>
        <button class="chip" @click="resetMemory">清除记忆</button>
      </div>
    </section>

    <XHVirtualKeyboard
      ref="kbRef"
      v-model="text"
      v-model:visible="visible"
      v-model:panel="panel"
      v-model:lang="lang"
      v-model:pinyin="pinyin"
      :theme="theme"
      :max-length="120"
      :position="pos"
      :draggable="pos === 'fixed'"
      :max-width="pos === 'fixed' ? '35rem' : '100%'"
      @key="onKey"
      @confirm="onConfirm"
    />

    <p class="tip">
      <b>简拼</b>：打 <code>bj</code> 出"北京"，<code>sfz</code> 出"身份证"，<code>ydjh</code> 出"意定监护"，
      <code>zgrmyh</code> 出"中国人民银行"（2~7 个字母）。<br />
      <b>单字母</b>：只打一个字母就给<b>联想字</b>（该声母下最多 200 个单字，按常用度排序），
      <code>b</code> → "不 / 并 / 被 / 表 / 比 / 别…"，<code>d</code> → "的 / 大 / 到 / 地 / 道…"，
      <code>q</code> 里能直接选"其 / 去 / 起 / 前"；候选栏可横滑，点下箭头展开看全部，末尾才补 6 个高频词。<br />
      <b>联想</b>：<code>beijing</code> → 选"北京"，候选栏自动联想"市 / 时间 / 大学"，点一下接上；
      任意单字结尾也能联想，选"女"→"女儿 / 女士"，选"我"→"我们 / 我的"。<br />
      <b>全拼</b>：<code>nihao</code> → 你好，<code>woaibeijing</code> 看长拼音自动分词。<br />
      <b>记忆</b>：你点过哪个候选，下次它就会排更前（例如打 <code>bj</code> 后点「白酒」，再打 <code>bj</code> 白酒就排第一）。<br />
      <b>面板</b>：字母页点 <code>123</code> 进数字符号页，再点 <code>0-9</code> 进三列数字键盘；
      每个面板的点 <code>123</code> / <code>ABC</code> 都能原路返回。<br />
      <b>设置</b>：点候选栏右侧齿轮 → 整块切换到设置界面。
      可切主题、开关拖动；想改尺寸就打开「调整边框」，键盘保持可见，
      在组件中央拖四周/四角即可拉伸，宽高按屏幕比例限幅，
      点「完成调整」退出。点空白处可退出设置界面。
      切到「吸底可拖」后，还能按住候选栏拖动位置、双击复位。
    </p>

    <section class="card card--gap">
      <label class="card__label">
        多个输入框（互斥 · 可拖动 · 金额框锁定为纯数字键盘，没有切换键）
      </label>
      <XHKeyboardInput
        v-model="nickname"
        placeholder="点击输入昵称"
        :max-length="20"
        draggable
        persist-learn
        style="margin-top: 0.5rem"
      />
      <XHKeyboardInput
        v-model="amount"
        placeholder="点击输入金额"
        panel="digits"
        :max-length="12"
        draggable
        persist-learn
        style="margin-top: 0.625rem"
      />
      <div class="meta">
        <span>昵称：{{ nickname || '（空）' }}</span>
        <span>金额：{{ amount || '（空）' }}</span>
      </div>
    </section>

    <footer class="foot">
      <span>{{ buildInfo.name }} <b>v{{ buildInfo.version }}</b></span>
      <span>构建于 {{ buildInfo.time }}</span>
    </footer>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f4f6fa;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei',
    'Helvetica Neue', Arial, sans-serif;
  color: #101828;
}

.page {
  max-width: 47.5rem;
  margin: 0 auto;
  padding: 1.75rem 1.25rem 3rem;
}

.head {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-bottom: 1.375rem;
}

.logo {
  width: 2.875rem;
  height: 2.875rem;
  display: grid;
  place-items: center;
  font-size: 1.375rem;
  border-radius: 0.75rem;
  color: #fff;
  background: linear-gradient(135deg, #1677ff, #5aa9ff);
  box-shadow: 0 0.375rem 1rem rgba(22, 119, 255, 0.32);
}

.head h1 {
  margin: 0;
  font-size: 1.1875rem;
  letter-spacing: -0.0125rem;
}

.head p {
  margin: 0.1875rem 0 0;
  font-size: 0.8125rem;
  color: #667085;
}

.card {
  background: #fff;
  border-radius: 1rem;
  padding: 1.125rem;
  box-shadow: 0 0.25rem 1.25rem rgba(16, 24, 40, 0.06);
}

.card__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #667085;
  letter-spacing: 0.025rem;
}

.card--gap {
  margin-top: 1rem;
}

.field {
  display: flex;
  align-items: center;
  min-height: 3.25rem;
  margin-top: 0.5rem;
  padding: 0.75rem 0.875rem;
  border: 0.0938rem solid #e4e7ec;
  border-radius: 0.75rem;
  background: #fafbfc;
  cursor: text;
  font-size: 1.0625rem;
  line-height: 1.5;
  word-break: break-all;
  transition: border-color 0.15s ease;
}

.field:hover {
  border-color: #b6cbff;
}

.field__text {
  color: #101828;
}

/* 还没上屏的拼音：和已确认文本区分开 */
.field__pinyin {
  color: #1677ff;
  font-weight: 500;
  letter-spacing: 0.0312rem;
  border-bottom: 0.125rem solid rgba(22, 119, 255, 0.45);
}

.field--composing {
  border-color: #b6cbff;
  background: #f7faff;
}

.field__ph {
  color: #98a2b3;
}

.field__caret {
  display: inline-block;
  width: 0.125rem;
  height: 1.25rem;
  margin-left: 0.0625rem;
  background: #1677ff;
  animation: blink 1.05s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: #98a2b3;
}

.ops {
  display: flex;
  flex-wrap: wrap;
  gap: 1.125rem;
  margin-top: 1.125rem;
}

.ops__group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.ops__title {
  font-size: 0.75rem;
  color: #98a2b3;
  margin-right: 0.125rem;
}

.chip {
  padding: 0.375rem 0.75rem;
  border: 0.0625rem solid #e4e7ec;
  border-radius: 62.4375rem;
  background: #fff;
  color: #475467;
  font-size: 0.8125rem;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.chip:hover {
  border-color: #b6cbff;
  color: #1677ff;
}

.chip.is-on {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.chip--primary {
  background: #101828;
  border-color: #101828;
  color: #fff;
}

.tip {
  margin-top: 1.125rem;
  font-size: 0.8125rem;
  line-height: 1.8;
  color: #667085;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.875rem;
  margin-top: 1.5rem;
  padding-top: 0.875rem;
  border-top: 0.0625rem dashed #e4e7ec;
  font-size: 0.75rem;
  color: #98a2b3;
}

.foot b {
  color: #475467;
}

.tip code {
  padding: 0.0625rem 0.375rem;
  border-radius: 0.3125rem;
  background: #eef2f7;
  font-size: 0.75rem;
  color: #1677ff;
}
</style>
