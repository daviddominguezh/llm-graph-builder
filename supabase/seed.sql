-- =============================================================================
-- Seed: "Closer" org with david@usecloser.ai + 32 published MCP servers
-- Runs automatically on `supabase db reset`
-- =============================================================================

-- Fixed UUIDs for reproducibility
DO $$
DECLARE
  v_user_id   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_org_id    uuid := 'b0000000-0000-0000-0000-000000000001';
  v_recipe_agent_id uuid := 'c0000000-0000-0000-0000-000000000001';
BEGIN

-- 1. Create auth user (all string columns GoTrue scans must be '' not NULL)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, email_change_confirm_status,
  phone, phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous
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
  now(), now(),
  '', '', '', '',
  '', 0,
  '', '', '', '',
  false, false
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
  (v_org_id, 'Closer', 'closer', '/logoCloser.png')
ON CONFLICT (id) DO NOTHING;

-- 5. Add user as org owner
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  (v_org_id, v_user_id, 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 6. Publish MCP servers to library
-- auth_type: 'none' = no auth, 'token' = bearer/API key, 'oauth' = OAuth only
-- image_url: simpleicons.org where available, icon.horse favicon fallback
INSERT INTO public.mcp_library (
  org_id, name, description, category, auth_type, image_url,
  transport_type, transport_config, variables,
  published_by, installations_count
) VALUES
(v_org_id, 'Linear', 'Manage Linear issues, projects, teams, and workflows. Create, search, and update issues programmatically.', 'Project Management', 'token', 'https://cdn.simpleicons.org/linear',
 'http', '{"url":"https://mcp.linear.app/mcp","headers":{"Authorization":"Bearer {{LINEAR_API_KEY}}"}}'::jsonb,
 '[{"name":"LINEAR_API_KEY"}]'::jsonb, v_user_id, 0),
(v_org_id, 'GitHub', 'Access GitHub repositories, issues, pull requests, code search, and actions. Full GitHub API integration via Copilot.', 'Development', 'token', 'https://cdn.simpleicons.org/github',
 'http', '{"url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer {{GITHUB_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"GITHUB_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Slack', 'Send and read Slack messages, manage channels, and search conversations across your workspace.', 'Communication', 'token', 'https://api.iconify.design/logos/slack-icon.svg',
 'sse', '{"url":"https://mcp.slack.com/sse","headers":{"Authorization":"Bearer {{SLACK_BOT_TOKEN}}"}}'::jsonb,
 '[{"name":"SLACK_BOT_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Atlassian', 'Interact with Jira issues and Confluence pages. Search, create, update, and comment with full permission controls.', 'Project Management', 'token', 'https://cdn.simpleicons.org/atlassian',
 'http', '{"url":"https://mcp.atlassian.com/v1/mcp","headers":{"Authorization":"Bearer {{ATLASSIAN_API_TOKEN}}"}}'::jsonb,
 '[{"name":"ATLASSIAN_API_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Notion', 'Read and write Notion pages, databases, and blocks. Authenticates via OAuth.', 'Productivity', 'oauth', 'https://cdn.simpleicons.org/notion',
 'http', '{"url":"https://mcp.notion.com/mcp","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),
(v_org_id, 'Supabase', 'Manage Supabase projects, databases, migrations, Edge Functions, and storage buckets.', 'Data & Analytics', 'token', 'https://cdn.simpleicons.org/supabase',
 'http', '{"url":"https://mcp.supabase.com/mcp","headers":{"Authorization":"Bearer {{SUPABASE_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"SUPABASE_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Zapier', 'Connect to 8,000+ apps and 30,000+ actions through Zapier automations. Send messages, search data, and trigger workflows.', 'Productivity', 'token', 'https://cdn.simpleicons.org/zapier',
 'http', '{"url":"https://mcp.zapier.com/api/mcp/mcp","headers":{"Authorization":"Bearer {{ZAPIER_MCP_API_KEY}}"}}'::jsonb,
 '[{"name":"ZAPIER_MCP_API_KEY"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Context7', 'Fetch up-to-date, version-specific library and framework documentation for LLMs. No API key required.', 'Development', 'none', 'https://icon.horse/icon/context7.com',
 'http', '{"url":"https://mcp.context7.com/mcp","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),
(v_org_id, 'Stripe', 'Manage Stripe payments, customers, subscriptions, invoices, and refunds via the Stripe API.', 'Finance', 'token', 'https://cdn.simpleicons.org/stripe',
 'http', '{"url":"https://mcp.stripe.com","headers":{"Authorization":"Bearer {{STRIPE_SECRET_KEY}}"}}'::jsonb,
 '[{"name":"STRIPE_SECRET_KEY"}]'::jsonb, v_user_id, 0),
(v_org_id, 'GitLab', 'Access GitLab repositories, merge requests, issues, pipelines, and CI/CD resources.', 'Development', 'token', 'https://cdn.simpleicons.org/gitlab',
 'http', '{"url":"https://gitlab.com/api/v4/mcp","headers":{"Authorization":"Bearer {{GITLAB_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"GITLAB_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Snowflake', 'Query Snowflake data warehouses, run SQL, explore schemas, and interact with Cortex AI services.', 'Data & Analytics', 'token', 'https://cdn.simpleicons.org/snowflake',
 'http', '{"url":"https://mcp.snowflake.com/mcp","headers":{"Authorization":"Bearer {{SNOWFLAKE_OAUTH_TOKEN}}"}}'::jsonb,
 '[{"name":"SNOWFLAKE_OAUTH_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Figma', 'Inspect Figma components, styles, design tokens, frames, and file structures for AI-assisted design workflows.', 'Design', 'token', 'https://cdn.simpleicons.org/figma',
 'http', '{"url":"https://mcp.figma.com/mcp","headers":{"Authorization":"Bearer {{FIGMA_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"FIGMA_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Sentry', 'Query Sentry error events, issues, projects, and performance data for debugging and monitoring.', 'DevOps & Infrastructure', 'token', 'https://cdn.simpleicons.org/sentry',
 'http', '{"url":"https://mcp.sentry.dev/mcp","headers":{"Authorization":"Bearer {{SENTRY_USER_AUTH_TOKEN}}"}}'::jsonb,
 '[{"name":"SENTRY_USER_AUTH_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'PostHog', 'Access PostHog product analytics: query events, funnels, feature flags, session recordings, and experiments.', 'Data & Analytics', 'token', 'https://cdn.simpleicons.org/posthog',
 'http', '{"url":"https://mcp.posthog.com/mcp","headers":{"Authorization":"Bearer {{POSTHOG_PERSONAL_API_KEY}}"}}'::jsonb,
 '[{"name":"POSTHOG_PERSONAL_API_KEY"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Pinecone', 'Interact with Pinecone vector databases and Assistant. Upload files, query knowledge bases, and run semantic search.', 'AI & ML', 'token', 'https://icon.horse/icon/pinecone.io',
 'http', '{"url":"https://{{PINECONE_ASSISTANT_HOST}}/mcp","headers":{"Authorization":"Bearer {{PINECONE_API_KEY}}"}}'::jsonb,
 '[{"name":"PINECONE_ASSISTANT_HOST"},{"name":"PINECONE_API_KEY"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Cloudflare', 'Manage Cloudflare Workers, R2, KV, D1, DNS, AI Gateway, and more. Access docs and platform APIs.', 'DevOps & Infrastructure', 'token', 'https://cdn.simpleicons.org/cloudflare',
 'http', '{"url":"https://docs.mcp.cloudflare.com/mcp","headers":{"Authorization":"Bearer {{CLOUDFLARE_API_TOKEN}}"}}'::jsonb,
 '[{"name":"CLOUDFLARE_API_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'HubSpot', 'Access and manage HubSpot CRM data including contacts, companies, deals, and pipelines.', 'Sales', 'token', 'https://cdn.simpleicons.org/hubspot',
 'http', '{"url":"https://mcp.hubspot.com","headers":{"Authorization":"Bearer {{HUBSPOT_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"HUBSPOT_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'PagerDuty', 'Manage PagerDuty incidents, on-call schedules, services, and escalation policies.', 'DevOps & Infrastructure', 'token', 'https://cdn.simpleicons.org/pagerduty',
 'http', '{"url":"https://mcp.pagerduty.com/mcp","headers":{"Authorization":"Bearer {{PAGERDUTY_API_TOKEN}}"}}'::jsonb,
 '[{"name":"PAGERDUTY_API_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Asana', 'Interact with Asana tasks, projects, workspaces, and teams for project management automation.', 'Project Management', 'token', 'https://cdn.simpleicons.org/asana',
 'http', '{"url":"https://mcp.asana.com/v2/mcp","headers":{"Authorization":"Bearer {{ASANA_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"ASANA_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Intercom', 'Access Intercom customer messaging data: read conversations, list users, and manage companies.', 'Customer Support', 'token', 'https://cdn.simpleicons.org/intercom',
 'http', '{"url":"https://mcp.intercom.com/mcp","headers":{"Authorization":"Bearer {{INTERCOM_API_TOKEN}}"}}'::jsonb,
 '[{"name":"INTERCOM_API_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Monday', 'Connect to monday.com boards, items, and workflows for work management automation.', 'Project Management', 'token', 'https://icon.horse/icon/monday.com',
 'http', '{"url":"https://mcp.monday.com/mcp","headers":{"Authorization":"Bearer {{MONDAY_API_TOKEN}}"}}'::jsonb,
 '[{"name":"MONDAY_API_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'PayPal', 'Manage PayPal payments, invoices, orders, and subscriptions in sandbox or production.', 'Finance', 'token', 'https://cdn.simpleicons.org/paypal',
 'http', '{"url":"https://mcp.paypal.com/mcp","headers":{"Authorization":"Bearer {{PAYPAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"PAYPAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Webflow', 'Manage Webflow sites, collections, and CMS content for web design automation.', 'Design', 'token', 'https://cdn.simpleicons.org/webflow',
 'sse', '{"url":"https://mcp.webflow.com/sse","headers":{"Authorization":"Bearer {{WEBFLOW_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"WEBFLOW_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Netlify', 'Manage Netlify sites, deployments, functions, and environment variables.', 'DevOps & Infrastructure', 'token', 'https://cdn.simpleicons.org/netlify',
 'http', '{"url":"https://mcp.netlify.com/mcp","headers":{"Authorization":"Bearer {{NETLIFY_PERSONAL_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"NETLIFY_PERSONAL_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Neon', 'Manage Neon serverless Postgres databases: create and query projects, branches, and databases.', 'Data & Analytics', 'token', 'https://icon.horse/icon/neon.tech',
 'http', '{"url":"https://mcp.neon.tech/mcp","headers":{"Authorization":"Bearer {{NEON_API_KEY}}"}}'::jsonb,
 '[{"name":"NEON_API_KEY"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Canva', 'Access Canva Connect API to manage designs, brand assets, and templates.', 'Design', 'token', 'https://api.iconify.design/devicon/canva.svg',
 'http', '{"url":"https://mcp.canva.com/v1/mcp","headers":{"Authorization":"Bearer {{CANVA_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"CANVA_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Square', 'Manage Square payments, inventory, orders, and customers. Authenticates via OAuth.', 'Finance', 'oauth', 'https://cdn.simpleicons.org/square',
 'sse', '{"url":"https://mcp.squareup.com/sse","headers":{}}'::jsonb,
 '[]'::jsonb, v_user_id, 0),
(v_org_id, 'Wix', 'Manage Wix sites, content, and business data for website management automation.', 'Design', 'token', 'https://cdn.simpleicons.org/wix',
 'http', '{"url":"https://mcp.wix.com/v2/mcp","headers":{"Authorization":"Bearer {{WIX_ACCESS_TOKEN}}"}}'::jsonb,
 '[{"name":"WIX_ACCESS_TOKEN"}]'::jsonb, v_user_id, 0),
(v_org_id, 'Firecrawl', 'Web scraping and crawling: extract clean markdown from any URL, crawl websites, and perform deep research.', 'AI & ML', 'token', 'https://icon.horse/icon/firecrawl.dev',
 'http', '{"url":"https://mcp.firecrawl.dev/v2/mcp","headers":{"Authorization":"Bearer {{FIRECRAWL_API_KEY}}"}}'::jsonb,
 '[{"name":"FIRECRAWL_API_KEY"}]'::jsonb, v_user_id, 0);

-- 7. Create "test-recipe" agent
INSERT INTO public.agents (
  id, name, slug, description, version, current_version, org_id, start_node,
  created_at, updated_at
) VALUES (
  v_recipe_agent_id,
  'test-recipe',
  'test-recipe',
  'A test agent that extracts structured recipe data from user input.',
  1, 1, v_org_id, 'INITIAL_STEP',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- 8. Create graph nodes for test-recipe agent
INSERT INTO public.graph_nodes (
  id, agent_id, node_id, text, kind, description,
  next_node_is_user, global, position_x, position_y,
  output_schema_id, output_prompt
) VALUES
( 'c1000000-0000-0000-0000-000000000000',
  v_recipe_agent_id, 'INITIAL_STEP',
  'You are a friendly recipe assistant. Greet the user and ask them what recipe they would like to create.',
  'agent', 'Initial greeting node',
  false, false, 20, 108, NULL, NULL ),
( 'c1000000-0000-0000-0000-000000000001',
  v_recipe_agent_id, 'create_recipe',
  '',
  'agent', 'Generates a recipe',
  false, false, 257.5, 20, 'seLAsT6-u2dSZ0xoxHVp4',
  'Create a Michelin-star-level recipe for the dish the user requested, or, if they didn''t specify, for lasagna' ),
( 'c1000000-0000-0000-0000-000000000002',
  v_recipe_agent_id, 'terminal_node',
  '',
  'agent', '',
  false, false, 495, 20, NULL, NULL )
ON CONFLICT (id) DO NOTHING;

-- 9. Create edges: INITIAL_STEP -> create_recipe -> terminal_node
INSERT INTO public.graph_edges (
  id, agent_id, from_node, to_node
) VALUES
( 'c2000000-0000-0000-0000-000000000001',
  v_recipe_agent_id, 'INITIAL_STEP', 'create_recipe' ),
( 'c2000000-0000-0000-0000-000000000002',
  v_recipe_agent_id, 'create_recipe', 'terminal_node' )
ON CONFLICT (id) DO NOTHING;

-- 10. Create edge precondition (user_said on first edge only)
INSERT INTO public.graph_edge_preconditions (
  id, edge_id, type, value, description
) VALUES
( 'c3000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'user_said', 'I want a recipe like...', 'User expressed interest in creating a recipe' )
ON CONFLICT (id) DO NOTHING;

-- 11. Seed recipe output schema
INSERT INTO public.graph_output_schemas (agent_id, schema_id, name, fields) VALUES (
  v_recipe_agent_id,
  'seLAsT6-u2dSZ0xoxHVp4',
  'recipe_schema',
  '[
    {"name":"name","type":"string","required":true,"description":"The name of the recipe"},
    {"name":"duration","type":"number","required":true,"description":"The total cooking time (in minutes) of this recipe"},
    {"name":"ingredients","type":"array","required":true,"description":"The list of ingredients required for this recipe","items":{"name":"","type":"object","required":true,"properties":[{"name":"name","type":"string","required":true,"description":"The name of the ingredient"},{"name":"amount","type":"number","required":true,"description":"The amount of units required of this ingredient"},{"name":"unit","type":"enum","required":true,"description":"The unit in which we will measure this ingredient","enumValues":["pound","kg","ounce","ml","scoop","pinch"]},{"name":"costPerUnit","type":"number","required":true,"description":"The cost of each unit of this ingredient"}]}},
    {"name":"description","type":"string","required":true,"description":"A short, introductory description of this recipe"},
    {"name":"instructions","type":"string","required":true,"description":"The full list of instructions for this recipe"}
  ]'::jsonb
) ON CONFLICT (agent_id, schema_id) DO NOTHING;

END $$;
