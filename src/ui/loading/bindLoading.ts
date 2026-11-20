import type { LoadingController } from './LoadingController';

/** Only view events. This adapter never reads a match or decides when data is ready. */
export interface LoadingEvents {
  on(event: string, fn: (...args: any[]) => void): unknown;
  off(event: string, fn: (...args: any[]) => void): unknown;
}
export function bindLoading(events: LoadingEvents, loading: LoadingController): () => void {
  const progress = (p: number) => loading.setProgress(p);
  const ready = () => { loading.completeStartup(); loading.endTransition(); };
  const transition = () => loading.beginTransition();
  const destroy = () => { unbind(); loading.destroy(); };
  const handlers = [['rtd:loading-progress', progress], ['rtd:title-ready', ready], ['rtd:game-ready', ready], ['rtd:scene-loading', transition], ['destroy', destroy]] as const;
  const unbind = (): void => { for (const [event, fn] of handlers) events.off(event, fn); };
  for (const [event, fn] of handlers) events.on(event, fn);
  return unbind;
}
