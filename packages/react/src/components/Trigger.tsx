/**
 * The default bell trigger.
 *
 * The button itself is prepared by the bell: the class, the accessible name, the
 * dialog relationships, the click and the ref all arrive in `slotProps`. The
 * part only draws the default glyph and badge so an application can replace it
 * without re-implementing any of that behaviour.
 */
import type { JSX } from 'react';
import type { TriggerPartProps } from '../parts';

/** The default trigger: one native button around the prepared content. */
export function Trigger({ slotProps, children }: TriggerPartProps): JSX.Element {
  return <button {...slotProps}>{children}</button>;
}
