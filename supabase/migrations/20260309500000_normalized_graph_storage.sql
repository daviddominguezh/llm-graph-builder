-- ============================================================================
-- Normalized graph storage: move from JSONB columns to relational tables
-- ============================================================================

-- ============================================================================
-- 1. Add new columns to agents
-- ============================================================================

alter table public.agents
  add column start_node text not null default 'INITIAL_STEP';

alter table public.agents
  add column current_version integer not null default 0;

-- ============================================================================
-- 2. Create agent_versions table
-- ============================================================================

create table public.agent_versions (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.agents(id) on delete cascade,
  version      integer not null,
  graph_data   jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users,
  unique (agent_id, version)
);

alter table public.agent_versions enable row level security;

create policy "Org members can read agent versions"
  on public.agent_versions for select
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can insert agent versions"
  on public.agent_versions for insert
  with check (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

-- ============================================================================
-- 3. Create graph_nodes table
-- ============================================================================

create table public.graph_nodes (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references public.agents(id) on delete cascade,
  node_id           text not null,
  text              text not null default '',
  kind              text not null default 'agent',
  description       text not null default '',
  agent             text,
  next_node_is_user boolean not null default false,
  fallback_node_id  text,
  "global"          boolean not null default false,
  default_fallback  boolean,
  position_x        double precision,
  position_y        double precision,
  unique (agent_id, node_id)
);

alter table public.graph_nodes enable row level security;

create policy "Org members can read graph nodes"
  on public.graph_nodes for select
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can insert graph nodes"
  on public.graph_nodes for insert
  with check (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can update graph nodes"
  on public.graph_nodes for update
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can delete graph nodes"
  on public.graph_nodes for delete
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

-- ============================================================================
-- 4. Create graph_edges table
-- ============================================================================

create table public.graph_edges (
  id        uuid primary key default gen_random_uuid(),
  agent_id  uuid not null references public.agents(id) on delete cascade,
  from_node text not null,
  to_node   text not null,
  unique (agent_id, from_node, to_node)
);

alter table public.graph_edges enable row level security;

create policy "Org members can read graph edges"
  on public.graph_edges for select
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can insert graph edges"
  on public.graph_edges for insert
  with check (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can update graph edges"
  on public.graph_edges for update
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can delete graph edges"
  on public.graph_edges for delete
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

-- ============================================================================
-- 5. Create graph_edge_preconditions table
-- ============================================================================

create table public.graph_edge_preconditions (
  id          uuid primary key default gen_random_uuid(),
  edge_id     uuid not null references public.graph_edges(id) on delete cascade,
  type        text not null,
  value       text not null,
  description text not null default ''
);

alter table public.graph_edge_preconditions enable row level security;

create policy "Org members can read edge preconditions"
  on public.graph_edge_preconditions for select
  using (
    public.is_org_member(
      (select a.org_id
       from public.graph_edges e
       join public.agents a on a.id = e.agent_id
       where e.id = edge_id)
    )
  );

create policy "Org members can insert edge preconditions"
  on public.graph_edge_preconditions for insert
  with check (
    public.is_org_member(
      (select a.org_id
       from public.graph_edges e
       join public.agents a on a.id = e.agent_id
       where e.id = edge_id)
    )
  );

create policy "Org members can delete edge preconditions"
  on public.graph_edge_preconditions for delete
  using (
    public.is_org_member(
      (select a.org_id
       from public.graph_edges e
       join public.agents a on a.id = e.agent_id
       where e.id = edge_id)
    )
  );

-- ============================================================================
-- 6. Create graph_edge_context_preconditions table
-- ============================================================================

create table public.graph_edge_context_preconditions (
  id             uuid primary key default gen_random_uuid(),
  edge_id        uuid not null references public.graph_edges(id) on delete cascade,
  preconditions  text[] not null default '{}',
  jump_to        text
);

alter table public.graph_edge_context_preconditions enable row level security;

create policy "Org members can read edge context preconditions"
  on public.graph_edge_context_preconditions for select
  using (
    public.is_org_member(
      (select a.org_id
       from public.graph_edges e
       join public.agents a on a.id = e.agent_id
       where e.id = edge_id)
    )
  );

create policy "Org members can insert edge context preconditions"
  on public.graph_edge_context_preconditions for insert
  with check (
    public.is_org_member(
      (select a.org_id
       from public.graph_edges e
       join public.agents a on a.id = e.agent_id
       where e.id = edge_id)
    )
  );

create policy "Org members can delete edge context preconditions"
  on public.graph_edge_context_preconditions for delete
  using (
    public.is_org_member(
      (select a.org_id
       from public.graph_edges e
       join public.agents a on a.id = e.agent_id
       where e.id = edge_id)
    )
  );

-- ============================================================================
-- 7. Create graph_agents table
-- ============================================================================

create table public.graph_agents (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  agent_key   text not null,
  description text not null default '',
  unique (agent_id, agent_key)
);

alter table public.graph_agents enable row level security;

create policy "Org members can read graph agents"
  on public.graph_agents for select
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can insert graph agents"
  on public.graph_agents for insert
  with check (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can update graph agents"
  on public.graph_agents for update
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can delete graph agents"
  on public.graph_agents for delete
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

-- ============================================================================
-- 8. Create graph_mcp_servers table
-- ============================================================================

create table public.graph_mcp_servers (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references public.agents(id) on delete cascade,
  server_id        text not null,
  name             text not null,
  transport_type   text not null,
  transport_config jsonb not null default '{}',
  enabled          boolean not null default true,
  unique (agent_id, server_id)
);

alter table public.graph_mcp_servers enable row level security;

create policy "Org members can read graph mcp servers"
  on public.graph_mcp_servers for select
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can insert graph mcp servers"
  on public.graph_mcp_servers for insert
  with check (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can update graph mcp servers"
  on public.graph_mcp_servers for update
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can delete graph mcp servers"
  on public.graph_mcp_servers for delete
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

-- ============================================================================
-- 9. Create graph_context_presets table
-- ============================================================================

create table public.graph_context_presets (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.agents(id) on delete cascade,
  name       text not null,
  session_id text not null default '',
  tenant_id  text not null default '',
  user_id    text not null default '',
  data       jsonb not null default '{}',
  unique (agent_id, name)
);

alter table public.graph_context_presets enable row level security;

create policy "Org members can read graph context presets"
  on public.graph_context_presets for select
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can insert graph context presets"
  on public.graph_context_presets for insert
  with check (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can update graph context presets"
  on public.graph_context_presets for update
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

create policy "Org members can delete graph context presets"
  on public.graph_context_presets for delete
  using (
    public.is_org_member(
      (select org_id from public.agents where id = agent_id)
    )
  );

-- ============================================================================
-- 10. Drop old JSONB columns from agents
-- ============================================================================

alter table public.agents
  drop column graph_data_staging;

alter table public.agents
  drop column graph_data_production;

-- ============================================================================
-- 11. Drop old publish_agent RPC function
-- ============================================================================

drop function if exists public.publish_agent(uuid);
