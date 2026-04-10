import {
  type CompositionEvent,
  type CompositionState,
  INITIAL_STATE,
  transition,
} from './compositionMachine';

export class CompositionStore {
  private state: CompositionState = INITIAL_STATE;
  private listeners = new Set<() => void>();

  dispatch(event: CompositionEvent): void {
    this.state = transition(this.state, event);
    this.listeners.forEach((fn) => fn());
  }

  // Arrow functions for stable references (required by useSyncExternalStore)
  getSnapshot = (): CompositionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
