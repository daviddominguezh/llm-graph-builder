import { z } from 'zod';

export const webSearchInput = z.object({
  query: z.string().min(1),
  max_results: z.number().int().optional(),
  search_depth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']).optional(),
  topic: z.literal('general').optional(),
  time_range: z.enum(['day', 'week', 'month', 'year']).nullable().optional(),
  include_images: z.boolean().optional(),
  include_image_descriptions: z.boolean().optional(),
  include_raw_content: z.boolean().optional(),
  include_domains: z.array(z.string()).optional(),
  exclude_domains: z.array(z.string()).optional(),
  country: z.string().optional(),
  include_favicon: z.boolean().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  exact_match: z.boolean().nullable().optional(),
});

export const webExtractInput = z.object({
  urls: z.array(z.string()).min(1),
  extract_depth: z.enum(['basic', 'advanced']).optional(),
  include_images: z.boolean().optional(),
  format: z.enum(['markdown', 'text']).optional(),
  include_favicon: z.boolean().optional(),
  query: z.string().optional(),
});

export const webCrawlInput = z.object({
  url: z.string().min(1),
  max_depth: z.number().int().min(1).optional(),
  max_breadth: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
  instructions: z.string().optional(),
  select_paths: z.array(z.string()).optional(),
  select_domains: z.array(z.string()).optional(),
  allow_external: z.boolean().optional(),
  extract_depth: z.enum(['basic', 'advanced']).optional(),
  format: z.enum(['markdown', 'text']).optional(),
  include_favicon: z.boolean().optional(),
});

export const webMapInput = z.object({
  url: z.string().min(1),
  max_depth: z.number().int().min(1).optional(),
  max_breadth: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
  instructions: z.string().optional(),
  select_paths: z.array(z.string()).optional(),
  select_domains: z.array(z.string()).optional(),
  allow_external: z.boolean().optional(),
});

export type WebSearchInput = z.infer<typeof webSearchInput>;
export type WebExtractInput = z.infer<typeof webExtractInput>;
export type WebCrawlInput = z.infer<typeof webCrawlInput>;
export type WebMapInput = z.infer<typeof webMapInput>;
