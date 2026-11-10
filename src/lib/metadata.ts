/**
 * 正文开头的 `> metadata:` 块。
 *
 * ip-studio 发布时会把标题 / slug / 日期 / 最后编辑 / 标签 / 摘要 / 是否公开
 * 同时写进 YAML front-matter 和正文第一行的这个块。站点里：
 *
 * 1. remark-post-metadata 插件把块从渲染结果里删掉（读者看不到）；
 * 2. 页面用这里的 resolvePostData() 读块里的值来渲染（slug、最后编辑等）。
 *
 * 块优先于 front-matter；块里没写的字段才用 front-matter 兜底。
 */

export interface PostMetadata {
  title?: string
  slug?: string
  date?: string
  updated?: string
  tags?: string[]
  group?: string
  description?: string
  public?: boolean
}

const KEYS = new Set(['title', 'slug', 'date', 'updated', 'tags', 'group', 'description', 'public'])
const HEADER_RE = /^\s*>\s*metadata\s*:?\s*$/i
const QUOTE_RE = /^\s*>/
const FIELD_RE = /^\s*(?:[-*]\s+)?([A-Za-z][\w-]*)\s*:\s?(.*)$/

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function oneLine(value: string): string {
  return unquote(value).replace(/\s+/g, ' ').trim()
}

function normalizeDate(value: string): string {
  const match = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim())
  if (!match) return ''
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function toBoolean(raw: string): boolean | null {
  if (/^(true|yes|on|1)$/i.test(raw.trim())) return true
  if (/^(false|no|off|0)$/i.test(raw.trim())) return false
  return null
}

export interface ParsedMetadataBlock {
  metadata: PostMetadata
  /** 去掉 metadata 块之后的正文 */
  body: string
  found: boolean
}

export function parseMetadataBlock(source = ''): ParsedMetadataBlock {
  const text = source.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')

  let start = 0
  while (start < lines.length && lines[start].trim() === '') start += 1
  if (start >= lines.length || !HEADER_RE.test(lines[start])) {
    return { metadata: {}, body: text, found: false }
  }

  const metadata: PostMetadata = {}
  let cursor = start + 1

  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    if (!QUOTE_RE.test(line)) break

    const inner = line.replace(/^\s*>\s?/, '')
    if (inner.trim() === '') {
      if (!QUOTE_RE.test(lines[cursor + 1] ?? '')) break
      continue
    }

    const match = FIELD_RE.exec(inner)
    if (!match) break
    const key = match[1].toLowerCase()
    if (!KEYS.has(key)) break

    const raw = match[2] ?? ''
    switch (key) {
      case 'title': {
        const value = oneLine(raw)
        if (value) metadata.title = value
        break
      }
      case 'slug': {
        const value = oneLine(raw)
        if (value) metadata.slug = value
        break
      }
      case 'date': {
        const value = normalizeDate(raw)
        if (value) metadata.date = value
        break
      }
      case 'updated': {
        metadata.updated = normalizeDate(raw)
        break
      }
      case 'tags': {
        metadata.tags = raw
          .split(/[,，;；]/)
          .map((tag) => oneLine(tag))
          .filter(Boolean)
        break
      }
      case 'group': {
        metadata.group = oneLine(raw)
        break
      }
      case 'description': {
        metadata.description = oneLine(raw)
        break
      }
      case 'public': {
        const value = toBoolean(raw)
        if (value !== null) metadata.public = value
        break
      }
    }
  }

  let restStart = cursor
  if (restStart < lines.length && lines[restStart].trim() === '') restStart += 1

  return {
    metadata,
    body: lines.slice(restStart).join('\n'),
    found: true,
  }
}

export function stripMetadataBlock(body = ''): string {
  return parseMetadataBlock(body).body
}

interface PostLike {
  id: string
  body?: string
  data: Record<string, unknown>
}

export interface PostDataView {
  title: string
  date: string
  updated?: string
  slug: string
  description: string
  tags: string[]
  group: string
  public: boolean
}

/**
 * front-matter + metadata 块合并后的数据（块优先）。
 * `slug` 兜底顺序：块 → front-matter → 文件名（Astro 的 post.id）。
 */
export function resolvePostData(post: PostLike): PostDataView {
  const block = parseMetadataBlock(post.body ?? '').metadata
  const data = post.data as Partial<PostDataView>

  return {
    title: block.title || data.title || post.id,
    date: block.date || data.date || '',
    // updated 写了空值 = 明确清空，不能退回 front-matter 的旧值
    updated: 'updated' in block ? block.updated : data.updated,
    slug: block.slug || data.slug || post.id,
    description: 'description' in block ? (block.description ?? '') : (data.description ?? ''),
    tags: 'tags' in block ? (block.tags ?? []) : (data.tags ?? []),
    group: 'group' in block ? (block.group ?? '') : (data.group ?? ''),
    public: 'public' in block ? Boolean(block.public) : Boolean(data.public),
  }
}

/** 文章实际使用的 URL slug */
export function postSlug(post: PostLike): string {
  return resolvePostData(post).slug
}
