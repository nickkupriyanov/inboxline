/**
 * The default filter group.
 *
 * The group role, its accessible name, the slot class and every button's
 * pressed state, handler and ref arrive prepared. The part only draws the
 * buttons, so a replacement cannot accidentally turn the filters into a
 * client-side selection or lose the keyboard behaviour.
 */
import type { JSX } from 'react';
import type { FiltersPartProps } from '../parts';

/** The default “All” / “Unread” group. */
export function Filters({ slotProps, options }: FiltersPartProps): JSX.Element {
  return (
    <div {...slotProps}>
      {options.map((option) => (
        <button key={option.value} {...option.props}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
