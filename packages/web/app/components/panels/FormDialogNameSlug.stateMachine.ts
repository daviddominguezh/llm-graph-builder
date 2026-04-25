export type SlugPhase = 'idle' | 'invalid-format' | 'checking' | 'unique' | 'taken-pending' | 'taken';

export interface SlugUxState {
  phase: SlugPhase;
  slug: string;
}

export type SlugUxAction =
  | { type: 'INPUT_CHANGED'; slug: string }
  | { type: 'UNIQ_RESULT'; unique: boolean }
  | { type: 'BLUR' };

const FORMAT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/v;

export function initialSlugUx(): SlugUxState {
  return { phase: 'idle', slug: '' };
}

export function slugUxReducer(state: SlugUxState, action: SlugUxAction): SlugUxState {
  switch (action.type) {
    case 'INPUT_CHANGED': {
      if (action.slug === '') return { phase: 'idle', slug: '' };
      if (!FORMAT_RE.test(action.slug)) return { phase: 'invalid-format', slug: action.slug };
      return { phase: 'checking', slug: action.slug };
    }
    case 'UNIQ_RESULT': {
      return { phase: action.unique ? 'unique' : 'taken-pending', slug: state.slug };
    }
    case 'BLUR': {
      return state.phase === 'taken-pending' ? { ...state, phase: 'taken' } : state;
    }
  }
}
