/**
 * 博客简历页（/resume）。
 *
 * 默认数据在 src/data/resume.json（构建时内嵌），页面打开后：
 *  - 直接改字段 → 只存在浏览器 localStorage，刷新不丢，不上传
 *  - 恢复默认 / 清空重填（给访客当模板用）
 *  - 导出 PDF：snapdom 截图 + jspdf，按 A4 自动分页（与 ip-studio 同一套）
 *
 * 样式类名（.resume-sheet / .rs-*）与 ip-studio 保持一致，方便两边对照。
 */

const STORE_KEY = 'resume-draft-v2'
const SAVE_MS = 400

const PAGE_W_MM = 210
const PAGE_H_MM = 297
const PAGE_MARGIN_MM = 12
const CONTENT_W_MM = PAGE_W_MM - PAGE_MARGIN_MM * 2
const CONTENT_H_MM = PAGE_H_MM - PAGE_MARGIN_MM * 2

interface Basics {
  name: string
  gender: string
  age: string
  phone: string
  email: string
  education: string
  experience: string
  targetCity: string
  targetRole: string
  homepage: string
  github: string
  photo: string
  summary: string
}

interface Entry {
  id: string
  title: string
  subtitle: string
  start: string
  end: string
  meta: string
  tags: string
  bullets: string[]
}

type SectionKind = 'education' | 'work' | 'project' | 'skills' | 'custom'

interface Section {
  id: string
  kind: SectionKind
  title: string
  entries: Entry[]
  lines: string[]
}

interface ResumeData {
  version: 1
  basics: Basics
  sections: Section[]
}

const SECTION_KINDS: { value: SectionKind; label: string }[] = [
  { value: 'education', label: '教育经历' },
  { value: 'work', label: '工作经历' },
  { value: 'project', label: '项目经历' },
  { value: 'skills', label: '专业技能' },
  { value: 'custom', label: '自定义模块' },
]

const BASIC_FIELDS: { key: keyof Basics; label: string; wide?: boolean; area?: boolean }[] = [
  { key: 'name', label: '姓名' },
  { key: 'targetRole', label: '求职意向' },
  { key: 'phone', label: '电话' },
  { key: 'email', label: '邮箱' },
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'education', label: '学历' },
  { key: 'experience', label: '工作年限' },
  { key: 'targetCity', label: '期望城市' },
  { key: 'homepage', label: '主页' },
  { key: 'github', label: 'GitHub' },
  { key: 'summary', label: '一句话简介', wide: true, area: true },
]

/* ── 工具 ───────────────────────────────────────────────────── */

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function uid(): string {
  return `x${Math.random().toString(36).slice(2, 9)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function safeFileName(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
}

/** 「项目背景：」这类短标签自动加粗，正文保持常规字重；也支持 `**加粗**`。 */
function inlineHtml(text: string): string {
  if (!text.includes('**')) {
    const colon = text.indexOf('：')
    if (colon > 0 && colon <= 24) {
      return `<strong>${esc(text.slice(0, colon + 1))}</strong>${esc(text.slice(colon + 1))}`
    }
    return esc(text)
  }
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? `<strong>${esc(part.slice(2, -2))}</strong>`
        : esc(part),
    )
    .join('')
}

/* ── 图标（feather 风格，跟着文字颜色走） ───────────────────── */

const ICONS: Record<string, string> = {
  education:
    '<path d="M22 10 12 5 2 10l10 5 10-5z"></path><path d="M6 12v5c0 1.3 2.7 3 6 3s6-1.7 6-3v-5"></path>',
  work: '<rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
  project: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  skills: '<path d="M14 4l6 6-3 3-6-6z"></path><path d="M11 7 4 14v6h6l7-7"></path>',
  medal:
    '<circle cx="12" cy="15" r="5"></circle><path d="M8 3h8l-2 5h-4z"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"></path>',
  phone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z"></path>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path>',
  web: '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 3 0 0 1 0 20 15 3 0 0 1 0-20z"></path>',
  github:
    '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 19.9 5 4.9 4.9 0 0 0 19.8 1S18.4.6 16 2.5a12.3 12.3 0 0 0-8 0C5.6.6 4.2 1 4.2 1A4.9 4.9 0 0 0 4.1 5a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7A3.4 3.4 0 0 0 8 18v4"></path>',
}

function icon(name: string, className = 'rs-ico'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.user}</svg>`
}

function sectionIcon(kind: SectionKind, title: string): string {
  if (kind !== 'custom') return kind
  if (/证书|荣誉|奖项/.test(title)) return 'medal'
  return 'user'
}

/* ── bullets 解析（与 ip-studio 一致） ─────────────────────── */

type BulletBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'ol'; items: { text: string; subs: string[] }[] }
  | { type: 'ul'; items: string[] }

