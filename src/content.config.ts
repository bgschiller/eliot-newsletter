import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const days = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/days" }),
  schema: z.object({
    date: z.coerce.date(),
    draft: z.boolean().optional().default(false),
    printScheduleSize: z.number().optional(),
    printBodySize: z.number().optional(),
    printHeadingSize: z.number().optional(),
    printPage1Articles: z.number().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string().optional(),
    attribution: z.string().optional(),
  }),
});

export const collections = { days, pages };
