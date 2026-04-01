/**
 * Stable Quill hook for React 19.
 *
 * The upstream `react-quilljs` useQuill hook has a useEffect that depends on
 * its own state (`obj`) which it also sets inside the effect, causing an
 * infinite render loop under React 19's stricter compiler. This replacement
 * initialises Quill exactly once via refs so no state‑driven loop can occur.
 *
 * Quill is dynamically imported so it never runs during SSR (it accesses
 * `document` at module scope).
 */
import type QuillType from 'quill';
import { useEffect, useRef, useState } from 'react';

interface UseQuillStableOptions {
  modules?: Record<string, unknown>;
  placeholder?: string;
  theme?: string;
  formats?: string[];
}

interface UseQuillStableReturn {
  quill: QuillType | null;
  quillRef: React.RefObject<HTMLDivElement | null>;
}

export function useQuillStable(options: UseQuillStableOptions = {}): UseQuillStableReturn {
  const quillRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<QuillType | null>(null);
  const [quill, setQuill] = useState<QuillType | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (instanceRef.current || !quillRef.current) return;

    const init = async () => {
      // Dynamic import keeps Quill out of the SSR bundle
      const { default: Quill } = await import('quill');
      if (instanceRef.current || !quillRef.current) return;

      const opts = optionsRef.current;
      const q = new Quill(quillRef.current, {
        modules: opts.modules ?? { toolbar: false },
        placeholder: opts.placeholder ?? '',
        theme: opts.theme ?? 'snow',
        formats: opts.formats,
      });

      instanceRef.current = q;
      setQuill(q);
    };

    init();
  }, []);

  return { quill, quillRef };
}
