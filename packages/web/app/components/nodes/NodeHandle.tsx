import { Handle, Position } from '@xyflow/react';
import { Plus } from 'lucide-react';

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
  interactive?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

// The resting pill pokes outward from the node edge; on hover it slides to
// straddle the edge (half in / half out). Direction depends on which edge it is on.
function restTranslate(position: Position): string {
  return position === Position.Left ? '-translate-x-[3px]' : 'translate-x-[3px]';
}

function buildHitStyle(hitSize: number, disabled: boolean): React.CSSProperties {
  return {
    width: `${hitSize}px`,
    height: `${hitSize}px`,
    zIndex: 10,
    pointerEvents: disabled ? 'none' : 'auto',
  };
}

export function NodeHandle({
  type,
  position,
  id,
  interactive = false,
  readOnly = false,
  hidden = false,
  onClick,
  onMouseDown,
}: NodeHandleProps): React.JSX.Element {
  const disabled = readOnly || hidden;
  const hitStyle = buildHitStyle(interactive ? HIT_SIZE_INTERACTIVE : HIT_SIZE_PASSIVE, disabled);

  // Only width + translateX animate; the dot stays fully rounded so a 6x15 pill
  // becomes a 15x15 circle purely by widening.
  const dotClass =
    'block h-[15px] w-[6px] rounded-full bg-primary transition-[width,transform] duration-200 ease-out ' +
    `${restTranslate(position)} group-hover/nh:w-[15px] group-hover/nh:translate-x-0`;

  return (
    <Handle
      type={type}
      position={position}
      id={id}
      onClick={interactive ? onClick : undefined}
      onMouseDown={interactive ? onMouseDown : undefined}
      className="group/nh flex items-center justify-center !rounded-none !border-0 !bg-transparent"
      style={hitStyle}
    >
      <span className={dotClass} style={{ opacity: hidden ? 0 : 1 }} />
      {interactive && (
        <Plus className="absolute size-[10px] text-primary-foreground opacity-0 transition-opacity duration-200 group-hover/nh:opacity-100" />
      )}
    </Handle>
  );
}
