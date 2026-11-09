/**
 * 别把「美元金额」当成数学公式。
 *
 * remark-math 默认单美元也能开公式，于是
 *
 *     CLI $0.54，MCP $0.39
 *
 * 会被解析成一条 inlineMath（内容 `0.54，MCP `），两个 `$` 被吃掉，
 * 渲染出来变成 `CLI 0.54、MCP 0.39`——数字还在，美元符号没了。
 *
 * 规则：公式里出现中日韩字符、又完全不含 LaTeX 命令（反斜杠）的，
 * 当作标点/货币误判，原样退回文本。真正的公式不会长这样；
 * 真要写中文得用 `\text{…}`，那就带反斜杠了，不会被误退。
 */

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** 手写递归，不为这一个插件多引一个 unist-util-visit */
function walk(node, visit) {
  if (!node || !Array.isArray(node.children)) return
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]
    if (visit(child, index, node) === false) continue
    walk(child, visit)
  }
}

export default function remarkMathGuard() {
  return (tree) => {
    walk(tree, (node, index, parent) => {
      if (node.type !== 'inlineMath') return
      if (!CJK.test(node.value)) return
      if (node.value.includes('\\')) return
      // 还原成带 `$` 的普通文字：这里丢掉的两个美元符号要还回去
      parent.children[index] = { type: 'text', value: `$${node.value}$` }
    })
  }
}
