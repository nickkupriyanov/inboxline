/**
 * The rows a list is holding on to while they leave the unread selection.
 *
 * A row removed by the reducer has no exit: the element is gone before anything
 * can animate. This hook is the other half — it keeps the snapshot of a row the
 * visitor just marked read for the length of the exit, so the CSS or Motion kit
 * can fade and collapse it while the rows below close the gap only once it is
 * unmounted.
 *
 * Only a removal the visitor asked for is held: the surface calls `markLeaving`
 * from the read and activate handlers, so a filter change, a page replacement,
 * a refresh or “mark all as read” stay instant instead of playing a cascade of
 * individual exits. The mark is a request, not a fact: a removal the controller
 * refused (the row came back) simply leaves the ghost out of the rendered list,
 * and the mark expires after the exit window — a much later, unrelated update
 * that drops the same row must not replay an animation for a click from the past.
 *
 * The duration is reported as well as used, so the caller writes one number into
 * the row (`--il-exit-duration`) and runs the unmount timer with the same one.
 * Under `prefers-reduced-motion: reduce` nothing is held at all: the row leaves
 * at once, which is what “no animation” has to mean.
 *
 * The hook is deliberately internal: a consumer changes the exit by replacing the
 * animation kit, never by keeping rows alive here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { REDUCED_MOTION_QUERY } from '@nickkupriyanov/inboxline-core/dom';
import { useMediaQuery } from './useMediaQuery';

/** How long a row takes to leave, in milliseconds. Mirrors `--il-duration`. */
export const ROW_EXIT_DURATION = 240;

/** A row held for its exit, with the place it occupied when it was marked. */
export interface LeavingRow<T> {
  /** The row as it was when it left: the unread snapshot, never a live object. */
  item: T;
  /** The day group it was rendered in. */
  groupKey: string;
  /** That group's visible label, kept for a group that empties out entirely. */
  groupLabel: string;
  /** Its index inside the group, so it leaves from where it stood. */
  groupIndex: number;
}

export interface ExitingRows<T> {
  /** The rows that are on their way out; the caller filters out rows that returned. */
  exiting: readonly LeavingRow<T>[];
  /** Asks for this row to leave with the transition rather than at once. */
  markLeaving(row: LeavingRow<T>): void;
  /** The length of the exit, in milliseconds. */
  exitDurationMs: number;
}

/**
 * Holds marked rows for one exit window.
 *
 * `resetKey` identifies the selection the rows belong to — the filter and the
 * context. When it changes, marks from the previous selection are ignored, so a
 * filter switch during an exit never leaves a stale row behind.
 */
export function useExitingRows<T extends { id: string }>(resetKey: string): ExitingRows<T> {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const [held, setHeld] = useState<readonly (LeavingRow<T> & { resetKey: string })[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const forget = useCallback((id: string): void => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const markLeaving = useCallback(
    (row: LeavingRow<T>): void => {
      if (reduced) return;
      forget(row.item.id);
      setHeld((current) => [
        ...current.filter((candidate) => candidate.item.id !== row.item.id),
        { ...row, resetKey },
      ]);
      timers.current.set(
        row.item.id,
        setTimeout(() => {
          timers.current.delete(row.item.id);
          setHeld((current) => current.filter((candidate) => candidate.item.id !== row.item.id));
        }, ROW_EXIT_DURATION),
      );
    },
    [forget, reduced, resetKey],
  );

  // Marks still pending when the widget goes away must not keep timers alive.
  useEffect(
    () => () => {
      for (const id of [...timers.current.keys()]) forget(id);
    },
    [forget],
  );

  return {
    exiting: held.filter((row) => row.resetKey === resetKey),
    markLeaving,
    exitDurationMs: ROW_EXIT_DURATION,
  };
}