const BULLET_MARK = /^(##\s|\d+[.、)]\s|[-]\s)/

function parseBullets(lines: string[]): BulletBlock[] | null {
  const trimmed = lines.map((line) => line.trim()).filter(Boolean)
  if (!trimmed.some((line) => BULLET_MARK.test(line))) return null

  const blocks: BulletBlock[] = []
  let current: BulletBlock | null = null

  for (const line of trimmed) {
    if (line.startsWith('## ')) {
      current = { type: 'heading', text: line.slice(3).trim() }
      blocks.push(current)
      continue
    }
    const ordered = /^\d+[.、)]\s+(.*)$/.exec(line)
    if (ordered) {
      const item = { text: ordered[1], subs: [] as string[] }
      if (current?.type === 'ol') current.items.push(item)
      else {
        current = { type: 'ol', items: [item] }
        blocks.push(current)
      }
      continue
    }
    const sub = /^[-·•]\s+(.*)$/.exec(line)
    if (sub) {
      if (current?.type === 'ol' && current.items.length) current.items[current.items.length - 1].subs.push(sub[1])
      else if (current?.type === 'ul') current.items.push(sub[1])
      else {
        current = { type: 'ul', items: [sub[1]] }
        blocks.push(current)
      }
      continue
    }
    current = { type: 'text', text: line }
    blocks.push(current)
  }

  return blocks
}

function bulletsHtml(lines: string[]): string {
  const blocks = parseBullets(lines)
  if (!blocks) {
    const items = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const sub = /^[·•]\s*/.test(line)
        return `<li${sub ? ' class="is-sub"' : ''}>${inlineHtml(line.replace(/^[·•]\s*/, ''))}</li>`
      })
      .join('')
    return `<ul class="rs-bullets">${items}</ul>`
  }

  return blocks
    .map((block) => {
      if (block.type === 'heading') return `<p class="rs-kicker">${inlineHtml(block.text)}</p>`
      if (block.type === 'text') return `<p class="rs-para">${inlineHtml(block.text)}</p>`
      if (block.type === 'ol') {
        const items = block.items
          .map((item) => {
            const subs = item.subs.length
              ? `<ul class="rs-subs">${item.subs.map((sub) => `<li>${inlineHtml(sub)}</li>`).join('')}</ul>`
              : ''
            return `<li>${inlineHtml(item.text)}${subs}</li>`
          })
          .join('')
        return `<ol class="rs-ol">${items}</ol>`
      }
      return `<ul class="rs-bullets">${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`
    })
    .join('')
}

/* ── 渲染简历纸张 ──────────────────────────────────────────── */

function dateRange(entry: Entry): string {
  const start = entry.start.trim()
  const end = entry.end.trim()
  if (start && end) return `${start} - ${end}`
  return start || end
}

function entryHtml(entry: Entry): string {
  const bullets = entry.bullets.map((line) => line.trim()).filter(Boolean)
  if (!entry.title.trim() && !entry.subtitle.trim() && !bullets.length) return ''
  const right = entry.meta.trim() || dateRange(entry)
  return `<div class="rs-entry">
    ${
      entry.title.trim() || right
        ? `<div class="rs-entry-head"><strong>${esc(entry.title.trim())}</strong>${right ? `<span>${esc(right)}</span>` : ''}</div>`
        : ''
    }
    ${entry.subtitle.trim() ? `<p class="rs-sub">${esc(entry.subtitle.trim())}</p>` : ''}
    ${entry.tags.trim() ? `<p class="rs-tags">技术栈：${esc(entry.tags.trim())}</p>` : ''}
    ${bullets.length ? bulletsHtml(bullets) : ''}
  </div>`
}

function sectionHtml(section: Section): string {
  const entries = section.entries
    .filter(
      (entry) =>
        entry.title.trim() ||
        entry.subtitle.trim() ||
        entry.bullets.some((line) => line.trim()),
    )
    .map(entryHtml)
    .join('')
  const lines = section.lines.filter((line) => line.trim())
  if (!entries && !lines.length) return ''

  return `<section class="rs-section">
    <h3>${icon(sectionIcon(section.kind, section.title), 'rs-section-icon')}<span>${esc(section.title.trim() || SECTION_KINDS.find((item) => item.value === section.kind)?.label || '')}</span></h3>
    ${entries}
    ${lines.length ? `<ul class="rs-bullets">${lines.map((line) => `<li>${inlineHtml(line.trim())}</li>`).join('')}</ul>` : ''}
  </section>`
}

