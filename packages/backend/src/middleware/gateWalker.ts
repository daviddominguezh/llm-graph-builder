import type { Express, RequestHandler } from 'express';

export interface GateWalkerOptions {
  requireAuth: RequestHandler;
  gates: RequestHandler[];
  publicUnauthed?: string[];
  publicAuthed?: string[];
  webhookPrefix?: string;
}

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const DEFAULT_WEBHOOK_PREFIX = '/webhooks';
const FIRST_MATCHER_IDX = 0;
const NOT_FOUND_IDX = -1;
const PROBE_PATH = '/____probe____/x';
const PROBE_BASE = '/____probe____';

interface RouteEntry {
  method: string;
  path: string;
  chain: RequestHandler[];
}

interface RouteStackItem {
  method: string;
  handle: RequestHandler;
}

interface RouteLayer {
  path: string;
  stack: RouteStackItem[];
}

type MatcherFn = (path: string) => false | { path: string };

interface ExpressLayer {
  route?: RouteLayer;
  name?: string;
  handle?: ExpressRouterHandle | RequestHandler;
  matchers?: MatcherFn[];
}

interface ExpressRouterHandle {
  stack: ExpressLayer[];
}

interface AppWithRouter {
  router: ExpressRouterHandle;
}

function isObjectOrFunction(value: unknown): value is object {
  const t = typeof value;
  return (t === 'object' && value !== null) || t === 'function';
}

function hasRouterStack(value: object): value is AppWithRouter {
  if (!('router' in value)) return false;
  const { router } = value as { router: unknown };
  if (!isObjectOrFunction(router)) return false;
  return 'stack' in router;
}

function isAppWithRouter(value: unknown): value is AppWithRouter {
  if (!isObjectOrFunction(value)) return false;
  return hasRouterStack(value);
}

function isRouterHandle(handle: ExpressRouterHandle | RequestHandler | undefined): handle is ExpressRouterHandle {
  return handle !== undefined && typeof handle === 'object' && 'stack' in handle;
}

function getMountPath(layer: ExpressLayer): string {
  const matcher = layer.matchers?.[FIRST_MATCHER_IDX];
  if (matcher === undefined) return '';
  const result = matcher(PROBE_PATH);
  if (result === false) return '';
  return result.path === PROBE_BASE ? '' : result.path;
}

function extractRouteChain(routeStack: RouteStackItem[]): RequestHandler[] {
  return routeStack.filter((s) => typeof s.handle === 'function').map((s) => s.handle);
}

function collectRouterMiddleware(stack: ExpressLayer[]): RequestHandler[] {
  const mws: RequestHandler[] = [];
  for (const layer of stack) {
    const isRoute = layer.route !== undefined;
    const isRouter = layer.name === 'router';
    if (isRoute || isRouter) break;
    if (typeof layer.handle === 'function') {
      mws.push(layer.handle);
    }
  }
  return mws;
}

function walkRouterStack(
  stack: ExpressLayer[],
  basePath: string,
  parentMiddleware: RequestHandler[],
): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const layer of stack) {
    if (layer.route !== undefined) {
      out.push(...processRouteLayer(layer.route, basePath, parentMiddleware));
    } else if (layer.name === 'router' && isRouterHandle(layer.handle)) {
      out.push(...processSubRouter(layer, basePath, parentMiddleware));
    }
  }
  return out;
}

function processRouteLayer(
  route: RouteLayer,
  basePath: string,
  parentMiddleware: RequestHandler[],
): RouteEntry[] {
  const routePath = basePath + route.path;
  const leafChain = extractRouteChain(route.stack);
  const out: RouteEntry[] = [];
  for (const item of route.stack) {
    if (!MUTATING_METHODS.has(item.method)) continue;
    out.push({ method: item.method, path: routePath, chain: [...parentMiddleware, ...leafChain] });
    break;
  }
  return out;
}

function processSubRouter(
  layer: ExpressLayer,
  basePath: string,
  parentMiddleware: RequestHandler[],
): RouteEntry[] {
  const { handle } = layer;
  if (!isRouterHandle(handle)) return [];
  const { stack: subStack } = handle;
  const mountPath = getMountPath(layer);
  const routerMw = collectRouterMiddleware(subStack);
  return walkRouterStack(subStack, basePath + mountPath, [...parentMiddleware, ...routerMw]);
}

function getAppRouterStack(app: Express): ExpressLayer[] {
  if (!isAppWithRouter(app)) {
    throw new Error('Express app does not have a router property');
  }
  return app.router.stack;
}

function isGateAfterAuth(chain: RequestHandler[], authIdx: number, gates: RequestHandler[]): boolean {
  return chain.some((mw, idx) => idx > authIdx && gates.includes(mw));
}

function assertRouteValid(route: RouteEntry, opts: GateWalkerOptions, publicAuthed: Set<string>): void {
  const authIdx = route.chain.indexOf(opts.requireAuth);
  if (authIdx === NOT_FOUND_IDX) {
    throw new Error(`Route ${route.method.toUpperCase()} ${route.path} missing requireAuth`);
  }
  if (publicAuthed.has(route.path)) return;
  if (!isGateAfterAuth(route.chain, authIdx, opts.gates)) {
    throw new Error(
      `Route ${route.method.toUpperCase()} ${route.path} missing gate middleware (or wrong order)`,
    );
  }
}

export function assertGateCoverage(app: Express, opts: GateWalkerOptions): void {
  const webhookPrefix = opts.webhookPrefix ?? DEFAULT_WEBHOOK_PREFIX;
  const publicUnauthed = new Set(opts.publicUnauthed ?? []);
  const publicAuthed = new Set(opts.publicAuthed ?? []);
  const stack = getAppRouterStack(app);
  const routes = walkRouterStack(stack, '', []);
  for (const route of routes) {
    if (publicUnauthed.has(route.path)) continue;
    if (route.path.startsWith(webhookPrefix)) continue;
    assertRouteValid(route, opts, publicAuthed);
  }
}
