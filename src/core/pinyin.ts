import {
  ABBR_DICT,
  ASSOCIATIONS,
  CHAR_DICT,
  INITIAL_CHAR_DICT,
  MAX_WORD_KEY_LEN,
  SYLLABLES,
  WORD_DICT
} from './dict.generated'

/** 候选结果类型 */
export type CandidateType = 'word' | 'char'

/** 一个候选结果 */
export interface Candidate {
  /** 候选文本（单字 / 词 / "首段候选 + 后续最佳组合"） */
  text: string
  /** 命中类型，便于业务方做差异化样式 */
  type: CandidateType
  /** 选中该候选后，从拼音缓冲区消费掉的字符数 */
  consume: number
}

/** 拼音切分出来的一段 */
interface Segment {
  type: CandidateType
  /** 拼音键，如 'ni' / 'nihao' */
  key: string
}

const SYLLABLE_SET: ReadonlySet<string> = new Set(SYLLABLES)
/** 最长拼音音节：zhuang / chuang / shuang = 6 */
const MAX_SYLLABLE_LEN = 6

/** 判断是否为合法拼音音节 */
export function isValidSyllable(s: string): boolean {
  return SYLLABLE_SET.has(s)
}

let _prefixes: Set<string> | null = null
/** 所有合法拼音 / 词组的"前缀"集合，用于判断输入是否还有可能拼成汉字 */
function prefixes(): Set<string> {
  if (_prefixes) return _prefixes
  const set = new Set<string>([''])
  for (const syl of SYLLABLES) {
    for (let i = 1; i <= syl.length; i++) set.add(syl.slice(0, i))
  }
  for (const key of Object.keys(WORD_DICT)) {
    for (let i = 1; i <= key.length; i++) set.add(key.slice(0, i))
  }
  _prefixes = set
  return set
}

let _abbrPrefixes: Set<string> | null = null
/** 所有简拼键（首字母缩写）的前缀集合，如 b / bj / bjs */
function abbrPrefixes(): Set<string> {
  if (_abbrPrefixes) return _abbrPrefixes
  const set = new Set<string>()
  for (const key of Object.keys(ABBR_DICT)) {
    for (let i = 1; i <= key.length; i++) set.add(key.slice(0, i))
  }
  _abbrPrefixes = set
  return set
}

/**
 * 判断这段拼音是否"还有希望"继续往下拼。
 * 例如 'z'、'nih'、'bj'（简拼前缀）都会返回 true，而 'zz' 返回 false。
 */
export function canContinuePinyin(input: string): boolean {
  if (!input) return true
  if (prefixes().has(input) || abbrPrefixes().has(input)) return true

  const n = input.length
  const reach: boolean[] = new Array(n + 1).fill(false)
  reach[0] = true

  for (let i = 0; i < n; i++) {
    if (!reach[i]) continue
    for (let len = 1; len <= MAX_SYLLABLE_LEN && i + len <= n; len++) {
      if (SYLLABLE_SET.has(input.slice(i, i + len))) reach[i + len] = true
    }
    for (let len = 2; len <= MAX_WORD_KEY_LEN && i + len <= n; len++) {
      if (WORD_DICT[input.slice(i, i + len)]) reach[i + len] = true
    }
  }

  for (let i = 0; i <= n; i++) {
    if (!reach[i]) continue
    const tail = input.slice(i)
    // 后半段可以是拼音前缀，也可以是简拼前缀（如 bei + j -> beij）
    if (prefixes().has(tail) || (tail && abbrPrefixes().has(tail))) return true
  }
  return false
}

/**
 * 把一个连续拼音串切分成若干"词 / 音节"。
 * 从后往前做动态规划，优先"段数最少"，其次"长段优先"。
 */
