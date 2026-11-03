# xh-vue-virtual-keyboard-cn

Vue 3 虚拟键盘组件，**内置拼音中文输入法**，无需依赖系统输入法，适合自助终端、一体机、工控屏、POS、政务大厅等场景。

- 中文：连续拼音输入 + 候选词，内置 6500+ 汉字、1500+ 常用词组
- **简拼**：打首字母直接出词，1~7 个字母都支持，`bj` → 北京、`zgrmyh` → 中国人民银行
- **单字母联想字**：只打一个字母就列出该声母下最多 200 个单字（按常用度排序），`b` → 不 / 并 / 被 / 表 / 比 …
- **联想词**：一个词上屏后自动推荐常跟它搭配的下一个词（636 组 / 2600+ 条，含单字补全与常用句式），点一下直接接上
- **词频记忆**：你点过哪个候选，下次它就排更前（选得越多越靠前）
- **全局互斥**：页面内任何时刻只有一个键盘显示，新键盘打开自动收起上一个
- **可拖动**：`fixed` 键盘可拖到屏幕任意位置，双击把手复位，不会挡住输入框
- **零 px**：所有尺寸用 `em` / `rem` / `vw` 表达，手机到一体机自适应，不写死像素
- **运行期设置**：齿轮一键进入设置模式，切主题、开关拖动，打开「调整边框」后再拖边框调尺寸，无需改代码
- 英文 / 数字 / 符号：完整 QWERTY 布局，Shift 单击大写、双击锁定
- 中文模式下 `,` `.` 自动输出中文标点 `，` `。`
- 零运行时依赖，TypeScript 编写，完整类型提示；含拼音词库与联想库 JS gzip 约 90KB、CSS 约 4KB
- 支持 `v-model` 双向绑定、`fixed` 吸底 / `inline` 内嵌、浅色 / 深色主题
- 所有样式基于 CSS 变量，可整体换肤

## 安装

```bash
npm i xh-vue-virtual-keyboard-cn
# 或
pnpm add xh-vue-virtual-keyboard-cn
```

> 环境要求：Vue `^3.3.0`（peerDependency）。组件零运行时依赖，不用装其它包。

> 包名从 `vue-virtual-keyboard-cn` 迁移而来。组件导出名（`XHVirtualKeyboard` / `XHKeyboardInput`）与用法
> 完全不变，只需把 import 路径和 CSS 路径里的包名换成新的即可。

## 快速开始

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { XHVirtualKeyboard } from 'xh-vue-virtual-keyboard-cn'
import 'xh-vue-virtual-keyboard-cn/style.css'

const text = ref('')
const pinyin = ref('') // 正在输入、还没上屏的拼音
const visible = ref(true)
</script>

<template>
  <input :value="text + pinyin" readonly @click="visible = true" />
  <XHVirtualKeyboard v-model="text" v-model:pinyin="pinyin" v-model:visible="visible" />
</template>
```

> **重要**：拼音是"未上屏"状态，只会出现在候选栏。如果输入框只绑定 `v-model`，用户打完拼音但没点候选时输入框是空的，会以为没反应。务必把 `v-model:pinyin` 也接到输入框上（或用 `XHKeyboardInput`，它已内置这个处理）。

> 注意：真实设备上建议把 `input` 设为 `readonly` 或 `inputmode="none"`，避免点击时同时弹出系统输入法。

## 组合组件 XHKeyboardInput（推荐）

不想自己处理输入框与键盘的联动，直接用 `XHKeyboardInput`，点输入框自动弹键盘：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { XHKeyboardInput } from 'xh-vue-virtual-keyboard-cn'
import 'xh-vue-virtual-keyboard-cn/style.css'

const amount = ref('')
</script>

<template>
  <XHKeyboardInput v-model="amount" placeholder="点击输入金额" panel="digits" :max-length="12" />
</template>
```

除了下方 `XHVirtualKeyboard` 的全部属性外，额外支持：

