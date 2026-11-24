// The project's custom colors (Project.theme) as preview CSS variables. Every skin reads the
// same --k-* variables (base.css); the theme files derive borders, table heads and title
// lines from --k-accent / --k-primary, so overriding these few recolors every platform's
// preview and mockup consistently. Unset colors keep the platform's own default.

import { textOn } from '../spec/color';
import type { Theme } from '../spec/types';

export function themeVars(theme: Theme | undefined): Record<string, string> {
  const v: Record<string, string> = {};
  if (theme?.accent) v['--k-accent'] = theme.accent;
  if (theme?.primary) Object.assign(v, { '--k-primary': theme.primary, '--k-primary-fg': textOn(theme.primary) });
  if (theme?.header) Object.assign(v, { '--k-titlebar': theme.header, '--k-title-fg': textOn(theme.header) });
  return v;
}
