// What the home banner looks like on a given screen: a pure function of the Project, used by
// the canvas preview and the mockup renderer alike (one source, so they can't disagree).

import { textOn } from '../spec/color';
import type { BannerLogo, Project, Screen } from '../spec/types';

export interface BannerLook {
  title: string;
  subtitle: string;
  /** image src, or null = draw a placeholder tile with `initial` (icon chosen but not uploaded) */
  left?: string | null;
  right?: string | null;
  initial: string;
  align: 'left' | 'center';
  /** explicit colors; unset = the skin's own --k-head / text colors */
  bg?: string;
  fg?: string;
}

/** The banner for this screen, or null when it doesn't show there (dialogs never get one) */
export function bannerFor(p: Project, s: Screen): BannerLook | null {
  const b = p.banner;
  if (!b || s.surface === 'dialog') return null;
  if ((b.showOn ?? 'home') === 'home' && s.id !== p.entry.openScreen) return null;
  const logo = (l: BannerLogo | undefined) => (l === undefined ? undefined : l === 'icon' ? (p.entry.iconImage ?? null) : l);
  const bg = b.background ?? p.theme?.header;
  const title = b.title?.trim() || p.meta.name || 'My plugin';
  return {
    title, subtitle: b.subtitle?.trim() ?? '',
    left: logo(b.left), right: logo(b.right), initial: title.slice(0, 1).toUpperCase(),
    align: b.align ?? 'left',
    ...(bg ? { bg, fg: textOn(bg) } : {}),
  };
}