| 属性                 | 类型        | 默认值      | 说明                                                  |
| ------------------ | --------- | -------- | --------------------------------------------------- |
| `placeholder`      | `string`  | `'点击输入'` | 输入框占位文案                                             |
| `fieldClass`       | `string`  | `''`     | 透传到输入框的样式类，便于覆盖外观                                   |
| `draggable`        | `boolean` | `false`  | 键盘可拖动（透传给内部键盘）                                      |
| `learn`            | `boolean` | `true`   | 学习用户选过的词                                            |
| `persistLearn`     | `boolean` | `false`  | 学习数据持久化到 localStorage                               |
| `allowPanelSwitch` | `boolean` | `false`  | 允许数字键盘切换到其它面板。默认 `false`：`panel="digits"` 时锁死为纯数字键盘 |

### 会自动把输入框让到键盘上方

吸底键盘会盖住页面底部，而页面常常已经滚到底了——只是 `scrollIntoView` 是顶不上去的（没有多余的滚动空间）。

所以组件在打开键盘时会临时给 `body` 加一段等于键盘高度的 `padding-bottom`，然后把输入框滚到键盘上方；
  
收起键盘时把 `padding-bottom` 还原。多个输入框切换时用引用标记，被抢占的那个不会把别人留的空间清掉。

这段逻辑只在 `XHKeyboardInput` 里有（它知道输入框在哪）。如果你用裸的 `XHVirtualKeyboard` 自己控布局，
  
需要自己处理避让。

## 也可以作为全局插件注册

```ts
import { createApp } from 'vue'
import VueVirtualKeyboard from 'xh-vue-virtual-keyboard-cn'
import 'xh-vue-virtual-keyboard-cn/style.css'

createApp(App).use(VueVirtualKeyboard).mount('#app')
```

注册后可直接在模板里用：

```vue
<xH-VirtualKeyboard v-model="text" />
<xH-KeyboardInput v-model="text" />
```

> HTML 标签名不区分大小写（浏览器会转小写），所以同时注册了 kebab 写法：
>   
> `<xh-virtual-keyboard />`、`<xh-keyboard-input />` 也能用。
>   
> 在 SFC 里想保留类型提示，建议用具名导入 `<XHVirtualKeyboard />`。

也支持自定义组件名：

```ts
app.use(VueVirtualKeyboard, {
  componentName: 'MyKeyboard',
  inputComponentName: 'MyInput'
})
```

### 组件名对照

| 用途  | 具名导出                | 全局标签                                             |
| --- | ------------------- | ------------------------------------------------ |
| 键盘  | `XHVirtualKeyboard` | `<xH-VirtualKeyboard>` / `<xh-virtual-keyboard>` |
| 输入框 | `XHKeyboardInput`   | `<xH-KeyboardInput>` / `<xh-keyboard-input>`     |

旧的 `VirtualKeyboard` / `KeyboardInput` 仍作为别名导出，原有代码不用改。

## XHVirtualKeyboard 属性