function sheetHtml(data: ResumeData): string {
  const basics = data.basics
  const identity = [basics.gender, basics.age, basics.education, basics.experience].filter(Boolean)
  const contact = [
    basics.phone
      ? `<span class="rs-chip">${icon('phone')}<span class="rs-code">${esc(basics.phone)}</span></span>`
      : '',
    basics.email
      ? `<span class="rs-chip">${icon('mail')}<span class="rs-code">${esc(basics.email)}</span></span>`
      : '',
  ].join('')
  const target = [
    basics.targetRole ? `<span>求职意向：${esc(basics.targetRole)}</span>` : '',
    identity.length ? `<span class="rs-identity">${esc(identity.join(' · '))}</span>` : '',
  ].join('')
  const links = [
    basics.homepage
      ? `<span class="rs-chip">${icon('web')} 主页：<span class="rs-code">${esc(basics.homepage)}</span></span>`
      : '',
    basics.github
      ? `<span class="rs-chip">${icon('github')} GitHub：<span class="rs-code">${esc(basics.github)}</span></span>`
      : '',
    basics.targetCity ? `<span>期望城市：${esc(basics.targetCity)}</span>` : '',
  ].join('')

  return `<header class="rs-head">
    ${basics.photo ? `<img class="rs-photo" src="${esc(basics.photo)}" alt="头像">` : ''}
    <h2>${esc(basics.name.trim() || '姓名')}</h2>
    ${contact ? `<p class="rs-line">${contact}</p>` : ''}
    ${target ? `<p class="rs-line">${target}</p>` : ''}
    ${links ? `<p class="rs-line">${links}</p>` : ''}
  </header>
  ${basics.summary.trim() ? `<p class="rs-summary">${inlineHtml(basics.summary.trim())}</p>` : ''}
  ${data.sections.map(sectionHtml).join('')}`
}

/* ── 编辑表单 ──────────────────────────────────────────────── */

function textInput(path: string, value: string, placeholder = ''): string {
  return `<input class="rf-input" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false">`
}

function areaInput(path: string, value: string, placeholder = ''): string {
  return `<textarea class="rf-input rf-area" data-path="${path}" placeholder="${esc(placeholder)}" spellcheck="false">${esc(value)}</textarea>`
}

/** 按模块类型决定显示哪些字段：没用到的字段不占地方，数据本身不删。 */
function entryFields(kind: SectionKind): {
  title: string
  subtitle: string
  time: boolean
  meta: boolean
  tags: boolean
} {
  if (kind === 'education') {
    return { title: '学校', subtitle: '专业 / 学历', time: false, meta: true, tags: false }
  }
  if (kind === 'work') {
    return { title: '公司', subtitle: '岗位', time: true, meta: false, tags: true }
  }
  if (kind === 'project') {
    return { title: '项目名', subtitle: '角色', time: true, meta: false, tags: true }
  }
  return { title: '标题', subtitle: '副标题', time: false, meta: false, tags: false }
}

function entryEditor(
  sectionIndex: number,
  entryIndex: number,
  entry: Entry,
  count: number,
  kind: SectionKind,
): string {
  const base = `sections.${sectionIndex}.entries.${entryIndex}`
  const fields = entryFields(kind)
  return `<div class="rf-entry">
    <div class="rf-entry-head">
      <span class="rf-entry-no">条目 ${entryIndex + 1}</span>
      <span class="rf-tools">
        <button type="button" class="rf-mini" data-action="entry-up" data-section="${sectionIndex}" data-entry="${entryIndex}" ${entryIndex === 0 ? 'disabled' : ''} title="上移">↑</button>
        <button type="button" class="rf-mini" data-action="entry-down" data-section="${sectionIndex}" data-entry="${entryIndex}" ${entryIndex === count - 1 ? 'disabled' : ''} title="下移">↓</button>
        <button type="button" class="rf-mini rf-del" data-action="entry-del" data-section="${sectionIndex}" data-entry="${entryIndex}" title="删除条目">×</button>
      </span>
    </div>
    <div class="rf-grid">
      <label class="rf-field"><span>${fields.title}</span>${textInput(`${base}.title`, entry.title, fields.title)}</label>
      <label class="rf-field"><span>${fields.subtitle}</span>${textInput(`${base}.subtitle`, entry.subtitle, fields.subtitle)}</label>
      ${fields.time ? `<label class="rf-field"><span>开始</span>${textInput(`${base}.start`, entry.start, '2025.01')}</label>` : ''}
      ${fields.time ? `<label class="rf-field"><span>结束</span>${textInput(`${base}.end`, entry.end, '至今')}</label>` : ''}
      ${fields.meta ? `<label class="rf-field rf-wide"><span>右侧补充</span>${textInput(`${base}.meta`, entry.meta, 'GPA / 专业排名')}</label>` : ''}
      ${fields.tags ? `<label class="rf-field rf-wide"><span>技术栈</span>${textInput(`${base}.tags`, entry.tags, 'React / TypeScript / Vite')}</label>` : ''}
      <label class="rf-field rf-wide"><span>正文（一行一条）</span>${areaInput(`${base}.bullets`, entry.bullets.join('\n'), '## 小标题\n1. 条目\n- 子条目\n**加粗** 重点')}</label>
    </div>
  </div>`
}

