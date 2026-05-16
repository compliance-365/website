import { defineCollection, z } from 'astro:content';
 
const caseStudies = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    sector: z.string(),
    services: z.array(z.string()),
    tags: z.array(z.string()),
    timeline: z.string(),
    outcomes: z.array(z.string()),
    seo: z.object({
      description: z.string(),
      keywords: z.array(z.string()).optional(),
    }).optional(),
  }),
});
 
export const collections = {
  'case-studies': caseStudies,
};
