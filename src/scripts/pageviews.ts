/**
 * 把页面上的 `[data-pv-path]` 换成真实阅读量。
 *
 * - 数字从 GoatCounter 的 `/counter/<路径>.json` 取（默认带千分位，这里自己解析）；
 * - 列表页有几十篇，用 IntersectionObserver 滚到附近才请求，避免一次几十个请求；
 * - 同一个路径在页面里出现多次只发一次请求（地图 + 在途合并）；
 * - 取不到（404 = 该页还没人访问、或服务挂了）就把这个数字元素整个摘掉，
 *   不显示 0 也不留「次阅读」这种半截话。
 *
 * ClientRouter 换页不会触发浏览器导航，所以还要在 `astro:page-load` 里：
 * 重新扫描元素 + 手动给 GoatCounter 记一次 pageview。
 */
import { GOATCOUNTER_CODE } from '../lib/analytics.ts'

/** GoatCounter 自己对计数接口缓存 4 小时，本地也照这个有效期存一份 */
const CACHE_MS = 4 * 60 * 60 * 1000

/** 1234 → 1.2k；不到 1000 原样显示 */
function compact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return String(value)
  const k = value / 1000
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

/** JSON 里的 `count` 是「带千分位的字符串」（"1,234"），也兼容数字 */
function parseCount(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string') return 0
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

const cache = new Map<string, { at: number; count: number }>()
const inFlight = new Map<string, Promise<number>>()

async function fetchCount(path: string): Promise<number> {
  const now = Date.now()
  const hit = cache.get(path)
  if (hit && now - hit.at < CACHE_MS) return hit.count

  const running = inFlight.get(path)
  if (running) return running

  const task = (async () => {
    const url = `https://${GOATCOUNTER_CODE}.goatcounter.com/counter/${encodeURIComponent(path)}.json`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`pageviews ${res.status}`)
    const data = (await res.json()) as { count?: unknown }
    const count = parseCount(data.count)
    cache.set(path, { at: Date.now(), count })
    return count
  })()

  inFlight.set(path, task)
  try {
    return await task
  } finally {
    inFlight.delete(path)
  }
}

function paint(el: HTMLElement, count: number) {
  const text = compact(count)
  if (!text) {
    el.remove()
    return
  }
  el.textContent = `${el.dataset.pvPrefix ?? ''}${text}${el.dataset.pvSuffix ?? ''}`
  el.hidden = false
  el.classList.add('is-loaded')
}

let observer: IntersectionObserver | null = null

function reveal(el: HTMLElement) {
  const path = el.dataset.pvPath || location.pathname
  fetchCount(path)
    .then((count) => paint(el, count))
    .catch(() => el.remove())
}

/** 扫描（或重新扫描）页面上的阅读量占位。 */
export function initPageViews(): void {
  if (!GOATCOUNTER_CODE) return

  const targets = [...document.querySelectorAll<HTMLElement>('[data-pv-path]')].filter(
    (el) => el.dataset.pvReady !== '1',
  )
  if (!targets.length) return

  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        observer?.unobserve(el)
        reveal(el)
      }
    },
    { rootMargin: '240px' },
  )

  for (const el of targets) {
    el.dataset.pvReady = '1'
    observer.observe(el)
  }
}

/** count.js 暴露的接口（只用到记一次 pageview 的方法） */
interface GoatCounterApi {
  count?: (vars: Record<string, unknown>) => void
}

let firstLoad = true

function trackNavigation() {
  if (!GOATCOUNTER_CODE) return
  // 首次进入页面时 count.js 自己会记，别重复
  if (firstLoad) {
    firstLoad = false
    return
  }
  const api = (window as Window & { goatcounter?: GoatCounterApi }).goatcounter
  api?.count?.({ path: location.pathname, title: document.title, event: false })
}

initPageViews()
document.addEventListener('astro:page-load', () => {
  trackNavigation()
  initPageViews()
})
