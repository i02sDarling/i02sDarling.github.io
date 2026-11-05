// @ts-check
import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import { unified } from '@astrojs/markdown-remark'
import remarkMark from './src/plugins/remark-mark.mjs'
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
    // Astro 7 默认换成 Sätteri，remark/rehype 插件要用 unified() 显式声明
    processor: unified({
      // `==重点==` → <mark class="hl">
      remarkPlugins: [remarkMark],
      // 标题 `#` 锚点 + 外链网站图标（构建时抓，抓不到就跳过）
      rehypePlugins: [[rehypePostMagic, { root }]],
    }),
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  integrations: [copyPostIcons],
})
