'use client';

import { useQuillStable } from '@/app/components/messages/domains/message/components/MessageInput/useQuillStable';
import type QuillType from 'quill';
import { useEffect, useMemo, useRef } from 'react';

import { htmlToMd, mdToHtml } from './mdHtml';

const DEBOUNCE_MS = 500;
const FORMATS = ['bold', 'italic', 'strike', 'header', 'list', 'blockquote', 'code', 'code-block', 'link'];

interface BoolRef {
  current: boolean;
}
interface StrRef {
  current: string;
}
interface FnRef {
  current: (v: string) => void;
}
interface TimerRef {
  current: ReturnType<typeof setTimeout> | null;
}

interface Args {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function writeMdToQuill(quill: QuillType, md: string): void {
  const active = document.activeElement;
  const quillHadFocus = active !== null && quill.container.contains(active);
  const toRestore = !quillHadFocus && active instanceof HTMLElement ? active : null;

  if (md === '') {
    quill.setText('');
  } else {
    quill.clipboard.dangerouslyPasteHTML(mdToHtml(md));
  }

  if (toRestore !== null)
    setTimeout(() => {
      toRestore.focus();
    }, 0);
}

function useExternalToQuill(
  quill: QuillType | null,
  value: string,
  isSyncingRef: BoolRef,
  lastEmittedRef: StrRef
): void {
  useEffect(() => {
    if (!quill) return;
    if (value === lastEmittedRef.current) return;
    const currentMd = htmlToMd(quill.root.innerHTML);
    if (currentMd === value) return;
    isSyncingRef.current = true;
    writeMdToQuill(quill, value);
    const t = setTimeout(() => {
      isSyncingRef.current = false;
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, [quill, value, isSyncingRef, lastEmittedRef]);
}

function handleTextChange(
  quill: QuillType,
  onChangeRef: FnRef,
  isSyncingRef: BoolRef,
  lastEmittedRef: StrRef,
  timerRef: TimerRef
): void {
  if (isSyncingRef.current) return;
  if (timerRef.current !== null) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    const md = htmlToMd(quill.root.innerHTML);
    lastEmittedRef.current = md;
    onChangeRef.current(md);
  }, DEBOUNCE_MS);
}

function useQuillToExternal(
  quill: QuillType | null,
  onChangeRef: FnRef,
  isSyncingRef: BoolRef,
  lastEmittedRef: StrRef
): void {
  useEffect(() => {
    if (!quill) return;
    const timerRef: TimerRef = { current: null };
    const handler = () => {
      handleTextChange(quill, onChangeRef, isSyncingRef, lastEmittedRef, timerRef);
    };
    quill.on('text-change', handler);
    return () => {
      quill.off('text-change', handler);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [quill, onChangeRef, isSyncingRef, lastEmittedRef]);
}

export function useSystemPromptQuill({ value, onChange, placeholder }: Args) {
  const modules = useMemo(() => ({ toolbar: false }), []);
  const { quill, quillRef } = useQuillStable({ modules, placeholder, theme: 'snow', formats: FORMATS });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const isSyncingRef = useRef(false);
  const lastEmittedRef = useRef<string>('');
  useExternalToQuill(quill, value, isSyncingRef, lastEmittedRef);
  useQuillToExternal(quill, onChangeRef, isSyncingRef, lastEmittedRef);
  return { quill, quillRef };
}
