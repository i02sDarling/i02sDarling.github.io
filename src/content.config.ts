import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,markdown}' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    // 最后编辑日期：由 ip-studio 在「内容有变化」时自动写入，没有就不显示「更新于」
    updated: z.string().optional(),
    slug: z.string().optional(),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    public: z.boolean().default(false),
    // 来源笔记名：ip-studio 用来识别「同一篇再次发布」，站点不用
    source: z.string().optional(),
  }),
})

export const collections = { posts }
