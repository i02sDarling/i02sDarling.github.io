/**
 * 文章正文的两个「排版增强」，都在构建时完成，线上不跑 JS、不请求第三方：
 *
 * 1. 标题锚点：给 h2–h4 前面塞一个 `#`，hover 标题才显示，点一下复制到的就是这一节的地址。
 * 2. 链接图标：外链前面加一个网站小图标。图标在构建时抓到 `public/post-icons/`，
 *    抓不到就静默跳过（宁可没有图标，也不要一个灰方块或者破图）。
 *
 * 为什么要在构建时写文件：Astro 复制 `public/` 发生在页面渲染之前，
 * 渲染阶段新写进去的文件不会自动进 `dist`，所以 `astro.config.mjs` 里还有一个
 * `astro:build:done` 钩子负责把它们补拷过去。
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import GithubSlugger from 'github-slugger'

const ICON_DIR = 'public/post-icons'
const ICON_URL = '/post-icons'
const TIMEOUT_MS = 4000

/** github.com 上这些路径是功能页，不该当成用户名去取头像 */
const GITHUB_RESERVED = new Set([
  'about', 'apps', 'collections', 'explore', 'features', 'issues', 'login',
  'marketplace', 'new', 'notifications', 'orgs', 'pricing', 'pulls', 'search',
  'settings', 'sponsors', 'topics', 'trending',
])

function walk(node, fn) {
  fn(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, fn)
  }
}

/**
 * 按 Astro 的 rehype-collect-headings 同样的规则取标题文本。
 * 顺序必须一致：我们的插件跑在 `rehypeHeadingIds` 之前，必须自己算 id，
 * 否则拿不到 id、也保证不了大纲链接和锚点对得上。
 */
function headingText(node) {
  let text = ''
  const pick = (child, parent) => {
    if (child.type !== 'element' && parent) {
      if (child.type === 'raw' && /^\n?<.*>\n?$/.test(child.value)) {
        // 裸 HTML 标签不算标题文本
      } else if ('value' in child) {
        text += child.value
      }
    }
    if (Array.isArray(child.children)) {
      for (const grandchild of child.children) pick(grandchild, child)
    }
  }
  for (const child of node.children ?? []) pick(child, node)
  return text
}

/** 图标文件名只留安全字符，避免端口号、百分号编码之类的东西跑进路径 */
function safeId(value) {
  return value.replace(/[^a-z0-9.-]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
}

/** 从 github.com/<user> 里取出用户名，取不到返回 null */
function githubUser(url) {
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null
  const [first, ...rest] = url.pathname.split('/').filter(Boolean)
  if (!first || rest.length > 0) return null
  if (GITHUB_RESERVED.has(first.toLowerCase())) return null
  return first
}

/** 同一张图标在本次构建里只抓一次 */
let cachePromise = null
let inflight = new Map()

async function loadCache(root) {
  if (cachePromise) return cachePromise
  cachePromise = (async () => {
    const map = new Map()
    const dir = path.join(root, ICON_DIR)
    try {
      for (const name of await readdir(dir)) {
        map.set(name.replace(/\.[^.]+$/, ''), name)
      }
    } catch {
      // 目录还不存在：第一次构建
    }
    return map
  })()
  return cachePromise
}

function extensionFor(contentType, url) {
  const type = (contentType || '').toLowerCase()
  if (type.includes('svg')) return 'svg'
  if (type.includes('icon') || type.includes('vnd.microsoft')) return 'ico'
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('webp')) return 'webp'
  if (type.includes('png')) return 'png'
  // 有些 CDN 不给 content-type，按 URL 后缀猜
  const suffix = path.extname(new URL(url).pathname).toLowerCase()
  return ['png', 'ico', 'svg', 'jpg', 'webp'].includes(suffix.slice(1)) ? suffix.slice(1) : null
}

async function download(url) {  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; DalingBlogIconFetcher/1.0)' },
  })
  if (!response.ok) return null
  const extension = extensionFor(response.headers.get('content-type'), url)
  if (!extension) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  // 小于 100B 基本是占位图或错误页
  if (buffer.byteLength < 100) return null
  return { buffer, extension }
}

/**
 * 读目标站点首页里的 `<link rel="icon">`，拿到比 `/favicon.ico` 更准确的地址。
 * 拿不到就返回空数组，由调用方继续用默认路径兜底。
 */
