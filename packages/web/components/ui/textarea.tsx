import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ref: externalRef, ...props }: React.ComponentProps<'textarea'>) {
  const setRef: React.RefCallback<HTMLTextAreaElement> = (el) => {
    if (el) {
      const beforeAttrs = {
        overlayscrollbars: el.getAttribute('data-overlayscrollbars'),
        initialize: el.getAttribute('data-overlayscrollbars-initialize'),
      };
      el.removeAttribute('data-overlayscrollbars');
      el.removeAttribute('data-overlayscrollbars-initialize');

      requestAnimationFrame(() => {
        const cs = getComputedStyle(el);
        // eslint-disable-next-line no-console
        console.log('[Textarea diagnostics]', {
          id: el.id || '(no-id)',
          beforeAttrs,
          afterAttrs: {
            overlayscrollbars: el.getAttribute('data-overlayscrollbars'),
            initialize: el.getAttribute('data-overlayscrollbars-initialize'),
          },
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowing: el.scrollHeight > el.clientHeight,
          computed: {
            overflowY: cs.overflowY,
            overflowX: cs.overflowX,
            scrollbarWidth: cs.scrollbarWidth,
            scrollbarColor: cs.scrollbarColor,
            fieldSizing: cs.getPropertyValue('field-sizing'),
            height: cs.height,
            maxHeight: cs.maxHeight,
          },
        });
      });
    }
    if (typeof externalRef === 'function') externalRef(el);
    else if (externalRef) externalRef.current = el;
  };

  return (
    <textarea
      ref={setRef}
      data-slot="textarea"
      className={cn(
        'border-transparent bg-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 resize-none rounded-md border px-2 py-2 text-sm transition-colors focus-visible:ring-[2px] aria-invalid:ring-[2px] md:text-xs/relaxed placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
