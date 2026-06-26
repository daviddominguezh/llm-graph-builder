-- SP4: tenant-scoped MCP configuration. Two tables hang off graph_mcp_servers
-- via composite FK (agent_id, server_id). Config is the durable working copy;
-- discovery is the volatile verification cache. RLS mirrors graph_mcp_servers.

-- 1. Durable per-tenant config (builder edits this; snapshotted at publish)
create table if not exists public.graph_mcp_server_tenant_config (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  server_id       text not null,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  variable_values jsonb not null default '{}',
  updated_at      timestamptz not null default now(),
  unique (agent_id, server_id, tenant_id),
  foreign key (agent_id, server_id)
    references public.graph_mcp_servers (agent_id, server_id) on delete cascade
);
create index if not exists graph_mcp_server_tenant_config_tenant_idx
  on public.graph_mcp_server_tenant_config (tenant_id);

-- 2. Volatile discovery verification cache
create table if not exists public.graph_mcp_server_tenant_discovery (
  agent_id        uuid not null,
  server_id       text not null,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  error           text,
  values_hash     text,
  discovered_at   timestamptz,
  primary key (agent_id, server_id, tenant_id),
  foreign key (agent_id, server_id)
    references public.graph_mcp_servers (agent_id, server_id) on delete cascade
);

-- 3. updated_at trigger on the config table
create or replace function public.set_mcp_tenant_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger trg_mcp_tenant_config_updated_at
  before update on public.graph_mcp_server_tenant_config
  for each row execute function public.set_mcp_tenant_config_updated_at();

-- 4. RLS — mirror graph_mcp_servers: org member AND tenant in the agent's org
alter table public.graph_mcp_server_tenant_config enable row level security;
alter table public.graph_mcp_server_tenant_discovery enable row level security;

create policy mcp_tenant_config_rw on public.graph_mcp_server_tenant_config
  for all
  using (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  )
  with check (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  );

create policy mcp_tenant_discovery_rw on public.graph_mcp_server_tenant_discovery
  for all
  using (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  )
  with check (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  );

-- 5. Backfill: one config row per (existing server, every tenant in the agent's org),
-- seeded from the server's agent-wide variable_values (coalesced). Idempotent.
insert into public.graph_mcp_server_tenant_config (agent_id, server_id, tenant_id, variable_values)
select m.agent_id, m.server_id, t.id, coalesce(m.variable_values, '{}'::jsonb)
from public.graph_mcp_servers m
join public.agents a on a.id = m.agent_id
join public.tenants t on t.org_id = a.org_id
on conflict (agent_id, server_id, tenant_id) do nothing;