function sectionEditor(section: Section, index: number, count: number): string {
  const base = `sections.${index}`
  return `<div class="rf-section">
    <div class="rf-section-head">
      <input class="rf-input rf-section-title" data-path="${base}.title" value="${esc(section.title)}" placeholder="模块标题" spellcheck="false">
      <span class="rf-tools">
        <button type="button" class="rf-mini" data-action="section-up" data-section="${index}" ${index === 0 ? 'disabled' : ''} title="上移">↑</button>
        <button type="button" class="rf-mini" data-action="section-down" data-section="${index}" ${index === count - 1 ? 'disabled' : ''} title="下移">↓</button>
        <button type="button" class="rf-mini rf-del" data-action="section-del" data-section="${index}" title="删除模块">×</button>
      </span>
    </div>
    ${section.entries.map((entry, entryIndex) => entryEditor(index, entryIndex, entry, section.entries.length, section.kind)).join('')}
    <label class="rf-field rf-wide rf-lines"><span>整段列表（一行一条，适合技能 / 荣誉；不需要可留空）</span>${areaInput(`${base}.lines`, section.lines.join('\n'))}</label>
    <div class="rf-add-row">
      <button type="button" class="rf-add-btn" data-action="entry-add" data-section="${index}">+ 加一条${section.entries.length ? '经历' : '内容'}</button>
    </div>
  </div>`
}

function editorHtml(data: ResumeData): string {
  return `<div class="rf-block">
      <h3 class="rf-block-title">基本信息</h3>
      <div class="rf-grid">
        ${BASIC_FIELDS.map((field) =>
          field.area
            ? `<label class="rf-field rf-wide"><span>${field.label}</span>${areaInput(`basics.${field.key}`, data.basics[field.key])}</label>`
            : `<label class="rf-field"><span>${field.label}</span>${textInput(`basics.${field.key}`, data.basics[field.key])}</label>`,
        ).join('')}
        <div class="rf-field rf-wide rf-photo">
          <span>头像</span>
          <div class="rf-photo-row">
            <input type="file" accept="image/*" data-photo>
            ${data.basics.photo ? '<button type="button" class="rf-mini rf-del" data-action="photo-clear" title="移除头像">×</button>' : ''}
          </div>
          <small>只存在本机浏览器；导出 PDF 时会带上。</small>
        </div>
      </div>
    </div>

    <div class="rf-block">
      <h3 class="rf-block-title">模块</h3>
      ${data.sections.map((section, index) => sectionEditor(section, index, data.sections.length)).join('')}
      <div class="rf-add-row">
        <select class="rf-input rf-kind" data-new-kind>
          ${SECTION_KINDS.map((kind) => `<option value="${kind.value}">${kind.label}</option>`).join('')}
        </select>
        <button type="button" class="rf-add-btn" data-action="section-add">+ 添加模块</button>
      </div>
    </div>`
}

/* ── 状态 ──────────────────────────────────────────────────── */

function blankEntry(): Entry {
  return { id: uid(), title: '', subtitle: '', start: '', end: '', meta: '', tags: '', bullets: [] }
}

function blankResume(): ResumeData {
  return {
    version: 1,
    basics: {
      name: '你的名字',
      gender: '',
      age: '',
      phone: '',
      email: '',
      education: '',
      experience: '',
      targetCity: '',
      targetRole: '',
      homepage: '',
      github: '',
      photo: '',
      summary: '',
    },
    sections: [
      { id: uid(), kind: 'education', title: '教育经历', entries: [blankEntry()], lines: [] },
      { id: uid(), kind: 'work', title: '工作经历', entries: [blankEntry()], lines: [] },
      { id: uid(), kind: 'project', title: '项目经历', entries: [blankEntry()], lines: [] },
      { id: uid(), kind: 'skills', title: '专业技能', entries: [], lines: [''] },
    ],
  }
}

function setByPath(target: unknown, path: string, value: string): void {
  const keys = path.split('.')
  let node = target as Record<string, unknown>
  for (let index = 0; index < keys.length - 1; index += 1) {
    const next = node[keys[index]]
    if (next === undefined || next === null) return
    node = next as Record<string, unknown>
  }
  const last = keys[keys.length - 1]
  node[last] = Array.isArray(node[last]) ? value.split('\n') : value
}

async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const max = 260
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', 0.86)
}

/* ── Markdown 导入 / 导出（与 ip-studio 同一套格式，两边能互相导） ── */

/** frontmatter 的键，与 basics 字段同名。 */
const META_KEYS: (keyof Basics)[] = [
  'name',
  'gender',
  'age',
  'phone',
  'email',
  'education',
  'experience',
  'targetRole',
  'targetCity',
  'homepage',
  'github',
  'summary',
]

