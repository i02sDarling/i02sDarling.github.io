/** robots.txt：放开全站，并把 sitemap 指给爬虫。 */
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://i02sdarling.github.io')
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL('/sitemap.xml', base).href}
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