| 属性                | 类型                                                | 默认值         | 说明                                                                   |
| ----------------- | ------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `v-model`         | `string`                                          | `''`        | 键盘输入的文本内容                                                            |
| `v-model:visible` | `boolean`                                         | `true`      | 是否显示键盘                                                               |
| `v-model:panel`   | `'letters' \| 'numbers' \| 'symbols' \| 'digits'` | `'letters'` | 当前面板                                                                 |
| `v-model:lang`    | `'zh' \| 'en'`                                    | `'zh'`      | 输入语言，`zh` 走拼音输入法                                                     |
| `theme`           | `'light' \| 'dark'`                               | `'light'`   | 主题                                                                   |
| `maxLength`       | `number`                                          | `0`         | 最大长度，`0` 不限制                                                         |
| `showCandidates`  | `boolean`                                         | `true`      | 是否显示顶部候选栏                                                            |
| `associations`    | `boolean`                                         | `true`      | 是否开启联想词（词上屏后推荐下一个词）                                                  |
| `maxAssociations` | `number`                                          | `10`        | 联想词最多显示几个                                                            |
| `position`        | `'fixed' \| 'inline'`                             | `'fixed'`   | 定位方式，`fixed` 吸底（移动端常用）                                               |
| `enterText`       | `string`                                          | `'完成'`      | 回车键文案                                                                |
| `maxWidth`        | `string`                                          | `'35rem'`   | 键盘最大宽度                                                               |
| `draggable`       | `boolean`                                         | `false`     | 键盘可拖动位置（仅 `position="fixed"` 生效），按住候选栏任意空白处即可拖                       |
| `showSettings`    | `boolean`                                         | `true`      | 候选栏右侧显示设置按钮（主题 / 拖动 / 调整边框）                                          |
| `persistSettings` | `boolean`                                         | `false`     | 把用户设置写入 localStorage                                                 |
| `learn`           | `boolean`                                         | `true`      | 学习用户选过的词，选得越多下次越靠前                                                   |
| `persistLearn`    | `boolean`                                         | `false`     | 把学习数据写入 localStorage（跨会话生效）                                          |
| `lockPanel`       | `boolean`                                         | `false`     | 锁定当前面板：隐藏所有切换键，用户无法切到别的面板                                            |
| `exclusive`       | `boolean`                                         | `true`      | 与页面内其它键盘互斥，同一时间只显示一个                                                 |
| `teleport`        | `boolean`                                         | `true`      | fixed 定位时挂载到 `body`，避免祖先 `transform`/`filter` 让 `position: fixed` 失效 |
| `zIndex`          | `number`                                          | `9999`      | 层级                                                                   |

## XHVirtualKeyboard 事件

| 事件                  | 参数                     | 说明                                      |
| ------------------- | ---------------------- | --------------------------------------- |
| `update:modelValue` | `(value: string)`      | 输入内容变化                                  |
| `update:visible`    | `(visible: boolean)`   | 显示状态变化                                  |
| `update:panel`      | `(panel: string)`      | 面板切换                                    |
| `update:lang`       | `(lang: 'zh' \| 'en')` | 语言切换                                    |
| `update:pinyin`     | `(pinyin: string)`     | 正在输入、尚未上屏的拼音。用它把拼音实时回显到输入框，避免"打了没反应"的错觉 |
| `update:theme`      | `('light' \| 'dark')`  | 用户在设置面板切换主题                             |
| `key`               | `({ key, text })`      | 每次按键，可用于埋点或拦截                           |
| `confirm`           | `(value: string)`      | 点击「完成」                                  |
| `close`             | `()`                   | 键盘收起                                    |

## 暴露方法

```vue
<XHVirtualKeyboard ref="kb" v-model="text" />

<script setup>
const kb = ref()
kb.value.insert('你好')     // 插入文本
kb.value.backspace()        // 退格
kb.value.clear()            // 清空
kb.value.commitComposing()  // 把未上屏的拼音落地
kb.value.resetPosition()    // 回到吸底
kb.value.resetSize()        // 尺寸回到默认
</script>
```

## 四套面板

| 面板   | `panel` 值 | 内容                | 进入方式         |
| ---- | --------- | ----------------- | ------------ |
| 字母   | `letters` | QWERTY + 中文标点     | 默认           |
| 数字符号 | `numbers` | `1~0` + 常用符号      | 字母页点 `123`   |
| 更多符号 | `symbols` | 括号 / 数学 / 货币符号    | 数字符号页点 `#+=` |
| 数字键盘 | `digits`  | 三列大按键，仅 `0-9` `.` | 数字符号页点 `0-9` |

走向是这样的，每一层都能原路返回：

```
letters  ──123──▶  numbers  ──#+=──▶  symbols
   ◀──ABC──┘          ▲  ◀──ABC──┘
                      │
                      └──0-9──▶  digits
                           ◀──123──┘
```

每一层都能原路返回，不会进去出不来。

「数字键盘」是金额、数量、手机号这类纯数字场景用的三列大按键。

