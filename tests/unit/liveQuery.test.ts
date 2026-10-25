import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Next = (snap: unknown) => void;
type Fail = (error: { code: string }) => void;
const listeners: { next: Next; fail: Fail; unsubscribe: ReturnType<typeof vi.fn> }[] = [];

vi.mock('firebase/firestore', () => ({
  onSnapshot: (_q: unknown, _opts: unknown, next: Next, fail: Fail) => {
    const unsubscribe = vi.fn();
    listeners.push({ next, fail, unsubscribe });
    return unsubscribe;
  },
}));

const { disposeAllLiveQueries, INDEX_RETRY_DELAYS_MS, useLiveCollection } = await import('@/lib/firestore/liveQuery');

const snapshot = (ids: string[]) => ({
  docs: ids.map((id) => ({ id })),
  metadata: { fromCache: false, hasPendingWrites: false },
});

describe('useLiveCollection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.length = 0;
  });
  afterEach(() => {
    disposeAllLiveQueries();
    vi.useRealTimers();
  });

  it('restarts the listener while a composite index is building, then recovers', () => {
    const { result } = renderHook(() => useLiveCollection('k/building', () => ({}) as never, (d) => d.id));
    expect(listeners).toHaveLength(1);

    act(() => listeners[0]!.fail({ code: 'failed-precondition' }));
    expect(result.current.error?.code).toBe('failed-precondition');
    expect(result.current.loading).toBe(false);

    act(() => vi.advanceTimersByTime(INDEX_RETRY_DELAYS_MS[0]!));
    expect(listeners[0]!.unsubscribe).toHaveBeenCalled();
    expect(listeners).toHaveLength(2);

    act(() => listeners[1]!.next(snapshot(['t1', 't2'])));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(['t1', 't2']);
  });

  it('does not retry other errors such as permission-denied', () => {
    const { result } = renderHook(() => useLiveCollection('k/denied', () => ({}) as never, (d) => d.id));
    act(() => listeners[0]!.fail({ code: 'permission-denied' }));
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(listeners).toHaveLength(1);
    expect(result.current.error?.code).toBe('permission-denied');
  });

  it('cancels a pending retry on sign-out', () => {
    renderHook(() => useLiveCollection('k/dispose', () => ({}) as never, (d) => d.id));
    act(() => listeners[0]!.fail({ code: 'failed-precondition' }));
    disposeAllLiveQueries();
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(listeners).toHaveLength(1);
  });
});
