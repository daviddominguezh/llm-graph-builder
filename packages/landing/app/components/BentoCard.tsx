'use client';

import { X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

// The reference's expand affordance, copied verbatim: a 38x38 box at top/right
// 16px wrapping a 20x20 two-path corner-expand SVG. Rest = lavender square +
// #533afd icon; hover = #533afd square + white icon (0.6s ease).
function DialogEntryIcon() {
  return (
    <div className="modular-solutions-bento-card__dialog-entry absolute top-4 right-4 z-[3] h-[38px] w-[38px]">
      <div className="modular-solutions-bento-card__dialog-entry-wrapper flex h-[38px] w-[38px] items-center justify-center rounded-[4px] bg-white/10 text-white/70 transition-colors duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:bg-[#533afd] group-hover:text-white">
        {/* On hover the two corners spread apart (top-right +2,-2;
            bottom-left -2,+2) over 0.6s — the reference's expand animation. */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            className="transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[transform:translate(2px,-2px)]"
            d="M13.75 6.75L10.25 6.75L10.25 5L15.5 5L15.5 10.25L13.75 10.25L13.75 6.75Z"
            fill="currentColor"
          />
          <path
            className="transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[transform:translate(-2px,2px)]"
            d="M6.75 10.25L5 10.25L5 15.5L10.25 15.5L10.25 13.75L6.75 13.75L6.75 10.25Z"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  );
}

type BentoCardProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
};

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        data-lenis-prevent
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[#141519] p-10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-1 text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

// Card that grows on hover and expands into a modal on click.
export function BentoCard({ title, description, children, className = '' }: BentoCardProps) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);

  // Beam follow: the color-gradient blob translates so its center tracks the
  // cursor over the card (reference uses transform + 1s ease). We write the
  // offset to CSS vars the beam element consumes.
  const onMouseMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--beam-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--beam-y', `${event.clientY - rect.top}px`);
  };

  return (
    <>
      {/* Reference card anatomy (exact): a transparent sizing box holding
          stacked layers — a #e5edf5 border layer overhanging by -5px, a white
          inner fill inset -4px, and the content at inset 0. Border/inner are
          clipped to a ~1px ring at rest and animate open on hover (frame grows
          outward, 0.8s). Inside the border sits the color-gradient beam that
          follows the cursor and is revealed as the frame opens. */}
      <button
        ref={cardRef}
        type="button"
        onClick={() => setOpen(true)}
        onMouseMove={onMouseMove}
        className={`modular-solutions-bento-card group relative block w-full cursor-pointer text-left [--beam-x:50%] [--beam-y:50%] hover:z-[3] ${className}`}
      >
        <span
          aria-hidden="true"
          className="modular-solutions-bento-card__border pointer-events-none absolute -inset-[5px] overflow-hidden bg-white/10 transition-[clip-path] duration-[800ms] ease-[cubic-bezier(0.165,0.84,0.44,1)] [clip-path:inset(4px_4.8284px_round_16px)] group-hover:[clip-path:inset(0px_round_16px)]"
        >
          {/* 753px radial-gradient beam, opacity 0.5, centered on the cursor
              and gliding to it over 1s — the moving border glow. Positioned
              via transform (not left/top) so the 1s ease applies. */}
          <span
            className="modular-solutions-bento-card__border-color-gradient absolute top-0 left-0 h-[753px] w-[753px] rounded-full opacity-0 group-hover:opacity-50 [background:radial-gradient(circle,#7f7dfc,#f44bcc_33%,transparent_66%)]"
            style={{
              transform: 'translate(var(--beam-x), var(--beam-y)) translate(-50%, -50%)',
              transition: 'transform 1s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease',
            }}
          />
        </span>
        <span
          aria-hidden="true"
          className="modular-solutions-bento-card__inner pointer-events-none absolute -inset-[4px] bg-black transition-[clip-path] duration-[800ms] ease-[cubic-bezier(0.165,0.84,0.44,1)] [clip-path:inset(4px_4.8284px_round_15px)] group-hover:[clip-path:inset(0px_round_15px)]"
        />
        <div className="modular-solutions-bento-card__content relative isolate flex h-full flex-col overflow-hidden rounded-[15px] p-6">
          <DialogEntryIcon />
          {title !== undefined && (
            <h3 className="pr-9 text-[26px] font-light leading-[1.12] tracking-[-0.01em] text-white">
              {title}
            </h3>
          )}
          {description !== undefined && (
            <p className="mt-2 text-sm leading-relaxed text-white/60">{description}</p>
          )}
          {children}
        </div>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          {title !== undefined && (
            <h3 className="pr-8 text-[26px] font-light leading-[1.12] tracking-[-0.01em] text-white">
              {title}
            </h3>
          )}
          {description !== undefined && (
            <p className="mt-3 text-base leading-relaxed text-white/60">{description}</p>
          )}
          {children}
        </Modal>
      )}
    </>
  );
}
