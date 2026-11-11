/**
 * 站外图片（语雀 cdn.nlark.com 等）有防盗链：请求带 Referer 时直接返回 403，
 * 图就成了破图。给所有 `<img>` 补 `referrerpolicy="no-referrer"`，浏览器就不发
 * Referer，图能正常加载。
 *
 * 构建期完成，线上不跑 JS。只动 `img`，其它节点原样透传。
 */

const REFERRER_POLICY = 'no-referrer'

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  const children = node.children
  if (!Array.isArray(children)) return
  for (const child of children) walk(child, visit)
}

export default function rehypeImageReferrer() {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type !== 'element' || node.tagName !== 'img') return
      const properties = (node.properties ??= {})
      properties.referrerPolicy = REFERRER_POLICY
    })
  }
}