### 数字输入框默认锁死数字键盘

```vue
<XHKeyboardInput v-model="amount" panel="digits" />
```

`panel="digits"` 的输入框，键盘上**不会出现任何切换键**（没有 `ABC` / `123` / `0-9` / `#+=`），
  
只剩 `0-9`、`.`、`⌫`、`清空`、`完成`。用户不可能切到字母去，也就不会出现「输进去的不是数字」。

确实需要允许切换时，显式打开：

```vue
<XHKeyboardInput v-model="amount" panel="digits" allow-panel-switch />
```

单独用键盘时对应的是 `lock-panel`：

```vue
<XHVirtualKeyboard v-model="amount" panel="digits" lock-panel />
```

`lock-panel` 对任意面板都生效——传了就隐藏该面板的所有切换键，并用 `switchPanel` 双重拦截。

## 拖动位置

`fixed` 模式的键盘可以拖动，避免挡住屏幕上的输入框：

```vue
<XHVirtualKeyboard v-model="text" draggable />

<XHKeyboardInput v-model="text" draggable />
```

- **整条候选栏都能按住拖**（不再只有左侧那一小块把手），按钮区域会自动排除，不会误触候选词
- 左侧 ⋮⋮ 只是视觉提示，双击它可**复位**回底部
- 拖动范围自动限制在视口内，键盘不会被拖出屏幕
- **键盘比视口还宽 / 还高时仍可拖动**：此时允许左 / 上边缘为负值，左右（上下）平移即可看到被裁掉的部分，
  范围钳在「一边贴住视口」之间，不会滑到完全看不见（例如窗口缩小后键盘比页面宽，照样能拖着看右侧按键）
- 视口尺寸变化（旋转屏幕、窗口缩放）时会自动把键盘拉回可视范围，超宽状态也不会被锁死
- 支持鼠标和触摸（Pointer Events）

```ts
// 也可以主动复位
keyboardRef.value?.resetPosition()   // 位置回到吸底
keyboardRef.value?.resetSize()       // 尺寸回到默认（清掉拉伸过的宽度与缩放）
```

> 拖动只对 `position="fixed"` 生效。`inline` 内嵌模式下设置面板里的「拖动」会显示为禁用状态并标注「仅吸底模式」
>   
> ——内嵌键盘在文档流里，拖动没有意义。

## 设置模式

候选栏右侧有一个齿轮按钮，点一下**整个键盘切换成设置界面**（不是顶部展开一条）：

- 键盘本体保持可见，设置卡片以半透明蒙版浮起（内容多时卡片内部滚动）
- 设置项：**主题**（浅色 / 深色）、**拖动**（仅吸底模式可用）、**调整边框**（默认关闭）
- 设置态下键盘只作为背景显示，不接受输入
- **点蒙版空白处即可退出设置**，卡片内点击不会误关闭

**调整边框**是一个二级开关，点齿轮进入设置后**默认不可拖**，打开后：

- 设置卡片收起，键盘四周出现虚线边框 + 四个角的小方块
- **不加深色蒙版，键盘完整可见**；尺寸条与按钮浮在键区中央
- **拖动边框即可拉伸**：左右边改宽度、上下边改高度、四个角同时改
- 当前尺寸单独一行显示，「默认大小」「完成调整」按钮居中显示在组件内
- 调整态下点空白/按键都不会误退出或误输入，**点「完成调整」按钮**回到设置卡片
    
  （退出设置时调整边框自动复位为关闭）

