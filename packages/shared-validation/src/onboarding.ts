export const INDUSTRY_OPTIONS = [
  'it_software',
  'legal',
  'health',
  'finance',
  'education',
  'ecommerce',
  'media',
  'manufacturing',
  'real_estate',
  'other',
] as const;

export const COMPANY_SIZE_OPTIONS = [
  '1',
  '2-10',
  '10-50',
  '50-100',
  '100-500',
  '500-1000',
  '1000-5000',
  '5000+',
] as const;

export const ROLE_OPTIONS = [
  'developer',
  'founder',
  'c_level',
  'product',
  'marketing',
  'sales',
  'legal',
  'operations',
  'other',
] as const;

export const REFERRAL_OPTIONS = [
  'linkedin',
  'youtube',
  'friend_referral',
  'reddit',
  'discord',
  'tldr',
  'google_search',
  'twitter_x',
  'blog_post',
  'other',
] as const;

export const BUILD_GOAL_OPTIONS = [
  'ai_agents',
  'ai_agency',
  'workflows',
  'browser_automation',
  'chatbot',
  'not_sure',
] as const;

export type Industry = (typeof INDUSTRY_OPTIONS)[number];
export type CompanySize = (typeof COMPANY_SIZE_OPTIONS)[number];
export type Role = (typeof ROLE_OPTIONS)[number];
export type Referral = (typeof REFERRAL_OPTIONS)[number];
export type BuildGoal = (typeof BUILD_GOAL_OPTIONS)[number];
