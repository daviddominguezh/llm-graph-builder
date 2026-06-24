'use client';

import type { UseMcpTenantConfigsResult } from '@/app/hooks/useMcpTenantConfigs';
import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { VariableValue } from '../VariableValuesEditor';
import { McpMatrixRow } from './McpMatrixRow';
import type { MatrixTenant } from './mcpMatrixModalLogic';

type VariableMap = Record<string, VariableValue>;

// Frozen-column widths (keep in sync with the grid template + sticky offsets) so
// the scroll-fades sit in the variable region, not over the frozen columns.
const TENANT_COL_PX = 200;
const ACTION_COL_PX = 72;
const GRID_GAP_PX = 1;
const EDGE_THRESHOLD_PX = 1;

export interface MatrixSectionProps {
  server: McpServerConfig;
  tenants: MatrixTenant[];
  columns: string[];
  envVariables: OrgEnvVariableRow[];
  config: UseMcpTenantConfigsResult;
  statusFor: (tenantId: string) => ServerTenantStatus;
  valuesFor: (tenantId: string) => VariableMap;
  onTest: (tenantId: string) => void;
  onCellChange: (tenantId: string, variable: string, value: VariableValue) => void;
}

// Header cells share the muted/semibold look. Opaque bg-popover so the grid's
// 1px gaps render as bg-border lines. Frozen header cells use z-20 so they stay
// above the body's z-10 sticky cells when scrolled.
const HEADER_CELL = 'px-3 py-2.5 bg-popover font-semibold text-muted-foreground';
// Frozen columns use a solid bg-background. border-r/border-l + -mr-px/-ml-px put
// the divider on the cell itself and swallow the adjacent grid gap (a single 1px
// line that survives scroll; the gap-line otherwise scrolls under the column).
const HEADER_FROZEN_LEFT = 'sticky left-0 z-20 -mr-px border-r bg-background';
// Two frozen right columns: Status sits left of the 72px Action column, offset by
// the Action width + the 1px grid gap (keep the 72px Action width in MatrixGrid in sync).
const HEADER_FROZEN_STATUS = 'sticky right-[73px] z-20 -ml-px border-l bg-background';
const HEADER_FROZEN_ACTION = 'sticky right-0 z-20 -ml-px border-l bg-background';

function LoadingBody() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyTenants() {
  const t = useTranslations('mcpMatrix');
  return <p className="py-6 text-center text-xs text-muted-foreground">{t('emptyTenants')}</p>;
}

function OAuthNote() {
  const t = useTranslations('mcpMatrix');
  return <p className="text-xs text-muted-foreground">{t('oauthStatusOnly')}</p>;
}

function MatrixHeaderCells({
  columns,
  statusRef,
}: {
  columns: string[];
  statusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations('mcpMatrix');
  return (
    <>
      <div className={`${HEADER_CELL} ${HEADER_FROZEN_LEFT}`}>{t('tenantColumn')}</div>
      {columns.map((variable) => (
        <div key={variable} className={`${HEADER_CELL} text-center font-mono text-[11px]`}>
          {`{{${variable}}}`}
        </div>
      ))}
      <div ref={statusRef} className={`${HEADER_CELL} ${HEADER_FROZEN_STATUS}`}>
        {t('statusColumn')}
      </div>
      <div className={`${HEADER_CELL} ${HEADER_FROZEN_ACTION} text-center`}>{t('actionColumn')}</div>
    </>
  );
}

interface ScrollFades {
  showStart: boolean;
  showEnd: boolean;
  rightInset: number;
}

// Track horizontal scroll edges (so a fade shows only when there's more to scroll
// that way) and measure the right frozen group so the end-fade stops at it.
function useScrollFades(
  scrollerRef: React.RefObject<HTMLDivElement | null>,
  statusRef: React.RefObject<HTMLDivElement | null>,
  columnCount: number
): ScrollFades {
  const [fades, setFades] = useState<ScrollFades>({
    showStart: false,
    showEnd: false,
    rightInset: ACTION_COL_PX,
  });
  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (el === null) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const statusWidth = statusRef.current?.offsetWidth ?? 0;
    setFades({
      showStart: el.scrollLeft > EDGE_THRESHOLD_PX,
      showEnd: el.scrollLeft < maxScroll - EDGE_THRESHOLD_PX,
      rightInset: ACTION_COL_PX + GRID_GAP_PX + statusWidth + GRID_GAP_PX,
    });
  }, [scrollerRef, statusRef]);
  useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (el === null) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [update, columnCount]);
  return fades;
}

const FADE_BASE = 'pointer-events-none absolute inset-y-0 z-[1] w-10';

function FadeEdges({ fades }: { fades: ScrollFades }) {
  return (
    <>
      {fades.showStart && (
        <div
          aria-hidden
          style={{ left: TENANT_COL_PX }}
          className={`${FADE_BASE} bg-gradient-to-r from-background to-transparent`}
        />
      )}
      {fades.showEnd && (
        <div
          aria-hidden
          style={{ right: fades.rightInset }}
          className={`${FADE_BASE} bg-gradient-to-l from-background to-transparent`}
        />
      )}
    </>
  );
}

function MatrixGrid(props: MatrixSectionProps) {
  const gridStyle = {
    // Size to content (w-max) so few-variable matrices don't stretch to full
    // width with an empty filler cell. Status sizes to content; Action is a fixed
    // 72px holding the reload button (HEADER_FROZEN_STATUS's right-[73px] =
    // 72px + 1px gap). Wide matrices overflow and scroll with frozen columns.
    gridTemplateColumns: `200px repeat(${props.columns.length}, 220px) max-content 72px`,
  };
  const scrollerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const fades = useScrollFades(scrollerRef, statusRef, props.columns.length);
  return (
    // Bordered/rounded wrapper sizes to content (centered when narrow, capped at
    // the container when wide). It must NOT enclose the sticky cells as their
    // scroll context — the inner overflow-x-auto is the scroll container, so the
    // grid stays overflow:visible and the frozen columns stick to the scroller.
    <div className="relative mx-auto w-max max-w-full overflow-hidden rounded-md border">
      <div ref={scrollerRef} data-native-scroll className="overflow-x-auto">
        <div className="grid w-max gap-px bg-border text-xs" style={gridStyle}>
          <MatrixHeaderCells columns={props.columns} statusRef={statusRef} />
          {props.tenants.map((tenant) => (
            <McpMatrixRow
              key={tenant.id}
              tenant={tenant}
              columns={props.columns}
              values={props.valuesFor(tenant.id)}
              status={props.statusFor(tenant.id)}
              verifying={props.config.verifyingFor(props.server.id, tenant.id)}
              envVars={props.envVariables}
              onCellChange={(variable, value) => props.onCellChange(tenant.id, variable, value)}
              onTest={() => props.onTest(tenant.id)}
            />
          ))}
        </div>
      </div>
      <FadeEdges fades={fades} />
    </div>
  );
}

export function MatrixSection(props: MatrixSectionProps) {
  if (props.config.loading) return <LoadingBody />;
  if (props.tenants.length === 0) return <EmptyTenants />;
  return (
    <section className="flex flex-col gap-2">
      {props.columns.length === 0 && <OAuthNote />}
      <MatrixGrid {...props} />
    </section>
  );
}