```
┌─────────────────────────────────────┐
│ (⚙)  键盘设置                       │
├─────────────────────────────────────┤
│ 主题              [☀ 浅色 │ 🌙 深色] │
├─────────────────────────────────────┤
│ 拖动                 [仅吸底]  ( ●)  │  ← 内嵌模式下禁用
├─────────────────────────────────────┤
│ 调整边框               开启后可拖 (●)│  ← 打开后卡片收起
└─────────────────────────────────────┘
   ↓ 开启「调整边框」后
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
╎  q w e r t y  （键盘保持可见）    ╎
╎      当前尺寸  自动宽 · 100%      ╎
╎   [默认大小]  [完成调整]          ╎  ← 居中浮层，四周可拖
╎   拖动四周边框调整大小            ╎
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

设置态下会隐藏候选栏右侧的齿轮（避免它浮在卡片边缘），退出方式为点击蒙版空白处。

尺寸不是无限制的，宽高都有相对视口的上下限：

| 维度 | 下限        | 上限                         |
| -- | --------- | -------------------------- |
| 宽度 | 视口宽 × 40% | 视口宽 × 98%（且不超出屏幕）          |
| 高度 | 视口高 × 26% | 视口高 × 86%（同时受缩放上限 150% 约束） |

超出范围会自动夹住，键盘永远不会被拉出屏幕。`inline` 内嵌模式下宽度还额外受父容器宽度约束，
  
左右边缘都跟手：拖左边时右边缘固定，拖右边时左边缘固定。

```vue
<XHVirtualKeyboard v-model="text" />                        
<XHVirtualKeyboard v-model="text" :show-settings="false" /> 
```

操作入口汇总：**默认大小**（恢复原始尺寸）、**复位位置**（仅吸底模式，回到屏幕底部）
  
都在「调整边框」浮层里；退出设置 / 完成调整均通过**点击空白处**完成。

想让设置记住，加 `persist-settings`：

```vue
<XHVirtualKeyboard v-model="text" persist-settings />
```

开启后主题 / 尺寸 / 位置 / 拖动状态都会写入 `localStorage`，下次打开自动恢复。

## 尺寸自适应（不使用 px）

组件内部**没有任何 px 尺寸**，所有间距、字号、圆角都以 `em` 表达，
  
基准字号只在 `.vk-root` 定义一次：

```css
font-size: clamp(0.875rem, 0.55rem + 1.5vw, 1.0625rem);
```

实际效果（实测）：

| 视口宽度       | 键盘字号   | 键高     |
| ---------- | ------ | ------ |
| 360px（手机）  | 14.2px | 35.5px |
| 512px      | 16.5px | 44.5px |
| 1280px（桌面） | 17px   | 45.9px |

键盘宽度用 `35rem` 兜底，大屏不会无限拉宽，小屏自动撑满。

## 换肤

组件所有颜色、尺寸都来自 CSS 变量，**直接通过 `style` 传给组件**（因为 fixed 模式会 teleport 到 body，挂在祖先元素上的变量不会生效）：

```vue
<XHVirtualKeyboard
  v-model="text"
  :style="{
    '--vk-key-height': '3em',
    '--vk-gap': '0.4em',
    '--vk-radius': '0.6em',
    '--vk-key-bg': '#ffffff',
    '--vk-key-color': '#101828',
    '--vk-key-fn-bg': '#e5e7eb',
    '--vk-key-accent-bg': '#1677ff',
    '--vk-bg': '#d3d6db'
  }"
