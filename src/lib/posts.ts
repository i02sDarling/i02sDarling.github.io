/**
 * 文章列表用的小工具：日期格式、年份分组、阅读时长。
 *
 * 阅读时长按「中日韩字符 400 字/分钟 + 拉丁单词 200 词/分钟」估算，
 * 代码块不计入（它们本来就不是逐字读的）。
 */

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g

/** 发布日期 → "Nov 8"（需要年份时传 withYear） */
export function formatPostDate(date: string, withYear = false): string {
  // 只取日期部分，按 UTC 解析，避免本地时区把 11-08 变成 11-07
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(day.getTime())) return date
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(day)
}

/** 文章所属年份（用于列表分组） */
export function postYear(date: string): string {
  return date.slice(0, 4)
}

/** 发布日期 → 两位月份数字（列表里悬浮 2 秒后显示，如 Feb → 02） */
export function postMonthNumber(date: string): string {
  return date.slice(5, 7)
}

/** 估算阅读时长，最少 1 分钟 */
export function readingMinutes(body = ''): number {
  const text = body.replace(/```[\s\S]*?```/g, ' ')
  const cjk = (text.match(CJK) ?? []).length
  const latin = text
    .replace(CJK, ' ')
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word)).length
  return Math.max(1, Math.round(cjk / 400 + latin / 200))
}

/** 按年份把已排序（新→旧）的文章切成组 */
export function groupByYear<T extends { data: { date: string } }>(
  posts: T[],
): { year: string; posts: T[] }[] {
  const groups: { year: string; posts: T[] }[] = []
  for (const post of posts) {
    const year = postYear(post.data.date)
    const last = groups.at(-1)
    if (last && last.year === year) last.posts.push(post)
    else groups.push({ year, posts: [post] })
  }
  return groups
}
