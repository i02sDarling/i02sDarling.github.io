/**
 * sitemap.xml（构建期生成，不需要额外依赖）。
 *
 * 只收「线上真的能访问」的页面：静态页 + 公开且未软删除的文章。
 * 草稿不进去 —— 否则搜索引擎会拿到 404，还把你的草稿 URL 记一笔。
 */
import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { postSlug, resolvePostData } from '../lib/metadata.ts'

/** 站点里的固定页面（目录格式，统一带结尾斜杠） */
const STATIC_PAGES: Array<{ path: string; priority: string }> = [
  { path: '/', priority: '1.0' },
  { path: '/home/', priority: '0.9' },
  { path: '/posts/', priority: '0.9' },
  { path: '/resume/', priority: '0.6' },
  { path: '/skills/', priority: '0.6' },
  { path: '/scripts/', priority: '0.5' },
  { path: '/skills/baihuafen/', priority: '0.5' },
]

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://i02sdarling.github.io')

  const posts = (await getCollection('posts'))
    .map((post) => ({ meta: resolvePostData(post), slug: postSlug(post) }))
    .filter((entry) => !entry.meta.deleted && entry.meta.public)
    .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)))

  const rows = [
    ...STATIC_PAGES.map((page) => ({
      loc: new URL(page.path, base).href,
      lastmod: '',
      priority: page.priority,
    })),
    ...posts.map((entry) => ({
      loc: new URL(`/posts/${entry.slug}/`, base).href,
      lastmod: entry.meta.updated || entry.meta.date,
      priority: '0.8',
    })),
  ]

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows
  .map(
    (row) =>
      `  <url>\n    <loc>${escapeXml(row.loc)}</loc>${
        row.lastmod ? `\n    <lastmod>${escapeXml(row.lastmod)}</lastmod>` : ''
      }\n    <changefreq>weekly</changefreq>\n    <priority>${row.priority}</priority>\n  </url>`,
  )
  .join('\n')}
</urlset>
`

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
