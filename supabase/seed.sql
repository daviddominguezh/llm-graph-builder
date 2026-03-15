-- =============================================================================
-- Seed: "Closer" org with david@usecloser.ai + 32 published MCP servers
-- Runs automatically on `supabase db reset`
-- =============================================================================

-- Fixed UUIDs for reproducibility
DO $$
DECLARE
  v_user_id   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_org_id    uuid := 'b0000000-0000-0000-0000-000000000001';
BEGIN

-- 1. Create auth user
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token
) VALUES (
  v_user_id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'david@usecloser.ai',
  crypt('dev-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"David"}'::jsonb,
  now(),
  now(),
  ''
) ON CONFLICT (id) DO NOTHING;

-- 2. Create auth identity
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  v_user_id,
  v_user_id,
  'david@usecloser.ai',
  'email',
  jsonb_build_object('sub', v_user_id::text, 'email', 'david@usecloser.ai'),
  now(),
  now(),
  now()
) ON CONFLICT DO NOTHING;

-- 3. Create public user
INSERT INTO public.users (id, email, full_name) VALUES
  (v_user_id, 'david@usecloser.ai', 'David')
ON CONFLICT (id) DO NOTHING;

-- 4. Create "Closer" organization (avatar served from Next.js public/)
INSERT INTO public.organizations (id, name, slug, avatar_url) VALUES
  (v_org_id, 'Closer', 'closer', '/logoCloser.avif')
ON CONFLICT (id) DO NOTHING;

