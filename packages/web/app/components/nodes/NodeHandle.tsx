import { Handle, Position } from '@xyflow/react';
import { Plus } from 'lucide-react';

import { HANDLE_COLOR, HANDLE_HEIGHT, HANDLE_WIDTH } from './HandleContent';

// Hit area (transparent) — larger than the visible dot so clicking/hovering the
// handle does not require pixel precision. Interactive (source) handles get a
// bigger target than passive (target) handles, which would otherwise eat clicks
// meant for the node body near its edge.
const HIT_SIZE_INTERACTIVE = 22;
const HIT_SIZE_PASSIVE = 14;

interface NodeHandleProps {
  type: 'source' | 'target';
  position: Position;
  id: string;
  isFromInnerOption?: boolean;
  interactive?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

// The resting pill pokes outward from the node edge; on hover it slides to
// straddle the edge (half in / half out). Direction depends on which edge it is on.
function restTranslate(position: Position): string {
  return position === Position.Left
    ? '-translate-x-[calc(var(--handle-w)/2)]'
    : 'translate-x-[calc(var(--handle-w)/2)]';
}

function buildHitStyle(hitSize: number, disabled: boolean, interactive: boolean): React.CSSProperties {
  return {
    width: `${hitSize}px`,
    height: `${hitSize}px`,
    zIndex: 10,
    pointerEvents: disabled ? 'none' : 'auto',
    cursor: interactive ? 'pointer' : 'default',
  };
}

export function NodeHandle({
  type,
  position,
  id,
  interactive = false,
  readOnly = false,
  hidden = false,
  isFromInnerOption = false,
  onClick,
  onMouseDown,
}: NodeHandleProps): React.JSX.Element {
  const disabled = readOnly || hidden;
  const hitStyle = buildHitStyle(
    interactive ? HIT_SIZE_INTERACTIVE : HIT_SIZE_PASSIVE,
    disabled,
    interactive
  );

  // Only width + position animate; the dot stays fully rounded so the resting
  // pill (HANDLE_WIDTH x HANDLE_HEIGHT) becomes a HANDLE_HEIGHT circle by widening.
  const dotStyle = {
    '--handle-w': `${HANDLE_WIDTH}px`,
    '--handle-h': `${HANDLE_HEIGHT}px`,
    backgroundColor: HANDLE_COLOR,
    opacity: hidden ? 0 : 1,
  } as React.CSSProperties;

  const dotClass =
    'block rounded-full transition-all duration-200 ease-out ' +
    'h-[var(--handle-h)] w-[var(--handle-w)] ' +
    `${restTranslate(position)} group-hover/nh:w-[var(--handle-h)] group-hover/nh:translate-x-0`;

  return (
    <Handle
      type={type}
      position={position}
      id={id}
      onClick={interactive ? onClick : undefined}
      onMouseDown={interactive ? onMouseDown : undefined}
      className={`group/nh flex items-center justify-center !rounded-none !border-0 !bg-transparent ${isFromInnerOption ? '-right-[calc(0px+calc(var(--spacing)*2))]!' : ''}`}
      style={hitStyle}
    >
      <span className={dotClass} style={dotStyle} />
      {type === 'source' && !disabled && (
        <Plus className="pointer-events-none absolute left-1/2 top-1/2 size-[10px] -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity duration-200 group-hover/nh:opacity-100" />
      )}
    </Handle>
  );
}