/>
```

> 尺寸变量建议用 `em`（相对键盘基准字号），这样换设备时比例保持一致。

如果想用祖先选择器控制样式（例如 `.my-keyboard .vk-key { ... }`），把 `teleport` 设为 `false`，或改用 `position="inline"`。


| 变量                                      | 说明                                              |
| --------------------------------------- | ----------------------------------------------- |
| `--vk-key-height`                       | 按键高度，默认 `2.7em`                                 |
| `--vk-gap`                              | 键间距，默认 `0.36em`                                 |
| `--vk-radius`                           | 按键圆角，默认 `0.5em`                                 |
| `--vk-font-size`                        | 按键字号，默认 `1em`                                   |
| `--vk-key-bg` / `--vk-key-color`        | 普通按键底色 / 文字色                                    |
| `--vk-key-fn-bg` / `--vk-key-fn-color`  | 功能键底色 / 文字色                                     |
| `--vk-key-accent-bg`                    | 主按钮（完成）底色                                       |
| `--vk-bg`                               | 键盘整体底色                                          |
| `--vk-bar-bg` / `--vk-bar-color`        | 候选栏底色 / 文字色                                     |
| `--vk-set-surface`                      | 设置卡片底色                                          |
| `--vk-set-soft` / `--vk-set-soft-hover` | 分段控件、次要按钮底色 / 悬停色                               |
| `--vk-set-divider`                      | 设置项之间的分隔线颜色                                     |
| `--vk-set-accent-soft`                  | 尺寸标签、图标徽标的淡主色底（需与 `--vk-key-accent-bg` 一起换成品牌色） |

> 设置面板的 `--vk-set-*` 变量在浅色 / 深色主题下各有一套默认值，一般不用改。
>   
> 想换品牌色时，同时覆盖 `--vk-key-accent-bg` 和 `--vk-set-accent-soft`（后者是前者的低透明度版本）。

## 简拼（首字母输入）

只打每个字的首字母就能出词，不用打完整拼音。**支持 1~7 个字母，词越长简拼也越长**：

```
b       → 不 / 并 / 被 / 表 / 比 / 别 / 变 / 报 / 必 / 保 …（该声母下的常用单字，最多 200 个）
q       → 其 / 去 / 起 / 前 / 全 / 情 / 气 / 期 / 区 / 却 …（同上）
bj      → 北京 / 比较 / 报警 / 白酒
sj      → 世界 / 时间 / 手机 / 数据 / 升级
sfz     → 身份证
zwfw    → 政务服务
sfzfyj  → 身份证复印件
zgrmyh  → 中国人民银行
```

- 自动生效，不需要任何配置；词库 1500+ 条（含三字词、四字词组、机构名、政务医疗法律词）
- **只打一个字母给「联想字」**：单字母与 2 个字母以上的简拼语义不同——
  1 个字母时给的是**以这个字母为声母的单字**，按常用度排序、最多 200 个，
  例如 `b` 的前几位是「不 / 并 / 被 / 表 / 比」、`d` 是「的 / 大 / 到 / 地 / 道」，
  直接选字即可上屏；候选栏可横滑，点下箭头展开可看全部
- 单字母后面仍会补 6 个高频词（如 `b` 末尾的「北京 / 必要」），但不占主视觉；
  想打词请继续输入第二个字母走简拼（`bj` → 北京）
- 候选按常用度排序（`bj` 的第一位是「北京」而不是「比较」），2 个字母以上每组最多 16 个
- 简拼和全拼可以混着来：`beijing` 打全拼、`bj` 打简拼，都能出「北京」
- 打一半的简拼不会乱上屏：`beij` 会停在输入状态等你继续打，不会变成字母
- 字母已经拼成完整音节（`bei` / `qing` / `nv`）时，单字候选排前面、简拼词退到后面，
  不会出现"打 `qing` 却被「情况」挡住选「请」"

单独调用：

```ts
import { getCandidates } from 'xh-vue-virtual-keyboard-cn'

getCandidates('bj').map((c) => c.text)
// ['北京', '比较', '报警', '白酒']