-- 5. Add user as org owner
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  (v_org_id, v_user_id, 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 6. Publish MCP servers to library
INSERT INTO public.mcp_library (
  org_id, name, description, category,
  transport_type, transport_config, variables,
  published_by, installations_count
) VALUES
-- Linear
(v_org_id, 'Linear', 'Manage Linear issues, projects, teams, and workflows. Create, search, and update issues programmatically.', 'Project Management',
 'http', '{"url":"https://mcp.linear.app/mcp","headers":{"Authorization":"Bearer {{LINEAR_API_KEY}}"}}'::jsonb,
 '[{"name":"LINEAR_API_KEY"}]'::jsonb, v_user_id, 0),

-- GitHub
(v_org_id, 'GitHub', 'Access GitHub repositories, issues, pull requests, code search, and actions. Full GitHub API integration via Copilot.', 'Development',
 'http', '{"url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer {{GITHUB_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"GITHUB_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Slack
(v_org_id, 'Slack', 'Send and read Slack messages, manage channels, and search conversations across your workspace.', 'Communication',
 'sse', '{"url":"https://mcp.slack.com/sse","headers":{"Authorization":"Bearer {{SLACK_BOT_TOKEN}}"}}'::jsonb,
 '[{"name":"SLACK_BOT_TOKEN"}]'::jsonb, v_user_id, 0),

-- Atlassian
(v_org_id, 'Atlassian', 'Interact with Jira issues and Confluence pages. Search, create, update, and comment with full permission controls.', 'Project Management',
 'http', '{"url":"https://mcp.atlassian.com/v1/mcp","headers":{"Authorization":"Bearer {{ATLASSIAN_API_TOKEN}}"}}'::jsonb,
 '[{"name":"ATLASSIAN_API_TOKEN"}]'::jsonb, v_user_id, 0),

-- Notion (OAuth only — no static token)
(v_org_id, 'Notion', 'Read and write Notion pages, databases, and blocks. Authenticates via OAuth.', 'Productivity',
 'http', '{"url":"https://mcp.notion.com/mcp","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),

-- Supabase
(v_org_id, 'Supabase', 'Manage Supabase projects, databases, migrations, Edge Functions, and storage buckets.', 'Data & Analytics',
 'http', '{"url":"https://mcp.supabase.com/mcp","headers":{"Authorization":"Bearer {{SUPABASE_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"SUPABASE_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Zapier
(v_org_id, 'Zapier', 'Connect to 8,000+ apps and 30,000+ actions through Zapier automations. Send messages, search data, and trigger workflows.', 'Productivity',
 'http', '{"url":"https://mcp.zapier.com/api/mcp/mcp","headers":{"Authorization":"Bearer {{ZAPIER_MCP_API_KEY}}"}}'::jsonb,
 '[{"name":"ZAPIER_MCP_API_KEY"}]'::jsonb, v_user_id, 0),

-- Context7 (no auth required)
(v_org_id, 'Context7', 'Fetch up-to-date, version-specific library and framework documentation for LLMs. No API key required.', 'Development',
 'http', '{"url":"https://mcp.context7.com/mcp","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),

-- Stripe
(v_org_id, 'Stripe', 'Manage Stripe payments, customers, subscriptions, invoices, and refunds via the Stripe API.', 'Finance',
 'http', '{"url":"https://mcp.stripe.com","headers":{"Authorization":"Bearer {{STRIPE_SECRET_KEY}}"}}'::jsonb,
 '[{"name":"STRIPE_SECRET_KEY"}]'::jsonb, v_user_id, 0),

-- GitLab
(v_org_id, 'GitLab', 'Access GitLab repositories, merge requests, issues, pipelines, and CI/CD resources.', 'Development',
 'http', '{"url":"https://gitlab.com/api/v4/mcp","headers":{"Authorization":"Bearer {{GITLAB_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"GITLAB_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Snowflake
(v_org_id, 'Snowflake', 'Query Snowflake data warehouses, run SQL, explore schemas, and interact with Cortex AI services.', 'Data & Analytics',
 'http', '{"url":"https://mcp.snowflake.com/mcp","headers":{"Authorization":"Bearer {{SNOWFLAKE_OAUTH_TOKEN}}"}}'::jsonb,
 '[{"name":"SNOWFLAKE_OAUTH_TOKEN"}]'::jsonb, v_user_id, 0),

-- Figma
(v_org_id, 'Figma', 'Inspect Figma components, styles, design tokens, frames, and file structures for AI-assisted design workflows.', 'Design',
 'http', '{"url":"https://mcp.figma.com/mcp","headers":{"Authorization":"Bearer {{FIGMA_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"FIGMA_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- AWS (no auth required — public docs endpoint)
(v_org_id, 'AWS', 'Access official AWS documentation, code samples, and architectural guidance in real time. No authentication required.', 'DevOps & Infrastructure',
 'http', '{"url":"https://knowledge-mcp.global.api.aws","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),

-- Sentry
(v_org_id, 'Sentry', 'Query Sentry error events, issues, projects, and performance data for debugging and monitoring.', 'DevOps & Infrastructure',
 'http', '{"url":"https://mcp.sentry.dev/mcp","headers":{"Authorization":"Bearer {{SENTRY_USER_AUTH_TOKEN}}"}}'::jsonb,
 '[{"name":"SENTRY_USER_AUTH_TOKEN"}]'::jsonb, v_user_id, 0),

-- PostHog
(v_org_id, 'PostHog', 'Access PostHog product analytics: query events, funnels, feature flags, session recordings, and experiments.', 'Data & Analytics',
 'http', '{"url":"https://mcp.posthog.com/mcp","headers":{"Authorization":"Bearer {{POSTHOG_PERSONAL_API_KEY}}"}}'::jsonb,
 '[{"name":"POSTHOG_PERSONAL_API_KEY"}]'::jsonb, v_user_id, 0),

-- Pinecone
(v_org_id, 'Pinecone', 'Interact with Pinecone vector databases and Assistant. Upload files, query knowledge bases, and run semantic search.', 'AI & ML',
 'http', '{"url":"https://{{PINECONE_ASSISTANT_HOST}}/mcp","headers":{"Authorization":"Bearer {{PINECONE_API_KEY}}"}}'::jsonb,
 '[{"name":"PINECONE_ASSISTANT_HOST"},{"name":"PINECONE_API_KEY"}]'::jsonb, v_user_id, 0),

-- Cloudflare
(v_org_id, 'Cloudflare', 'Manage Cloudflare Workers, R2, KV, D1, DNS, AI Gateway, and more. Access docs and platform APIs.', 'DevOps & Infrastructure',
 'http', '{"url":"https://docs.mcp.cloudflare.com/mcp","headers":{"Authorization":"Bearer {{CLOUDFLARE_API_TOKEN}}"}}'::jsonb,
 '[{"name":"CLOUDFLARE_API_TOKEN"}]'::jsonb, v_user_id, 0),

-- Vercel (OAuth only — no static token)
(v_org_id, 'Vercel', 'Manage Vercel projects, deployments, and logs. Search Vercel documentation. Authenticates via OAuth.', 'DevOps & Infrastructure',
 'http', '{"url":"https://mcp.vercel.com","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),

-- HubSpot
(v_org_id, 'HubSpot', 'Access and manage HubSpot CRM data including contacts, companies, deals, and pipelines.', 'Sales',
 'http', '{"url":"https://mcp.hubspot.com","headers":{"Authorization":"Bearer {{HUBSPOT_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"HUBSPOT_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- PagerDuty
(v_org_id, 'PagerDuty', 'Manage PagerDuty incidents, on-call schedules, services, and escalation policies.', 'DevOps & Infrastructure',
 'http', '{"url":"https://mcp.pagerduty.com/mcp","headers":{"Authorization":"Bearer {{PAGERDUTY_API_TOKEN}}"}}'::jsonb,
 '[{"name":"PAGERDUTY_API_TOKEN"}]'::jsonb, v_user_id, 0),

-- GCP
(v_org_id, 'GCP', 'Interact with Google Cloud resources via a self-deployed Cloud Run MCP server. Manages Compute, Storage, BigQuery, and more.', 'DevOps & Infrastructure',
 'http', '{"url":"https://{{GCP_CLOUD_RUN_URL}}/mcp","headers":{"Authorization":"Bearer {{GCP_OAUTH_TOKEN}}"}}'::jsonb,
 '[{"name":"GCP_CLOUD_RUN_URL"},{"name":"GCP_OAUTH_TOKEN"}]'::jsonb, v_user_id, 0),

-- Asana
(v_org_id, 'Asana', 'Interact with Asana tasks, projects, workspaces, and teams for project management automation.', 'Project Management',
 'http', '{"url":"https://mcp.asana.com/v2/mcp","headers":{"Authorization":"Bearer {{ASANA_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"ASANA_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Intercom
(v_org_id, 'Intercom', 'Access Intercom customer messaging data: read conversations, list users, and manage companies.', 'Customer Support',
 'http', '{"url":"https://mcp.intercom.com/mcp","headers":{"Authorization":"Bearer {{INTERCOM_API_TOKEN}}"}}'::jsonb,
 '[{"name":"INTERCOM_API_TOKEN"}]'::jsonb, v_user_id, 0),

-- Monday
(v_org_id, 'Monday', 'Connect to monday.com boards, items, and workflows for work management automation.', 'Project Management',
 'http', '{"url":"https://mcp.monday.com/mcp","headers":{"Authorization":"Bearer {{MONDAY_API_TOKEN}}"}}'::jsonb,
 '[{"name":"MONDAY_API_TOKEN"}]'::jsonb, v_user_id, 0),

-- PayPal
(v_org_id, 'PayPal', 'Manage PayPal payments, invoices, orders, and subscriptions in sandbox or production.', 'Finance',
 'http', '{"url":"https://mcp.paypal.com/mcp","headers":{"Authorization":"Bearer {{PAYPAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"PAYPAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Webflow
(v_org_id, 'Webflow', 'Manage Webflow sites, collections, and CMS content for web design automation.', 'Design',
 'sse', '{"url":"https://mcp.webflow.com/sse","headers":{"Authorization":"Bearer {{WEBFLOW_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"WEBFLOW_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Netlify
(v_org_id, 'Netlify', 'Manage Netlify sites, deployments, functions, and environment variables.', 'DevOps & Infrastructure',
 'http', '{"url":"https://mcp.netlify.com/mcp","headers":{"Authorization":"Bearer {{NETLIFY_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"NETLIFY_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Neon
(v_org_id, 'Neon', 'Manage Neon serverless Postgres databases: create and query projects, branches, and databases.', 'Data & Analytics',
 'http', '{"url":"https://mcp.neon.tech/mcp","headers":{"Authorization":"Bearer {{NEON_API_KEY}}"}}'::jsonb,
 '[{"name":"NEON_API_KEY"}]'::jsonb, v_user_id, 0),

-- Canva
(v_org_id, 'Canva', 'Access Canva Connect API to manage designs, brand assets, and templates.', 'Design',
 'http', '{"url":"https://mcp.canva.com/v1/mcp","headers":{"Authorization":"Bearer {{CANVA_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"CANVA_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Square (OAuth only — no static token)
(v_org_id, 'Square', 'Manage Square payments, inventory, orders, and customers. Authenticates via OAuth.', 'Finance',
 'sse', '{"url":"https://mcp.squareup.com/sse","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),

-- Wix
(v_org_id, 'Wix', 'Manage Wix sites, content, and business data for website management automation.', 'Design',
 'http', '{"url":"https://mcp.wix.com/v2/mcp","headers":{"Authorization":"Bearer {{WIX_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"WIX_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),

-- Firecrawl
(v_org_id, 'Firecrawl', 'Web scraping and crawling: extract clean markdown from any URL, crawl websites, and perform deep research.', 'AI & ML',
 'http', '{"url":"https://mcp.firecrawl.dev/v2/mcp","headers":{"Authorization":"Bearer {{FIRECRAWL_API_KEY}}"}}'::jsonb,
 '[{"name":"FIRECRAWL_API_KEY"}]'::jsonb, v_user_id, 0);

END $$;
