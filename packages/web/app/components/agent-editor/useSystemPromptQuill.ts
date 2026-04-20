'use client';

import { useQuillStable } from '@/app/components/messages/domains/message/components/MessageInput/useQuillStable';
import type QuillType from 'quill';
import { useEffect, useMemo, useRef } from 'react';

import { htmlToMd, mdToHtml } from './mdHtml';

const DEBOUNCE_MS = 500;
const FORMATS = ['bold', 'italic', 'strike', 'header', 'list', 'blockquote', 'code', 'code-block', 'link'];

type BoolRef = { current: boolean };
type FnRef = { current: (v: string) => void };
type TimerRef = { current: ReturnType<typeof setTimeout> | null };

interface Args {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function writeMdToQuill(quill: QuillType, md: string): void {
  if (md === '') {
    quill.setText('');
    return;
  }
  quill.clipboard.dangerouslyPasteHTML(mdToHtml(md));
}

function useExternalToQuill(quill: QuillType | null, value: string, isSyncingRef: BoolRef): void {
  useEffect(() => {
    if (!quill) return;
    const currentMd = htmlToMd(quill.root.innerHTML);
    if (currentMd === value) return;
    isSyncingRef.current = true;
    writeMdToQuill(quill, value);
    const t = setTimeout(() => {
      isSyncingRef.current = false;
    }, 0);
    return () => clearTimeout(t);
  }, [quill, value, isSyncingRef]);
}

function handleTextChange(
  quill: QuillType,
  onChangeRef: FnRef,
  isSyncingRef: BoolRef,
  timerRef: TimerRef
): void {
  if (isSyncingRef.current) return;
  if (timerRef.current !== null) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    onChangeRef.current(htmlToMd(quill.root.innerHTML));
  }, DEBOUNCE_MS);
}

function useQuillToExternal(quill: QuillType | null, onChangeRef: FnRef, isSyncingRef: BoolRef): void {
  useEffect(() => {
    if (!quill) return;
    const timerRef: TimerRef = { current: null };
    const handler = () => handleTextChange(quill, onChangeRef, isSyncingRef, timerRef);
    quill.on('text-change', handler);
    return () => {
      quill.off('text-change', handler);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [quill, onChangeRef, isSyncingRef]);
}

export function useSystemPromptQuill({ value, onChange, placeholder }: Args) {
  const modules = useMemo(() => ({ toolbar: false }), []);
  const { quill, quillRef } = useQuillStable({ modules, placeholder, theme: 'snow', formats: FORMATS });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const isSyncingRef = useRef(false);
  useExternalToQuill(quill, value, isSyncingRef);
  useQuillToExternal(quill, onChangeRef, isSyncingRef);
  return { quill, quillRef };
}
