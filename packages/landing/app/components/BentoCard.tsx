'use client';

import { Maximize2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

const CARD_SHADOW = 'shadow-[0_6px_12px_-2px_rgba(50,50,93,0.12),0_3px_7px_-3px_rgba(0,0,0,0.06)]';

type BentoCardProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
};

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#061b31]/50 p-6"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-1 text-[#425466] transition-colors hover:bg-[#061b31]/5"
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`modular-solutions-bento-card group relative block w-full cursor-pointer overflow-hidden rounded-lg bg-white p-8 text-left transition-transform duration-200 hover:scale-[1.008] ${CARD_SHADOW} ${className}`}
      >
        <span className="absolute top-5 right-5 rounded-full p-2 text-[#533afd]/60 transition-colors duration-200 group-hover:bg-[#533afd] group-hover:text-white">
          <Maximize2 className="h-4 w-4" />
        </span>
        <h3 className="max-w-[320px] text-xl font-medium leading-snug text-[#061b31]">{title}</h3>
        {description !== undefined && (
          <p className="mt-2 text-sm leading-relaxed text-[#425466]">{description}</p>
        )}
        {children}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h3 className="pr-8 text-2xl font-medium leading-snug text-[#061b31]">{title}</h3>
          {description !== undefined && (
            <p className="mt-3 text-base leading-relaxed text-[#425466]">{description}</p>
          )}
          {children}
        </Modal>
      )}
    </>
  );
}