async function discoverIcons(url) {
  const found = []
  try {
    const response = await fetch(url.origin, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; DalingBlogIconFetcher/1.0)' },
    })
    if (!response.ok) return found
    const html = await response.text()
    for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
      const text = tag[0]
      if (!/rel=["'][^"']*icon/i.test(text)) continue
      const href = (text.match(/href=["']([^"']+)["']/i) || [])[1]
      if (!href) continue
      try {
        found.push(new URL(href, url.origin).href)
      } catch {
        // 忽略非法 href
      }
    }
  } catch {
    // 首页打不开就算了
  }
  return found
}

async function ensureIcon(root, id, candidates) {
  const cache = await loadCache(root)
  const cached = cache.get(id)
  if (cached) return `${ICON_URL}/${cached}`
  if (inflight.has(id)) return inflight.get(id)

  const job = (async () => {
    for (const candidate of candidates) {
      try {
        const result = await download(candidate)
        if (!result) continue
        const dir = path.join(root, ICON_DIR)
        await mkdir(dir, { recursive: true })
        const name = `${id}.${result.extension}`
        await writeFile(path.join(dir, name), result.buffer)
        cache.set(id, name)
        return `${ICON_URL}/${name}`
      } catch {
        // 换下一个源；全都失败就不加图标
      }
    }
    return null
  })()

  inflight.set(id, job)
  const url = await job
  inflight.delete(id)
  return url
}

export default function rehypePostMagic(options = {}) {
  const root = options.root ?? process.cwd()

  return async (tree) => {
    // ── 标题锚点 ──────────────────────────────────────────────
    // Astro 的 `rehypeHeadingIds` 在本插件之后运行，所以这里先按同样的
    // github-slugger 规则补 id，再挂 `#` 锚点。
    const slugger = new GithubSlugger()
    walk(tree, (node) => {
      if (node.type !== 'element' || !/^h[1-6]$/.test(node.tagName)) return
      node.properties = node.properties ?? {}
      if (typeof node.properties.id !== 'string') {
        node.properties.id = slugger.slug(headingText(node))
      }
    })

    walk(tree, (node) => {
      if (node.type !== 'element' || !/^h[234]$/.test(node.tagName)) return
      const id = node.properties?.id
      if (!id) return
      if (node.children.some((child) => child.properties?.className?.includes?.('header-anchor'))) return
      node.children.unshift({
        type: 'element',
        tagName: 'a',
        properties: {
          className: ['header-anchor'],
          href: `#${id}`,
          ariaHidden: 'true',
          tabIndex: -1,
        },
        children: [{ type: 'text', value: '#' }],
      })
    })

    // ── 外链图标 ──────────────────────────────────────────────
    const jobs = []
    walk(tree, (node) => {
      if (node.type !== 'element' || node.tagName !== 'a') return
      const href = node.properties?.href
      if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return
      if (node.properties?.className?.includes?.('header-anchor')) return

      let url
      try {
        url = new URL(href)
      } catch {
        return
      }

      const user = githubUser(url)
      const id = user ? `github-${safeId(user)}` : safeId(url.hostname)
      if (!id) return

      const candidates = user
        ? [`https://github.com/${encodeURIComponent(user)}.png?size=64`]
        : [
            // 优先站点自己的 favicon：国内网络访问第三方图标服务经常超时
            `${url.origin}/favicon.ico`,
            `${url.origin}/favicon.svg`,
          ]

      jobs.push(
        discoverIcons(url)
          .then((extra) => ensureIcon(root, id, [...extra, ...candidates]))
          .then((iconUrl) => {
            if (!iconUrl) return
            node.properties.className = [...(node.properties.className ?? []), 'has-icon']
            node.children.unshift({
              type: 'element',
              tagName: 'span',
              properties: {
                className: ['link-icon'],
                style: `background-image:url('${iconUrl}')`,
                ariaHidden: 'true',
              },
              children: [],
            })
          }),
      )
    })

    await Promise.all(jobs)
  }
}

/** `astro:build:done` 用：把构建期新抓的图标补进 dist（public 的复制发生在渲染之前） */
export async function copyIconsToDist(root, distDir) {
  const from = path.join(root, ICON_DIR)
  if (!existsSync(from)) return
  const { cp } = await import('node:fs/promises')
  await cp(from, path.join(distDir, 'post-icons'), { recursive: true, force: true })
}
