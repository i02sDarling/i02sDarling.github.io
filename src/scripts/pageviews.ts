/**
 * 只负责「记一次访问」，页面上不显示任何数字。
 *
 * 阅读量不在博客展示（列表页与文章页都干净），数字只在本机工具 ip-studio 的
 * 「发布」页里看 —— 那边直接读 GoatCounter 的 `/counter/<路径>.json`（见
 * `ip-studio/src/core/blogViews.ts`）。
 *
 * count.js 在首次加载时自己会记一次；ClientRouter 换页不触发浏览器导航，
 * 所以还要在 `astro:page-load` 里手动补记，否则站内点开的文章都算不到。
 */
import { GOATCOUNTER_CODE } from '../lib/analytics.ts'

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

document.addEventListener('astro:page-load', trackNavigation)