export function segmentPinyin(input: string): Segment[] | null {
  if (!input) return []

  const n = input.length
  const dp: (Segment[] | null)[] = new Array(n + 1).fill(null)
  dp[n] = []

  for (let i = n - 1; i >= 0; i--) {
    let best: Segment[] | null = null
    let bestScore = Infinity
    let bestHeadLen = -1

    const consider = (seg: Segment, len: number) => {
      const tail = dp[i + len]
      if (!tail) return
      const score = tail.length + 1
      if (score < bestScore || (score === bestScore && len > bestHeadLen)) {
        best = [seg, ...tail]
        bestScore = score
        bestHeadLen = len
      }
    }

    // 1) 优先尝试词组
    const maxWordLen = Math.min(MAX_WORD_KEY_LEN, n - i)
    for (let len = maxWordLen; len >= 2; len--) {
      const key = input.slice(i, i + len)
      if (!WORD_DICT[key]) continue
      consider({ type: 'word', key }, len)
    }

    // 2) 再尝试单个音节
    const maxSylLen = Math.min(MAX_SYLLABLE_LEN, n - i)
    for (let len = maxSylLen; len >= 1; len--) {
      const key = input.slice(i, i + len)
      if (!SYLLABLE_SET.has(key)) continue
      consider({ type: 'char', key }, len)
    }

    dp[i] = best
  }

  return dp[0]
}

/** 取某一段的首选文本 */
function firstOfSeg(seg: Segment): string {
  if (seg.type === 'word') return WORD_DICT[seg.key]?.[0] ?? ''
  return CHAR_DICT[seg.key]?.[0] ?? ''
}

/** 把整串拼音切成音节（只认音节，不认词组）；切不开返回 null */
function splitSyllables(s: string): string[] | null {
  const n = s.length
  const dp: (string[] | null)[] = new Array(n + 1).fill(null)
  dp[n] = []
  for (let i = n - 1; i >= 0; i--) {
    for (let len = Math.min(MAX_SYLLABLE_LEN, n - i); len >= 1; len--) {
      const key = s.slice(i, i + len)
      const tail = dp[i + len]
      if (tail && SYLLABLE_SET.has(key)) {
        dp[i] = [key, ...tail]
        break
      }
    }
  }
  return dp[0]
}

/** 混合输入（首音节全拼 + 后续首字母）每个键最多给几个词 */
const MAX_HYBRID_WORDS = 12
/** 混合输入时，「第一个字」的单字候选最多给几个 */
const MAX_HEAD_CHARS = 20

interface HybridBucket {
  /** 该词组的首字母缩写，用来借简拼表的排序结果 */
  initials: string
  words: string[]
}

let _hybrid: Map<string, HybridBucket> | null = null
/**
 * 混合输入索引：「首音节打全 + 后续音节只打首字母」-> 候选词。
 *
 * 例：lianx -> 联想(lian+xiang) / 联系(lian+xi) / 脸型(lian+xing) / 连续(lian+xu)
 *
 * 这是比整串全拼更常用的打法，但词库里的键只有全拼（lianxiang）和纯首字母（lx），
 * 所以这里从 WORD_DICT 的键反推音节、拼出混合键。
 * 排序借用 ABBR_DICT[首字母]（已按常用度排好），保证「联想」这类高频词排前面。
 */
function hybridDict(): Map<string, HybridBucket> {
  if (_hybrid) return _hybrid
  const map = new Map<string, HybridBucket>()
  for (const [pyKey, words] of Object.entries(WORD_DICT)) {
    const syls = splitSyllables(pyKey)
    if (!syls || syls.length < 2) continue
    const initials = syls.map((s) => s[0]).join('')
    const key = syls[0] + initials.slice(1)
    let bucket = map.get(key)
    if (!bucket) {
      bucket = { initials, words: [] }
      map.set(key, bucket)
    }
    for (const w of words) {
      if (!bucket.words.includes(w)) bucket.words.push(w)
    }
  }
  // 借简拼表的顺序排名，再把不在简拼表里的词按原顺序排在后面
  for (const bucket of map.values()) {
    const order = ABBR_DICT[bucket.initials] ?? []
    const rank = new Map<string, number>()
    for (let i = 0; i < order.length; i++) rank.set(order[i], i)
    bucket.words.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
    bucket.words = bucket.words.slice(0, MAX_HYBRID_WORDS)
  }
  _hybrid = map
  return map
}

/**
 * 取输入串的「第一个音节」：最长的、能构成完整音节的合法前缀，且后面还有剩余。
 * lianx -> lian，lianxr -> lian，lian -> ''（整串就是音节，不需要拆）
 */
function headSyllable(input: string): string {
  for (let len = Math.min(MAX_SYLLABLE_LEN, input.length - 1); len >= 1; len--) {
    const head = input.slice(0, len)
    if (SYLLABLE_SET.has(head) && /^[a-z]+$/.test(input.slice(len))) return head
  }
  return ''
}


