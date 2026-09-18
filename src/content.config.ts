import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,markdown}' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    slug: z.string().optional(),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    public: z.boolean().default(false),
  }),
})

export const collections = { posts }
