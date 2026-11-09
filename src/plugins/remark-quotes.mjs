/**
 * 中文正文里的直双引号 → 中文弯引号 `“…”`。
 *
 * 为什么不用 Astro 自带的 smartypants：
 * 它的判据是「前一个字符是不是空白 / 左括号」，不认识中日韩文字。
 * 中文里 `他说"你好"` 的前引号前面是「说」，会被判成**收尾**引号，
 * 于是渲染成 `他说”你好”`——开头就少了一个引号，看起来像「双引号没了」。
 *
 * 这里改成按「成对」处理：同一段（paragraph / heading / tableCell）里，
 * 第 1、3、5… 个直引号变 `“`，第 2、4、6… 个变 `”`；落单的保持原样。
 * 只碰普通文本节点，代码、行内代码、HTML 都不动。
 */

/** 这些节点里的文字不参与引号替换 */
const SKIP = new Set(['inlineCode', 'code', 'html', 'yaml', 'toml', 'math', 'inlineMath'])

/** 引号按段落配对；跨段落的引号本来就不该出现 */
const BLOCKS = new Set(['paragraph', 'heading', 'tableCell'])

function collectText(node, out) {
  if (SKIP.has(node.type)) return
  if (node.type === 'text') {
    out.push(node)
    return
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectText(child, out)
  }
}

function pairQuotes(nodes) {
  const positions = []
  for (const node of nodes) {
    for (let index = 0; index < node.value.length; index += 1) {
      if (node.value[index] === '"') positions.push({ node, index })
    }
  }

  // 奇偶配对：0→“，1→”，2→“……；最后落单的那个不动。
  // 引号都是一个字符，替换后长度不变，索引不会错位。
  for (let index = 0; index + 1 < positions.length; index += 2) {
    const open = positions[index]
    const close = positions[index + 1]
    open.node.value = `${open.node.value.slice(0, open.index)}“${open.node.value.slice(open.index + 1)}`
    close.node.value = `${close.node.value.slice(0, close.index)}”${close.node.value.slice(close.index + 1)}`
  }
}

export default function remarkQuotes() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return
      if (BLOCKS.has(node.type)) {
        const texts = []
        collectText(node, texts)
        pairQuotes(texts)
        return
      }
      for (const child of node.children) walk(child)
    }
    walk(tree)
  }
}
