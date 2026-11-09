// @ts-check
import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import { unified } from '@astrojs/markdown-remark'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import remarkMark from './src/plugins/remark-mark.mjs'
import remarkMathGuard from './src/plugins/remark-math-guard.mjs'
import remarkPostMetadata from './src/plugins/remark-post-metadata.mjs'
import remarkQuotes from './src/plugins/remark-quotes.mjs'
import rehypeImageGallery from './src/plugins/rehype-image-gallery.mjs'
import rehypePostMagic, { copyIconsToDist } from './src/plugins/rehype-post-magic.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * 构建期抓的图标写在 public/ 里，但 public 的复制早于渲染，
 * 所以构建结束时再补拷一次到 dist。
 */
const copyPostIcons = {
  name: 'copy-post-icons',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await copyIconsToDist(root, fileURLToPath(dir))
    },
  },
}

// https://astro.build/config
export default defineConfig({
  site: 'https://i02sdarling.github.io',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  markdown: {
    /*
     * 关掉 Astro 默认的 smartypants：它按「前一个字符是空白」判断前引号，
     * 不认识中文。`他说"你好"` 会被判成 `他说”你好”`（开头引号丢了）。
     * 引号交给下面的 remarkQuotes 按成对规则处理，更符合中文排版。
     */
    smartypants: false,
    // Astro 7 默认换成 Sätteri，remark/rehype 插件要用 unified() 显式声明
    processor: unified({
      // 正文开头的 `> metadata:` 块只给页面读，不渲染给读者
      // `$…$` / `$$…$$` 先解析成公式节点，其余插件不会再碰里面的内容
      // mathGuard 紧跟其后：把「$0.54，MCP $0.39」这类金额误判退回纯文本
      remarkPlugins: [remarkPostMetadata, remarkMath, remarkMathGuard, remarkQuotes, remarkMark],
      // 标题 `#` 锚点 + 外链网站图标（构建时抓，抓不到就跳过）
      // 连续图片先收成图片组，再交给锚点 / 图标处理
      rehypePlugins: [rehypeKatex, rehypeImageGallery, [rehypePostMagic, { root }]],
    }),
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  integrations: [copyPostIcons],
})