getCandidates('ydjh').map((c) => c.text)
// ['意定监护']
```

> 目前支持**全简拼**（每个字都取首字母）。混合简拼（如 `beij` = bei + j）暂未支持，
> 这种输入会保持"可继续输入"状态，打完变全拼即可出候选。

## 联想词

一个词上屏后，候选栏会自动推荐常跟它搭配的下一个词，点一下接上，并继续联想下一轮：

```
输入 beijing → 选「北京」→ 候选栏出现 [市] [时间] [大学] [欢迎] [天气] ...
点「时间」→ 文本变成「北京时间」
```

- 联想词用**虚线框**显示，和"正在输入的候选"区分开
- 一旦重新开始打拼音，联想自动让位给候选词
- 联想在文本末尾倒序匹配 2~4 个字，所以 `我爱北京` 也能命中 `北京`
- 末尾是单个字时同样联想，且只给**以该字开头**的词：`女` → 女儿 / 女士，`我` → 我们 / 我的
- 不需要可以关闭：`<XHVirtualKeyboard :associations="false" />`

### 三类联想

| 类型   | 例子                       | 说明                  |
| ---- | ------------------------ | ------------------- |
| 词搭配  | `北京` → 市 / 时间 / 大学 / 天气  | 最常用                 |
| 单字补全 | `我` → 我们 / 我的 / 我是 / 我要  | 末尾是单个字时生效，只收以该字开头的词 |
| 常用句式 | `我要` → 办理 / 咨询 / 查询 / 申请 | 自助终端场景省击键           |

> 单字联想的歧义处理：只返回**以该字开头**的联想词。所以 `我要` 不会被联想成 `要求`（跨词误伤），
> 而 `我` / `女` / `得` 这类确实需要"一个字接下一个词"的情况照常联想。

单独使用联想能力：

```ts
import { getAssociations } from 'xh-vue-virtual-keyboard-cn'

getAssociations('我爱北京')
// ['市', '时间', '大学', '欢迎', '天气', '人', '上海']

getAssociations('我')
// ['我们', '我的', '我是', '我要', '我想', '我这边', '我帮您']
```

联想词库在 `scripts/gen_dict.py` 的 `ASSOC` / `ASSOC_EXTRA` 里维护，格式是「前一个词: 联想词1 联想词2 ...」，
  
一行一个词，改完跑 `npm run gen:dict` 即可。业务侧想加"意定监护""监护人""委托书"这类专属搭配，
  
直接往里加行就行，不需要懂拼音。

## 用户词频记忆

你选过哪个候选，下次它就排得更前。默认开启，不需要配置：

```
打 bj        → 北京 / 比较 / 报警 / 白酒
点「白酒」    → 上屏
再打 bj      → 白酒 / 北京 / 比较 / 报警   ← 已置顶
```

- 点候选词、点联想词都会记录；用空格/符号上屏的不算，避免"被迫接受"污染数据
- 权重按**选择次数**排序，次数相同的保持原有常用度顺序
- 单词权重上限 99，防止长期使用后某个词无限压制其它候选
- 数据是**全局共享**的（页面内所有键盘实例共用），不按组件实例割裂

跨会话记住需要显式开启：

```vue
<XHVirtualKeyboard v-model="text" persist-learn />
```

开启后写入 `localStorage`（key: `xh-virtual-keyboard-learning`，最多存 600 个词）。
  
默认不开启是有意的：自助终端这类**多人共用设备**上，个性化记忆会互相干扰，应该由业务决定是否启用。

不想要学习可以关掉：

```vue
<XHVirtualKeyboard v-model="text" :learn="false" />
```

### 相关 API

```ts
import {
  recordSelection,
  weightOf,
  clearLearning,
  exportLearning,
  importLearning
} from 'xh-vue-virtual-keyboard-cn'

weightOf('白酒')          // 3，被选过几次
recordSelection('白酒')   // 手动记一次（比如业务侧自己的快捷按钮）
clearLearning()           // 清空全部记忆
exportLearning()          // { 白酒: 3, 比较: 1 } 可用于备份/上报
importLearning({ '北京': 5 })  // 导入（合并，同词取较大值）
```

## 页面内只允许一个键盘

组件内置全局互斥（`exclusive` 默认 `true`）：页面上任何时刻只会有一个键盘处于显示状态，
  
新键盘打开时会自动收起上一个。表单里有多个输入框时不用自己管：

```vue
<XHKeyboardInput v-model="nickname" placeholder="昵称" />
<XHKeyboardInput v-model="amount" placeholder="金额" panel="digits" />

```

需要在业务侧主动收起（例如路由跳转、弹窗打开、页面滚动）：

```ts
import { closeActiveKeyboard } from 'xh-vue-virtual-keyboard-cn'

