import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const days = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/days" }),
  schema: z.object({
    date: z.coerce.date(),
  }),
});

export const collections = { days };