/** 没写标题的条目，导出时占个位；导入时还原成空标题。 */
const UNTITLED = '（未命名）'

function metaScalar(text: string): string {
  if (!text) return "''"
  const safe = /^[A-Za-z0-9\u4e00-\u9fa5][^"'#\n\r\t]*$/.test(text) && !/:\s/.test(text) && !/:\s*$/.test(text)
  return safe ? text : JSON.stringify(text)
}

function parseScalar(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    try {
      return String(JSON.parse(value))
    } catch {
      return value.slice(1, -1)
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return value.slice(1, -1)
  return value
}

/** 标题 → 模块类型：先认标准名，再按关键词猜，猜不到算自定义。 */
function kindFromTitle(title: string): SectionKind {
  for (const kind of SECTION_KINDS) {
    if (title === kind.label) return kind.value
  }
  if (/教育|学历|学校/.test(title)) return 'education'
  if (/工作|实习|经历/.test(title)) return 'work'
  if (/项目/.test(title)) return 'project'
  if (/技能|能力|擅长/.test(title)) return 'skills'
  return 'custom'
}

function listLine(line: string): string {
  return /^([-*+]|\d+[.、)])\s/.test(line) ? line : `- ${line}`
}

/** 简历 → Markdown（头像不写进 md：base64 会变成一屏乱码）。 */
function toMarkdown(data: ResumeData): string {
  const out: string[] = ['---']
  for (const key of META_KEYS) {
    const value = (data.basics[key] ?? '').trim()
    if (value) out.push(`${key}: ${metaScalar(value)}`)
  }
  out.push('---', '')

  const title = [data.basics.name.trim(), data.basics.targetRole.trim()].filter(Boolean).join(' · ')
  out.push(`# ${title || '未命名简历'}`)
  const summary = data.basics.summary.trim()
  if (summary) out.push('', `> ${summary}`)

  for (const section of data.sections) {
    const lines = section.lines.map((line) => line.trim()).filter(Boolean)
    const entries = section.entries.filter(
      (entry) => entry.title.trim() || entry.subtitle.trim() || entry.bullets.some((line) => line.trim()),
    )
    if (!lines.length && !entries.length) continue

    const heading = section.title.trim() || SECTION_KINDS.find((item) => item.value === section.kind)?.label || ''
    out.push('', `## ${heading}`)
    // 标题认不出类型时补一行注释，导回来才不会丢 kind
    if (kindFromTitle(heading) !== section.kind) out.push('', `<!-- kind: ${section.kind} -->`)

    if (lines.length) {
      out.push('')
      for (const line of lines) out.push(listLine(line))
    }

    for (const entry of entries) {
      out.push('', `### ${entry.title.trim() || UNTITLED}`)
      const fields: string[] = []
      if (entry.subtitle.trim()) fields.push(`- 副标题：${entry.subtitle.trim()}`)
      const start = entry.start.trim()
      const end = entry.end.trim()
      if (start || end) fields.push(`- 时间：${start}${start && end ? ' - ' : ''}${end}`)
      if (entry.meta.trim()) fields.push(`- 备注：${entry.meta.trim()}`)
      if (entry.tags.trim()) fields.push(`- 标签：${entry.tags.trim()}`)
      if (fields.length) out.push('', ...fields)

      const bullets = entry.bullets.map((line) => line.trim()).filter(Boolean)
      if (bullets.length) {
        out.push('')
        for (const bullet of bullets) out.push(/^##\s/.test(bullet) ? `#### ${bullet.slice(2).trim()}` : bullet)
      }
    }
  }

  return `${out.join('\n').trimEnd()}\n`
}

function splitFrontmatter(markdown: string): { meta: Record<string, string>; body: string } {
  const text = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') return { meta: {}, body: text }
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      end = index
      break
    }
  }
  if (end < 0) return { meta: {}, body: text }

  const meta: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    meta[match[1]] = parseScalar(match[2])
  }
  return { meta, body: lines.slice(end + 1).join('\n') }
}

const FIELD_LINE = /^[-*]\s*(副标题|时间|备注|标签|subtitle|time|meta|tags)\s*[：:]\s*(.*)$/

function applyField(entry: Entry, key: string, value: string): void {
  const text = value.trim()
  if (key === '副标题' || key === 'subtitle') entry.subtitle = text
  else if (key === '备注' || key === 'meta') entry.meta = text
  else if (key === '标签' || key === 'tags') entry.tags = text
  else {
    const match = /^(.*?)\s[-–—~]\s(.*)$/.exec(text)
    if (match) {
      entry.start = match[1].trim()
      entry.end = match[2].trim()
    } else {
      entry.start = text
    }
  }
}

