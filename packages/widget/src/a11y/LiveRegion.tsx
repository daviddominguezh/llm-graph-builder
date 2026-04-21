import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 400;

export function LiveRegion({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  const pending = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pending.current = text;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDisplayed(pending.current);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [text]);

  return (
    <div aria-live="polite" className="sr-only">
      {displayed}
    </div>
  );
}
