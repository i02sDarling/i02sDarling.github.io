/**
 * 把正文开头的 `> metadata:` 块从渲染结果里删掉。
 *
 * 块是给 ip-studio / 作者看的元信息（标题、slug、最后编辑……），
 * 读者不该在文章里看到一段引用。页面用 src/lib/metadata.ts 读同一份数据来渲染。
 */

function textOf(node) {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(textOf).join('')
}

export default function remarkPostMetadata() {
  return (tree) => {
    // 允许块前面有空白的文本节点
    let index = 0
    while (
      index < tree.children.length &&
      tree.children[index].type === 'text' &&
      !String(tree.children[index].value ?? '').trim()
    ) {
      index += 1
    }

    const node = tree.children[index]
    if (!node || node.type !== 'blockquote') return

    // 整块引用合并后的文本以 metadata: 开头
    if (!/^metadata\s*:/i.test(textOf(node).trim())) return
    tree.children.splice(index, 1)
  }
}