/** Markdown → 简历数据；读不懂的地方一律留空，不抛错。 */
function fromMarkdown(markdown: string): ResumeData {
  const { meta, body } = splitFrontmatter(markdown)
  const basics: Basics = {
    name: '',
    gender: '',
    age: '',
    phone: '',
    email: '',
    education: '',
    experience: '',
    targetCity: '',
    targetRole: '',
    homepage: '',
    github: '',
    photo: '',
    summary: '',
  }
  for (const key of META_KEYS) {
    const value = (meta[key] ?? '').trim()
    if (value) basics[key] = value
  }

  const sections: Section[] = []
  let section: Section | null = null
  let entry: Entry | null = null
  let fieldsDone = false
  let inFence = false

  for (const rawLine of body.split('\n')) {
    const trimmed = rawLine.trim()
    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence || !trimmed) continue

    const kindNote = /^<!--\s*kind\s*:\s*([a-z]+)\s*-->$/i.exec(trimmed)
    if (kindNote) {
      const kind = kindNote[1] as SectionKind
      if (section && !section.entries.length && SECTION_KINDS.some((item) => item.value === kind)) section.kind = kind
      continue
    }
    if (trimmed.startsWith('<!--') || trimmed.startsWith('>') || trimmed === '---') continue
    if (/^#\s/.test(trimmed)) continue

    const h4 = /^####\s+(.*)$/.exec(trimmed)
    if (h4) {
      const text = `## ${h4[1].trim()}`
      if (entry) entry.bullets.push(text)
      else if (section) section.lines.push(text)
      continue
    }

    const h3 = /^###\s+(.*)$/.exec(trimmed)
    if (h3) {
      if (!section) continue
      const title = h3[1].trim()
      entry = { ...blankEntry(), title: title === UNTITLED ? '' : title, bullets: [] }
      section.entries.push(entry)
      fieldsDone = false
      continue
    }

    const h2 = /^##\s+(.*)$/.exec(trimmed)
    if (h2) {
      const heading = h2[1].trim()
      section = { id: uid(), kind: kindFromTitle(heading), title: heading, entries: [], lines: [] }
      sections.push(section)
      entry = null
      fieldsDone = false
      continue
    }

    if (!section) continue

    if (entry && !fieldsDone) {
      const field = FIELD_LINE.exec(trimmed)
      if (field) {
        applyField(entry, field[1], field[2])
        continue
      }
      fieldsDone = true
    }

    if (entry) entry.bullets.push(trimmed)
    else section.lines.push(trimmed.replace(/^[-*+]\s+/, ''))
  }

  return { version: 1, basics, sections }
}

/* ── 页面装配 ──────────────────────────────────────────────── */