/**
 * 根据拼音串计算候选列表。
 *
 * 返回值中的 `consume` 表示点击该候选后需要从拼音缓冲区消费的字符数：
 * 例如输入 'nihaoshijie'，候选 '你好' 只消费前 5 个字符，剩余 'shijie' 继续留待选择。
 */
export function getCandidates(input: string): Candidate[] {
  if (!input) return []
  const out: Candidate[] = []
  const seen = new Set<string>()

  const push = (text: string, type: CandidateType, consume: number) => {
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push({ text, type, consume })
  }

  // 0) 只打一个字母：给出这个声母下尽可能多的常用单字（联想字），全部排在最前面。
  //    词候选仍由步骤 3 补在后面，不占主视觉；候选栏可横滑 / 展开看全部。
  if (input.length === 1) {
    const initialChars = INITIAL_CHAR_DICT[input]
    if (initialChars) {
      for (const c of initialChars) push(c, 'char', input.length)
    }
  }

  // 1) 整串就是一个词
  const words = WORD_DICT[input]
  if (words) {
    for (const w of words) push(w, 'word', input.length)
  }

  // 2) 整串就是一个音节 -> 单字候选
  const chars = CHAR_DICT[input]
  if (chars) {
    for (const c of chars) push(c, 'char', input.length)
  }

  // 2.5) 混合输入：首音节打全 + 后续音节只打首字母，如 lianx -> 联想 / 联系 / 脸型
  const hybrid = hybridDict().get(input)
  if (hybrid) {
    for (const w of hybrid.words) push(w, 'word', input.length)
  }

  // 2.6) 同一串输入再补上「第一个字」的单字候选：
  //      打 lianx 时首段 lian 已是完整音节，顺手给出 脸 / 连 / 练 …
  //      consume 只算首音节，选中后剩下的 x 留在缓冲区继续打
  const headSyl = headSyllable(input)
  if (hybrid && headSyl) {
    let n = 0
    for (const c of CHAR_DICT[headSyl] ?? '') {
      if (n >= MAX_HEAD_CHARS) break
      n++
      push(c, 'char', headSyl.length)
    }
  }

  // 3) 简拼：首字母缩写，如 bj -> 北京 / 比较，zg -> 中国
  //    单字母时只补少量高频词（排在步骤 0 的联想字后面），多字母简拼仍是完整词候选。
  const abbrWords = ABBR_DICT[input]
  // 已经用拼音打出了字（单字母 b 只能是简拼，bei / nv / qing 则已经是完整音节），
  // 就把简拼候选整体退到后面：否则打 "qing" 时「情况」会压着"清 / 请"排在最前面。
  const demoteAbbr = abbrWords != null && (chars?.length ?? 0) > 0
  if (abbrWords && !demoteAbbr) {
    for (const w of abbrWords) push(w, 'word', input.length)
  }

  // 4) 切分成多段：给出"首段候选 + 后续最佳组合"
  //    混合输入已命中时跳过：那时尾部是个首字母（lianx 的 x），
  //    按"完整音节"去补会拼出「连西」这种没意义的组合，反而盖住真正的词。
  const segs = hybrid ? null : segmentPinyin(input)
  if (segs && segs.length > 1) {
    const head = segs[0]
    const rest = segs
      .slice(1)
      .map(firstOfSeg)
      .join('')
    if (rest) {
      const pool: string[] =
        head.type === 'word'
          ? (WORD_DICT[head.key] ?? [])
          : [...(CHAR_DICT[head.key] ?? '')]
      for (const t of pool) push(t + rest, head.type, head.key.length)
    }
  }

  if (abbrWords && demoteAbbr) {
    for (const w of abbrWords) push(w, 'word', input.length)
  }

  return out
}

/** 点击候选后，缓冲区剩余的拼音 */
export function getRemainingPinyin(input: string, candidate: Candidate): string {
  return input.slice(Math.min(candidate.consume, input.length))
}

/** 联想词库中最长的前置词长度 */
const MAX_ASSOC_KEY_LEN = 4

/**
 * "末字成词"用的单字联想表：字 -> 以它开头的常用词。
 * 联想库里没有的常用字（如"女 -> 女士 / 女儿"）在这里补，让任意单字结尾都能接着联想。
 * 返回的 Map 里还包含每个词本身（长度 > 1 的键），用来判断"末尾是不是已经是一个完整的词"。
 */
