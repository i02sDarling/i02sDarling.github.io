/**
 * 给正文加一个轻量的高亮语法：`==重点==` → <mark class="hl">重点</mark>
 *
 * 只处理普通文本节点，代码块和行内代码不受影响。
 * 想把重点染成别的颜色，直接写 <span class="hl-blue">…</span>（类名见 global.css）。
 */
const PATTERN = /==([^=\n]+)==/g

function splitText(node, parent) {
  PATTERN.lastIndex = 0
  if (!PATTERN.test(node.value)) return false
  PATTERN.lastIndex = 0

  const replacement = []
  let cursor = 0
  let match
  while ((match = PATTERN.exec(node.value))) {
    if (match.index > cursor) {
      replacement.push({ type: 'text', value: node.value.slice(cursor, match.index) })
    }
    replacement.push({
      type: 'mark',
      data: { hName: 'mark', hProperties: { className: ['hl'] } },
      children: [{ type: 'text', value: match[1] }],
    })
    cursor = match.index + match[0].length
  }
  if (cursor < node.value.length) {
    replacement.push({ type: 'text', value: node.value.slice(cursor) })
  }

  parent.children.splice(parent.children.indexOf(node), 1, ...replacement)
  return true
}

export default function remarkMark() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return
      // 倒序走，替换节点后前面的索引仍然有效
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index]
        if (child.type === 'text') {
          splitText(child, node)
        } else {
          walk(child)
        }
      }
    }
    walk(tree)
  }
}
