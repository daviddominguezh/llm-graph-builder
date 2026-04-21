'use client';

import type { Operation } from '@daviddh/graph-types';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';

import type { SkillEntry } from './AddSkillDialog';

type SetSkills = Dispatch<SetStateAction<SkillEntry[]>>;
type PushOperation = (op: Operation) => void;

function useAddSkillsAction(setSkills: SetSkills, push: PushOperation): (entries: SkillEntry[]) => void {
  return useCallback(
    (entries: SkillEntry[]) => {
      setSkills((prev) => {
        const existing = new Set(prev.map((s) => s.name));
        const fresh = entries.filter((e) => !existing.has(e.name));
        const { length: baseIndex } = prev;
        fresh.forEach((entry, i) => {
          push({
            type: 'insertSkill',
            data: { ...entry, sortOrder: baseIndex + i },
          });
        });
        return [...prev, ...fresh];
      });
    },
    [setSkills, push]
  );
}

function useDeleteSkillAction(setSkills: SetSkills, push: PushOperation): (name: string) => void {
  return useCallback(
    (name: string) => {
      setSkills((prev) => prev.filter((s) => s.name !== name));
      push({ type: 'deleteSkill', data: { name } });
    },
    [setSkills, push]
  );
}

function useDeleteManySkillsAction(setSkills: SetSkills, push: PushOperation): (names: string[]) => void {
  return useCallback(
    (names: string[]) => {
      const toRemove = new Set(names);
      setSkills((prev) => prev.filter((s) => !toRemove.has(s.name)));
      push({ type: 'deleteManySkills', data: { names } });
    },
    [setSkills, push]
  );
}

interface SkillActions {
  handleAddSkills: (entries: SkillEntry[]) => void;
  handleDeleteSkill: (name: string) => void;
  handleDeleteManySkills: (names: string[]) => void;
}

export function useSkillActions(setSkills: SetSkills, pushOperation: PushOperation): SkillActions {
  return {
    handleAddSkills: useAddSkillsAction(setSkills, pushOperation),
    handleDeleteSkill: useDeleteSkillAction(setSkills, pushOperation),
    handleDeleteManySkills: useDeleteManySkillsAction(setSkills, pushOperation),
  };
}
