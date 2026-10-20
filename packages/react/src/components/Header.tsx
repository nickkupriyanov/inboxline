/**
 * The default card header.
 *
 * `slotProps`, `headingProps`, `filters` and `close` are fully prepared by the
 * surface. The header only decides where the title, the filters and the close
 * action sit; keeping `headingProps` on the heading is what keeps the popover
 * dialog labelled.
 */
import type { JSX } from 'react';
import type { HeaderPartProps } from '../parts';

/** The default header row. */
export function Header({
  title,
  headingProps,
  slotProps,
  filters,
  close,
}: HeaderPartProps): JSX.Element {
  return (
    <header {...slotProps}>
      <h2 {...headingProps}>{title}</h2>
      {filters}
      {close}
    </header>
  );
}