let _charAssoc: Map<string, string[]> | null = null
function charAssoc(): Map<string, string[]> {
  if (_charAssoc) return _charAssoc
  const map = new Map<string, string[]>()
  const add = (key: string, words: readonly string[]) => {
    const list = map.get(key) ?? []
    for (const w of words) {
      if (w.length > 1 && w.startsWith(key) && !list.includes(w)) list.push(w)
    }
    map.set(key, list)
  }
  // 收集全部词：词表 + 简拼索引里的词
  const all = new Set<string>()
  for (const list of Object.values(WORD_DICT)) for (const w of list) all.add(w)
  for (const list of Object.values(ABBR_DICT)) for (const w of list) all.add(w)
  // 索引按"字"聚合：每个词的每个字都登记一次，
  // 这样"女儿"会被登记到"女"上，"觉得"会被登记到"觉"和"得"上，
  // 任意单字结尾都能联想，而不只是首字母那张表里的字。
  for (const w of all) {
    for (let i = 0; i < w.length - 1; i++) add(w[i], [w])
  }
  // 联想库里的单字项（如 我 -> 我们 / 我的）优先并进来
  for (const [key, list] of Object.entries(ASSOCIATIONS)) {
    if (key.length !== 1) continue
    add(key, list)
  }
  // 词本身也登记成键（值为空数组是不行的，这里用自身占位），便于 O(1) 判断"是不是一个词"
  for (const w of all) {
    if (!map.has(w)) map.set(w, [])
  }
  _charAssoc = map
  return map
}

/** 该字符串是不是词库里收录的词（用于判断文本末尾是否已经构成一个完整词） */
let _knownWords: Set<string> | null = null
function isKnownWord(w: string): boolean {
  if (!w) return false
  if (!_knownWords) {
    const set = new Set<string>()
    for (const list of Object.values(WORD_DICT)) for (const x of list) set.add(x)
    for (const list of Object.values(ABBR_DICT)) for (const x of list) set.add(x)
    _knownWords = set
  }
  return _knownWords.has(w)
}

/**
 * 根据已上屏文本，返回联想词（下一个词推荐）。
 *
 * 从末尾由长到短取 1~4 个字去联想库匹配，命中即返回。
 * 例如 "我爱北京" -> 命中 "北京" -> ["市", "时间", "大学", ...]
 *
 * 单字结尾同样联想（"女" -> "女士 / 女儿"，"我觉得" -> "得到 / 得到解决"），
 * 且只返回**以该字开头**的词：单字上下文太短，跨词语义歧义大，
 * "我要" 不该联想成 "要求"。
 */
export function getAssociations(text: string, limit = 10): string[] {
  if (!text) return []
  const chars = Array.from(text)

  for (let len = Math.min(MAX_ASSOC_KEY_LEN, chars.length); len >= 2; len--) {
    const key = chars.slice(chars.length - len).join('')
    const list = ASSOCIATIONS[key]
    if (list && list.length) return list.slice(0, limit)
  }

  // 先看末尾两个字是不是词库里的词：
  //   是（北京 / 我要）-> 直接用词级联想，"北京" -> 市 / 时间，"我要" -> 办理 / 咨询
  //   不是（末尾就是一个孤立字，如"女" / "我"）-> 用单字联想，且只收以该字开头的词，
  //   否则"我要"会被联想成"要求"这种跨词误伤
  const t1 = chars.slice(-1)[0]
  const t2 = chars.length >= 2 ? chars.slice(-2).join('') : ''
  const wordTail = t2 && isKnownWord(t2) ? t2 : ''
  const last = wordTail ? [...wordTail].slice(-1)[0] : t1
  const pool = [...(ASSOCIATIONS[last] ?? []), ...(charAssoc().get(last) ?? [])]
  const filtered = pool.filter((w) => w !== last && w.startsWith(last))
  const wordPool = wordTail ? (ASSOCIATIONS[wordTail] ?? []) : []
  return [...new Set(wordTail ? wordPool : filtered)].slice(0, limit)
}

/** 便捷方法：把候选应用到当前拼音串 */
export function applyCandidate(
  input: string,
  candidate: Candidate
): { rest: string } {
  return { rest: getRemainingPinyin(input, candidate) }
}
