/**
 * The compact composition: a bell trigger and its portalled panel.
 *
 * The bell is not a second controller. It reads the same snapshot and calls the
 * same actions as the feed, so the badge, the list and every mutation agree even
 * when both layouts live under one provider. What belongs to the UI layer stays
 * here: the open value comes from the provider, the panel is portalled out of
 * clipping ancestors, its position follows the anchor on scroll and resize, and
 * Escape restores focus to the trigger while a click elsewhere never steals it.
 *
 * Reopening asks the controller for a fresh first page. Closing only hides the
 * panel; the provider keeps its lifecycle and its subscription.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ComponentPropsWithRef, JSX } from 'react';
import { createPortal } from 'react-dom';
import {
  REDUCED_MOTION_QUERY,
  observeAvailableArea,
  restoreFocus,
} from '@nickkupriyanov/inboxline-core/dom';
import type { AvailableArea } from '@nickkupriyanov/inboxline-core/dom';
import { useClassNames, useInboxComponents, useInboxFlow, useInboxUI } from './context';
import { useMediaQuery } from './hooks/useMediaQuery';
import type { SlotProps } from './parts';
import { InboxSurface } from './components/InboxSurface';
import { BellIcon } from './components/icons';
import { placeInboxPanel } from './components/panelPlacement';
import type { InboxPanelPlacement } from './components/panelPlacement';

/** How long the panel stays mounted for its exit. Mirrors `--il-duration`. */
const PANEL_EXIT_DURATION = 240;

/** The bell and the non-modal dialog it opens. */
export function InboxBell(): JSX.Element {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();
  const cls = useClassNames();
  const { Trigger } = useInboxComponents();
  const view = snapshot.view;
  const open = ui.open;
  const { setOpen } = ui;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const openFromTriggerRef = useRef(false);
  const wasOpenRef = useRef(open);
  const lastOpenRef = useRef(open);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [placement, setPlacement] = useState<InboxPanelPlacement | null>(null);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const panelId = `il-panel-${useId().replace(/:/g, '')}`;

  // The portalled panel exists only in a browser. Rendering it conditionally
  // after mounting keeps a server render and its first client render identical.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track the anchor while the panel is open. The observer reports the first
  // measurement synchronously and then only actual changes, so scrolling a
  // nested container or resizing the window re-places the panel. The last
  // placement is kept through the exit, so the closing card stays where it was
  // rather than jumping to the corner for its last frame.
  useEffect(() => {
    if (!open) return undefined;

    return observeAvailableArea(triggerRef.current, (area: AvailableArea | null) => {
      setPlacement(area === null ? null : placeInboxPanel(area));
    });
  }, [open]);

  // Closing keeps the panel mounted for its exit and marks it inert immediately;
  // opening during that window cancels the exit rather than stacking a second
  // card. Under reduced motion nothing is held at all.
  useEffect(() => {
    const clearExit = (): void => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    };

    if (open) {
      clearExit();
      lastOpenRef.current = true;
      setExitPending(false);
      return;
    }

    if (reducedMotion) {
      clearExit();
      lastOpenRef.current = false;
      setExitPending(false);
      return;
    }

    if (!lastOpenRef.current) return;
    lastOpenRef.current = false;

    // A controlled close can happen while focus is inline: the panel is about to
    // leave the interaction tree, so focus goes back to the anchor rather than
    // staying in an inert element.
    const panel = panelRef.current;
    if (panel !== null && panel.contains(document.activeElement)) {
      restoreFocus(triggerRef.current);
    }

    setExitPending(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      setExitPending(false);
    }, PANEL_EXIT_DURATION);
  }, [open, reducedMotion]);

  // A timer still pending when the bell goes away must not fire into an unmounted
  // component.
  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
    },
    [],
  );

  // Opening from the trigger moves focus into the dialog so assistive
  // technology announces its title. An open value changed by the application
  // does not move focus on its own.
  useEffect(() => {
    if (!open || !openFromTriggerRef.current) return;
    const panel = panelRef.current;
    if (panel === null) return;
    openFromTriggerRef.current = false;
    panel.focus({ preventScroll: true });
  }, [open, placement]);

  // A reopen verifies the data. The first render is skipped because the
  // provider has just started its own first load.
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) void actions.refresh();
  }, [open, actions]);

  // Escape closes and returns focus to the trigger. A pointer outside closes
  // without touching focus, so the element the visitor clicked keeps it.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      const active = document.activeElement;
      const shouldRestore =
        trigger !== null && (panel?.contains(active) === true || active === trigger);
      setOpen(false);
      if (shouldRestore) restoreFocus(trigger);
    };

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, setOpen]);

  function handleTrigger(): void {
    if (open) {
      setOpen(false);
      return;
    }
    openFromTriggerRef.current = true;
    setOpen(true);
  }

  function handleClose(): void {
    const panel = panelRef.current;
    const shouldRestore = panel !== null && panel.contains(document.activeElement);
    setOpen(false);
    if (shouldRestore) restoreFocus(triggerRef.current);
  }

  const counterLabel = view.counter.known ? view.counter.label : ui.messages.countUnknownLabel;
  const triggerLabel = `${ui.messages.listLabel}. ${counterLabel}`;
  const badgeCount = view.counter.unreadCount;

  const triggerProps: SlotProps<ComponentPropsWithRef<'button'>> = {
    type: 'button',
    ref: triggerRef,
    className: cls('trigger'),
    'aria-label': triggerLabel,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
    onClick: handleTrigger,
  };

  const panelStyle: CSSProperties | null =
    placement === null
      ? null
      : {
          position: 'fixed',
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          ...(placement.top === null ? { bottom: placement.bottom ?? 0 } : { top: placement.top }),
        };

  const closing = !open && (exitPending || (lastOpenRef.current && !reducedMotion));
  const exitDurationMs = reducedMotion ? 0 : PANEL_EXIT_DURATION;

  return (
    <div className={cls('bell', ui.className)} data-il-theme={ui.theme}>
      <Trigger open={open} unreadCount={badgeCount} label={triggerLabel} slotProps={triggerProps}>
        <BellIcon />
        {badgeCount !== null && badgeCount > 0 ? (
          <span className={cls('badge')} aria-hidden="true">
            {badgeCount}
          </span>
        ) : null}
      </Trigger>

      {(open || closing) && mounted && panelStyle !== null
        ? createPortal(
            <InboxSurface
              layout="popover"
              id={panelId}
              rootRef={panelRef}
              style={panelStyle}
              side={placement?.side}
              closing={closing}
              exitDurationMs={exitDurationMs}
              onClose={handleClose}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
