/**
 * RSS 2.0 订阅源（构建期生成，不引第三方包）。
 *
 * 只收公开且未软删除的文章；正文只放摘要（全文 feed 会把整库文章塞进一个文件，
 * 订阅器和搜索引擎都吃不消）。`site` 在 astro.config 里配了，所以链接都是绝对地址。
 */
import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { postSlug, resolvePostData, stripMetadataBlock } from '../lib/metadata.ts'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 没写 description 的文章，从正文里刮一段纯文字当摘要 */
function excerptOf(body: string, limit = 160): string {
  const text = stripMetadataBlock(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^>[^\n]*$/gm, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function rfc822(day: string): string {
  const date = new Date(day)
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString()
}

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://i02sdarling.github.io')

  const posts = (await getCollection('posts'))
    .map((post) => ({ post, meta: resolvePostData(post), slug: postSlug(post) }))
    .filter((entry) => !entry.meta.deleted && entry.meta.public)
    .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)))

  const feedUrl = new URL('/rss.xml', base).href
  const homeUrl = new URL('/posts/', base).href
  const lastBuild = posts[0]?.meta.date ? rfc822(posts[0].meta.date) : new Date().toUTCString()

  const items = posts
    .map((entry) => {
      const link = new URL(`/posts/${entry.slug}/`, base).href
      const summary = entry.meta.description || excerptOf(entry.post.body ?? '')
      const categories = entry.meta.tags
        .map((tag) => `      <category>${escapeXml(tag)}</category>`)
        .join('\n')
      return `    <item>
      <title>${escapeXml(entry.meta.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${rfc822(entry.meta.date)}</pubDate>
      <description>${escapeXml(summary)}</description>${categories ? `\n${categories}` : ''}
    </item>`
    })
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>妲零 · Blog</title>
    <link>${escapeXml(homeUrl)}</link>
    <description>记录在做的项目、踩过的坑，和还没想清楚的事。</description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