closeActiveKeyboard()
```

极少见的场景下确实要同时显示多个键盘，设 `:exclusive="false"` 关掉互斥。

## 单独使用拼音引擎

候选词计算是纯函数，可以脱离组件使用：

```ts
import { getCandidates, getRemainingPinyin, segmentPinyin } from 'xh-vue-virtual-keyboard-cn'

getCandidates('nihao')
// [{ text: '你好', type: 'word', consume: 5 }, ...]

segmentPinyin('woaibeijing')
// [{ type: 'word', key: 'wo' }, ...]
```

## 自定义词库

`npm run gen:dict` 脚本用于重新生成拼音字典（需要 Python + pypinyin）：

```bash
python -m venv .venv
.venv/Scripts/pip install pypinyin
.venv/Scripts/python scripts/gen_dict.py
```

编辑 `scripts/gen_dict.py` 里的这几处即可：

- `HIGH_FREQ` —— 高频字表，决定单字候选的排序
- `WORDS` —— 词组表（只写汉字，拼音由 pypinyin 自动推导，无需手工注音；**简拼索引会自动生成**）
- `ABBR_BOOST` —— 简拼候选的优选词表，决定 `bj` 时"北京"排在"比较"前面这类顺序
- `ASSOC` / `ASSOC_EXTRA` —— 联想词库，格式「前一个词: 联想词1 联想词2 ...」，两个区块会合并
- `INITIAL_CHAR_DICT` —— **自动生成**，不用手改：按声母聚合字表并按常用度排序，
  就是"只打一个首字母"时给出的联想字（来自 `CHAR_DICT`，改 `HIGH_FREQ` 即可调整顺序）
- `MAX_CHARS_PER_INITIAL`（默认 200）—— 每个首字母最多给多少个联想字，想更多直接调大
- `INITIAL_WORDS_PER_KEY`（默认 6）—— 单字母末尾补充的高频词数量
- `MAX_WORDS_PER_ABBR` / `MAX_CHARS_PER_FULL_SYLLABLE` —— 简拼词、音节全拼补字的上限

改完跑 `npm run gen:dict` 重新生成 `src/core/dict.generated.ts`
（Windows 上如果 `npm run gen:dict` 报 `.venv` 找不到，直接用 `.venv/Scripts/python scripts/gen_dict.py`）。

## 说明与限制

- 目前只做全拼输入，未支持双拼、九宫格、手写、语音。
- 词组覆盖为常用生活 / 办公词汇，专业术语可自行补充词库。
- 字母页的 `⇧` 键：单击输入一个大写字母，双击锁定大写；中文模式下大小写键不影响拼音输入。
- 拼音输入到无法构成任何音节时会自动退化为普通字母输出，不会卡住。

## 常见问题

**1. 点字母键没反应 / 键盘跑到页面中间或看不见**
  
几乎都是祖先元素带 `transform` / `filter` / `perspective` / `will-change`，导致 `position: fixed` 不再相对视口定位。组件默认 `teleport: true` 已规避；如果是旧版本或手动设了 `teleport: false`，请改回来。

**2. 键盘完全没样式（一堆文字按钮）**
  
忘了引入样式文件：

```ts
import 'xh-vue-virtual-keyboard-cn/style.css'
```

**3. 打拼音不出现汉字候选**
  
确认 `lang` 为 `'zh'`（默认值）。若已切到英文，候选栏左侧会显示 `English`。也可以监听 `@key` 事件查看每次按键。

**3.1 打完拼音输入框还是空的**
  
这是设计如此：拼音属于"未上屏"状态，只在候选栏显示，点候选或多个候选里选一个才落到 `v-model`。
  
要在输入框里实时看到拼音，请绑定 `v-model:pinyin`（`XHKeyboardInput` 已内置）。

**4. 移动端点击时同时弹出系统输入法**
  
输入框需设置 `readonly` + `inputmode="none"`，`XHKeyboardInput` 已内置处理。

**5. 页面底部内容被键盘遮挡**
  
fixed 模式下键盘脱离文档流，请给页面预留底部空间，例如 `padding-bottom: 320px`。

## License

MIT
