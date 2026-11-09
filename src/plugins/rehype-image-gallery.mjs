/**
 * 连续图片 → 图片组（构建期完成，线上不跑 JS）。
 *
 * 正文里连着写好几个 `![](...)` 时，每张图各占一屏、往下翻很长。
 * 这里把「连续的、只包含一张图的段落」收进一个 .gallery：
 *
 *  - 默认横向滚动：一屏排开，向左滑看下一张；
 *  - 右上角小按钮（checkbox + label）切换宫格视图，一次看全。
 *
 * 只处理文章根节点下的直接段落；引用块、列表里的图片保持原样。
 */

const TRACK_CLASS = 'gallery-track'
const TOGGLE_CLASS = 'gallery-toggle'
const SWITCH_CLASS = 'gallery-switch'

function isBlank(node) {
  return node?.type === 'text' && !String(node.value ?? '').trim()
}

/** 单张图片节点（可能是 <img>，也可能被链接包着 <a><img></a>） */
function imageOf(node) {
  if (!node || node.type !== 'element') return null
  if (node.tagName === 'img') return node
  if (node.tagName === 'a') {
    const kids = (node.children ?? []).filter((child) => !isBlank(child))
    if (kids.length === 1) return imageOf(kids[0])
  }
  return null
}

/** 段落里只有一张图 → 返回那张图 */
function imageInParagraph(node) {
  if (!node || node.type !== 'element' || node.tagName !== 'p') return null
  const kids = (node.children ?? []).filter((child) => !isBlank(child))
  if (kids.length !== 1) return null
  return imageOf(kids[0])
}

function text(value) {
  return { type: 'text', value }
}

export default function rehypeImageGallery() {
  let counter = 0

  return (tree) => {
    const children = tree?.children
    if (!Array.isArray(children)) return

    const out = []
    let index = 0

    while (index < children.length) {
      const node = children[index]
      const first = imageInParagraph(node)

      if (!first) {
        out.push(node)
        index += 1
        continue
      }

      // 顺着往下找连续的图片段落（中间的空行 / 空白文本节点不算断开）
      const images = [first]
      let cursor = index + 1
      while (cursor < children.length) {
        const next = children[cursor]
        if (isBlank(next)) {
          cursor += 1
          continue
        }
        const image = imageInParagraph(next)
        if (!image) break
        images.push(image)
        cursor += 1
      }

      // 只有一张图：保持原来的单图排版
      if (images.length === 1) {
        out.push(node)
        index = cursor
        continue
      }

      counter += 1
      const id = `gallery-${counter}`

      out.push({
        type: 'element',
        tagName: 'div',
        properties: { className: ['gallery'] },
        children: [
          {
            type: 'element',
            tagName: 'input',
            properties: {
              type: 'checkbox',
              id,
              className: [TOGGLE_CLASS],
              ariaLabel: '切换宫格视图',
            },
            children: [],
          },
          {
            type: 'element',
            tagName: 'label',
            properties: {
              htmlFor: id,
              className: [SWITCH_CLASS],
              title: '切换宫格 / 横滑',
            },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['gallery-switch-to-grid'] },
                children: [text('宫格')],
              },
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['gallery-switch-to-strip'] },
                children: [text('横滑')],
              },
            ],
          },
          {
            type: 'element',
            tagName: 'div',
            properties: { className: [TRACK_CLASS] },
            children: images,
          },
        ],
      })

      index = cursor
    }

    tree.children = out
  }
}
