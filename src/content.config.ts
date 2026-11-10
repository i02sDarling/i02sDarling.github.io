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
    // 文章分组：列表里显示在标题左侧的小标签（如「日语」），空串 = 不分组
    group: z.string().default(''),
    public: z.boolean().default(false),
    // 软删除标记：ip-studio 删除文章时只写这个字段，站点据此把文章从列表和页面里过滤掉，
    // 不删文件——这样每次更新都是增量改写，恢复也只是把标记去掉。
    deleted: z.boolean().default(false),
    // 来源笔记名：ip-studio 用来识别「同一篇再次发布」，站点不用
    source: z.string().optional(),
  }),
})

export const collections = { posts }