export function bootResume(): void {
  // 换页后新页面脚本会再跑一遍；监听器只挂一次，避免越积越多
  const state = window as typeof window & { __resumeLoadBound?: boolean }
  if (!state.__resumeLoadBound) {
    state.__resumeLoadBound = true
    document.addEventListener('astro:page-load', bootResume)
  }

  const root = document.querySelector<HTMLElement>('[data-resume-page]')
  if (!root || root.dataset.ready === '1') return
  root.dataset.ready = '1'

  // 默认数据是页面里单独的 <script type="application/json">，不在 root 内部
  const holder = document.querySelector<HTMLScriptElement>('[data-resume-default]')
  let fallback: ResumeData
  try {
    fallback = JSON.parse(holder?.textContent || '{}') as ResumeData
  } catch {
    fallback = blankResume()
  }
  fallback.version = 1

  const sheet = root.querySelector<HTMLElement>('[data-resume-sheet]')
  const editor = root.querySelector<HTMLElement>('[data-resume-editor]')
  const status = root.querySelector<HTMLElement>('[data-resume-status]')
  const toast = root.querySelector<HTMLElement>('[data-resume-toast]')
  const exportButton = root.querySelector<HTMLButtonElement>('[data-action="export"]')
  const editButton = root.querySelector<HTMLButtonElement>('[data-action="edit"]')
  const stage = root.querySelector<HTMLElement>('[data-resume-stage]')
  if (!sheet || !editor || !stage || !status || !toast) return

  let data = load()
  let saveTimer = 0
  let toastTimer = 0
  let exporting = false

  function load(): ResumeData {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ResumeData
        if (parsed?.basics && Array.isArray(parsed.sections)) return parsed
      }
    } catch {}
    return clone(fallback)
  }

  function persist(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data))
      status.textContent = '已保存在本机浏览器'
    } catch {
      status.textContent = '保存失败（可能是浏览器存储满了）'
    }
  }

  function queueSave(): void {
    window.clearTimeout(saveTimer)
    status.textContent = '保存中…'
    saveTimer = window.setTimeout(persist, SAVE_MS)
  }

  function showToast(message: string): void {
    toast.textContent = message
    toast.hidden = false
    toast.classList.add('is-on')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-on')
      toast.hidden = true
    }, 4200)
  }

  function paint(): void {
    sheet.innerHTML = sheetHtml(data)
  }

  function paintEditor(): void {
    editor.innerHTML = editorHtml(data)
  }

  paint()
  paintEditor()
  status.textContent = '修改只保存在本机浏览器'

  /** 下载一份文本文件（导出的 md 落到浏览器的下载目录）。 */
  function downloadText(fileName: string, text: string): void {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportMarkdown(): void {
    downloadText(`${safeFileName(`${data.basics.name.trim() || '简历'}-简历`)}.md`, toMarkdown(data))
    showToast('已导出 Markdown，改完可以再「导入 MD」贴回来')
  }

  function importMarkdown(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,text/markdown'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) return
      void file
        .text()
        .then((text) => {
          const parsed = fromMarkdown(text)
          const hasContent =
            parsed.sections.length > 0 || Object.values(parsed.basics).some((value) => value.trim())
          if (!hasContent) {
            window.alert('这份 md 里没读到简历内容，确认一下是不是「导出 MD」那份。')
            return
          }
          if (!window.confirm('导入会替换掉当前页面上的内容（只影响你自己的浏览器），继续？')) return
          data = { ...parsed, basics: { ...parsed.basics, photo: data.basics.photo } }
          paint()
          paintEditor()
          persist()
          showToast('已导入 Markdown')
        })
        .catch(() => window.alert('这个文件读不出来，换一份 md 试试。'))
    })
    input.click()
  }

  /* 输入：只更新数据 + 预览，不重渲染表单（否则会丢焦点） */
  editor.addEventListener('input', (event) => {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement | null
    const path = field?.dataset?.path
    if (!field || !path) return
    setByPath(data, path, field.value)
    paint()
    queueSave()
  })

  editor.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement
    if (input.type !== 'file' || !input.files?.length) return
    try {
      const photo = await shrinkPhoto(input.files[0])
      if (photo) {
        data.basics.photo = photo
        paint()
        paintEditor()
        queueSave()
      }
    } catch {
      window.alert('这张图读不出来，换一张试试。')
    }
  })

  /* 增删 / 排序 / 工具栏：事件委托 */
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]')
    if (!target) return
    const action = target.dataset.action
    const sectionIndex = Number(target.dataset.section ?? -1)
    const entryIndex = Number(target.dataset.entry ?? -1)
    const section = data.sections[sectionIndex]

    switch (action) {
      case 'edit': {
        const next = !root.classList.contains('is-editing')
        root.classList.toggle('is-editing', next)
        editor.hidden = !next
        if (editButton) editButton.textContent = next ? '完成编辑' : '编辑'
        if (next) editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
      case 'reset': {
        if (!window.confirm('恢复成示例简历？你在本机改的内容会被清掉。')) return
        data = clone(fallback)
        try {
          localStorage.removeItem(STORE_KEY)
        } catch {}
        paint()
        paintEditor()
        status.textContent = '已恢复示例简历'
        break
      }
      case 'blank': {
        if (!window.confirm('清空成空白模板？示例内容会被替换掉（可再点「恢复示例」找回）。')) return
        data = blankResume()
        paint()
        paintEditor()
        persist()
        root.classList.add('is-editing')
        editor.hidden = false
        if (editButton) editButton.textContent = '完成编辑'
        break
      }
      case 'export':
        void exportPdf()
        break
      case 'export-md':
        exportMarkdown()
        break
      case 'import-md':
        importMarkdown()
        break
      case 'photo-clear':
        data.basics.photo = ''
        paint()
        paintEditor()
        queueSave()
        break
      case 'section-up':
      case 'section-down': {
        const to = action === 'section-up' ? sectionIndex - 1 : sectionIndex + 1
        if (to < 0 || to >= data.sections.length) return
        const [moved] = data.sections.splice(sectionIndex, 1)
        data.sections.splice(to, 0, moved)
        paint()
        paintEditor()
        queueSave()
        break
      }
      case 'section-del': {
        if (!window.confirm(`删掉「${section?.title || '这个模块'}」？`)) return
        data.sections.splice(sectionIndex, 1)
        paint()
        paintEditor()
        queueSave()
        break
      }
      case 'section-add': {
        const select = editor.querySelector<HTMLSelectElement>('[data-new-kind]')
        const kind = (select?.value || 'custom') as SectionKind
        const label = SECTION_KINDS.find((item) => item.value === kind)?.label || '自定义模块'
        data.sections.push({
          id: uid(),
          kind,
          title: label,
          entries: kind === 'skills' ? [] : [blankEntry()],
          lines: kind === 'skills' ? [''] : [],
        })
        paint()
        paintEditor()
        queueSave()
        break
      }
      case 'entry-add': {
        section?.entries.push(blankEntry())
        paint()
        paintEditor()
        queueSave()
        break
      }
      case 'entry-up':
      case 'entry-down': {
        if (!section) return
        const to = action === 'entry-up' ? entryIndex - 1 : entryIndex + 1
        if (to < 0 || to >= section.entries.length) return
        const [moved] = section.entries.splice(entryIndex, 1)
        section.entries.splice(to, 0, moved)
        paint()
        paintEditor()
        queueSave()
        break
      }
      case 'entry-del': {
        if (!section || !window.confirm(`删掉「${section.entries[entryIndex]?.title || `条目 ${entryIndex + 1}`}」？`)) return
        section.entries.splice(entryIndex, 1)
        paint()
        paintEditor()
        queueSave()
        break
      }
    }
  })

  /* 导出 PDF：与 ip-studio 同一套（snapdom 截图 → 按内容边界切页 → jspdf） */
  async function exportPdf(): Promise<void> {
    if (exporting) return
    exporting = true
    if (exportButton) {
      exportButton.disabled = true
      exportButton.textContent = '正在导出…'
    }
    try {
      try {
        await document.fonts?.ready
      } catch {}

      stage.innerHTML = `<article class="resume-sheet">${sheetHtml(data)}</article>`
      const target = stage.querySelector<HTMLElement>('.resume-sheet')
      if (!target) throw new Error('画布不可用')

      const { snapdom } = await import('@zumer/snapdom')
      const canvas = await snapdom.toCanvas(target, { scale: 3, backgroundColor: '#ffffff' })

      const rect = target.getBoundingClientRect()
      const widthPx = rect.width || 678
      const heightPx = rect.height || canvas.height / 3
      const scale = canvas.width / widthPx
      const mmPerPx = CONTENT_W_MM / widthPx
      const pagePx = CONTENT_H_MM / mmPerPx

      // 在模块 / 条目边界处翻页，避免把一段话拦腰截断
      const boundaries = new Set<number>([0, heightPx])
      for (const el of target.querySelectorAll('.rs-section, .rs-entry, .rs-kicker, .rs-para, .rs-bullets li, .rs-ol > li, .rs-subs li')) {
        const box = el.getBoundingClientRect()
        const top = box.top - rect.top
        if (top > 1 && top < heightPx - 1) boundaries.add(top)
      }
      const cuts = [...boundaries].sort((a, b) => a - b)

      // 别让「项目成果」这类小标题孤零零挂在页底
      const kickerTops: number[] = []
      for (const el of target.querySelectorAll('.rs-kicker, .rs-section h3')) {
        const top = el.getBoundingClientRect().top - rect.top
        if (top > 60 && top < heightPx - 1) kickerTops.push(top)
      }
      const avoidOrphan = (end: number): number => {
        const orphan = kickerTops.filter((top) => top < end && end - top < 42)
        return orphan.length ? Math.min(...orphan) : end
      }

      const slices: { start: number; end: number }[] = []
      let start = 0
      while (start < heightPx - 1) {
        const limit = start + pagePx
        if (heightPx - start <= pagePx) {
          slices.push({ start, end: heightPx })
          break
        }
        const candidates = cuts.filter((value) => value > start + 60 && value <= limit + 0.5)
        const chosen = candidates.length ? candidates[candidates.length - 1] : limit
        const end = Math.max(start + 60, avoidOrphan(chosen))
        slices.push({ start, end })
        start = end
      }

      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })

      slices.forEach((slice, index) => {
        const sourceY = Math.max(0, Math.round(slice.start * scale))
        const sourceH = Math.max(1, Math.min(canvas.height - sourceY, Math.round((slice.end - slice.start) * scale)))
        const page = document.createElement('canvas')
        page.width = canvas.width
        page.height = sourceH
        const ctx = page.getContext('2d')
        if (!ctx) throw new Error('画布不可用')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, page.width, page.height)
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH)

        if (index) pdf.addPage()
        const heightMm = (slice.end - slice.start) * mmPerPx
        pdf.addImage(
          page.toDataURL('image/jpeg', 0.92),
          'JPEG',
          PAGE_MARGIN_MM,
          PAGE_MARGIN_MM,
          CONTENT_W_MM,
          heightMm,
          undefined,
          'FAST',
        )
      })

      const title = safeFileName(`${data.basics.name.trim() || '简历'}-简历`)
      pdf.save(`${title}.pdf`)
      showToast('导出成功，如有用请点个 Star ~')
    } catch (error) {
      window.alert(`导出失败：${(error as Error).message || error}`)
    } finally {
      exporting = false
      stage.innerHTML = ''
      if (exportButton) {
        exportButton.disabled = false
        exportButton.textContent = '导出 PDF'
      }
    }
  }
}
