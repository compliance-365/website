// Blog posts as a typed content collection. The schema is checked at build
// time, so a post with a missing description, a SERP title too long for
// Google to show, a malformed date or a cover image that isn't in public/
// fails the build instead of shipping a broken page.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { existsSync } from 'node:fs';

const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(10),
    // Editorial headlines can run long; seoTitle is what Google shows.
    seoTitle: z.string().max(60).optional(),
    description: z.string().min(70).max(170),
    date: z.coerce.date(),
    lastModified: z.coerce.date().optional(),
    author: z.string().default('Compliance365'),
    tags: z.array(z.string()).min(1),
    image: z.string()
      .refine((s) => /^https?:\/\//.test(s) || existsSync('public/' + s.replace(/^\/+/, '')), {
        message: 'cover image not found in public/',
      })
      .optional(),
  }),
});

export const collections = { blog };
