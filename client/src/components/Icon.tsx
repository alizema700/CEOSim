import type { CSSProperties } from 'react';

/**
 * Editoriales Linien-Icon-System (Design-Offensive D1). Monochrom, erbt die
 * Textfarbe (`currentColor`), gestochene Gravur-Anmutung statt Farb-Emoji —
 * das nimmt der Oberfläche den „KI-Look". Ein 24er-Raster, dünne Striche,
 * runde Enden. Jedes Icon ist reines SVG, keine externen Abhängigkeiten.
 */

export type IconName =
  | 'check' | 'x' | 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-down'
  | 'chevron-right' | 'chevron-down' | 'plus' | 'minus' | 'dot' | 'lock' | 'unlock'
  | 'mail' | 'chat' | 'calendar' | 'bell' | 'pin' | 'pen' | 'note' | 'clipboard'
  | 'scale' | 'gavel' | 'user' | 'users' | 'crown' | 'handshake' | 'institution'
  | 'bank' | 'coins' | 'briefcase' | 'trending-up' | 'trending-down' | 'bar-chart'
  | 'target' | 'compass' | 'bulb' | 'flag' | 'shield' | 'megaphone' | 'star'
  | 'trophy' | 'rocket' | 'bolt' | 'flame' | 'book' | 'newspaper' | 'box' | 'globe'
  | 'sliders' | 'hourglass' | 'flask' | 'mic' | 'fin' | 'skull' | 'alert' | 'info'
  | 'heart-pulse' | 'search' | 'trash' | 'grid' | 'sitemap' | 'clock' | 'anchor'
  | 'leaf' | 'scissors' | 'handshake-break' | 'eye' | 'graduation'
  | 'droplet' | 'wall' | 'battery-low' | 'square' | 'check-square';

/** Innerer SVG-Inhalt je Icon (24×24-Raster). `f` markiert gefüllte Formen. */
const P: Record<IconName, { d?: string; extra?: string; f?: boolean }> = {
  'check': { d: 'M5 13l4 4L19 7' },
  'x': { d: 'M6 6l12 12M18 6L6 18' },
  'arrow-right': { d: 'M4 12h15M13 6l6 6-6 6' },
  'arrow-left': { d: 'M20 12H5M11 6l-6 6 6 6' },
  'arrow-up': { d: 'M12 20V5M6 11l6-6 6 6' },
  'arrow-down': { d: 'M12 4v15M6 13l6 6 6-6' },
  'chevron-right': { d: 'M9 5l7 7-7 7' },
  'chevron-down': { d: 'M5 9l7 7 7-7' },
  'plus': { d: 'M12 5v14M5 12h14' },
  'minus': { d: 'M5 12h14' },
  'dot': { d: 'M12 12h.01', extra: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>', f: true },
  'lock': { d: 'M8 11V8a4 4 0 0 1 8 0v3', extra: '<rect x="5" y="11" width="14" height="9" rx="1.5"/>' },
  'unlock': { d: 'M8 11V8a4 4 0 0 1 7.7-1.5', extra: '<rect x="5" y="11" width="14" height="9" rx="1.5"/>' },
  'mail': { d: 'M4 7l8 5.5L20 7', extra: '<rect x="3" y="5" width="18" height="14" rx="1.5"/>' },
  'chat': { d: 'M4 5.5h16v10H9l-4 3.5v-3.5H4z' },
  'calendar': { d: 'M4 8h16M8 3v3M16 3v3', extra: '<rect x="4" y="5" width="16" height="16" rx="1.5"/>' },
  'bell': { d: 'M6 16V10a6 6 0 0 1 12 0v6l2 2H4zM10 20a2 2 0 0 0 4 0' },
  'pin': { d: 'M12 21c4-4.5 6-7.7 6-11a6 6 0 1 0-12 0c0 3.3 2 6.5 6 11z', extra: '<circle cx="12" cy="10" r="2.2"/>' },
  'pen': { d: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3' },
  'note': { d: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6' },
  'clipboard': { d: 'M9 4h6v3H9zM9 13l2 2 4-4', extra: '<rect x="5" y="5" width="14" height="16" rx="1.5"/>' },
  'scale': { d: 'M12 4v16M5 20h14M6 8l12-2M6 8l-2.5 6a3 3 0 0 0 6 0zM18 6l2.5 5.5a3 3 0 0 1-6 0z' },
  'gavel': { d: 'M6 20h9M8 4l6 6M6 6l6 6-2.5 2.5L3.5 8.5zM12.5 10.5L18 5' },
  'user': { d: 'M6 20c0-3.3 2.7-5 6-5s6 1.7 6 5', extra: '<circle cx="12" cy="8" r="3.5"/>' },
  'users': { d: 'M2 20c0-2.8 2-4.2 4.5-4.2S11 17.2 11 20M13 15.8c2.3-.2 5 1 5 4.2M14.5 6.2a3 3 0 0 1 0 5.6', extra: '<circle cx="6.5" cy="8" r="3"/>' },
  'crown': { d: 'M4 8l3 4 5-7 5 7 3-4-1.5 11H5.5zM5.5 16h13' },
  'handshake': { d: 'M11 17l2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4M21 3l1 11h-2M3 3l8 8M3 14l4 4' },
  'institution': { d: 'M3 9l9-5 9 5M4 9v9M9 9v9M15 9v9M20 9v9M3 21h18M3 18h18' },
  'bank': { d: 'M4 10l8-5 8 5M5 10v8M12 10v8M19 10v8M3 21h18' },
  'coins': { d: 'M13 8.5c0 1.7-2.5 3-5.5 3S2 10.2 2 8.5 4.5 5.5 7.5 5.5 13 6.8 13 8.5zM2 8.5v4c0 1.7 2.5 3 5.5 3 1 0 2-.15 2.8-.4', extra: '<path d="M11 13.5c1.3.9 3.4 1.5 5.5 1.5 3 0 5.5-1.3 5.5-3v-4c0-1.7-2.5-3-5.5-3-1.4 0-2.7.3-3.7.8"/>' },
  'briefcase': { d: 'M9 7V5h6v2M3 12h18', extra: '<rect x="3" y="7" width="18" height="13" rx="1.5"/>' },
  'trending-up': { d: 'M3 17l6-6 4 4 8-8M17 7h4v4' },
  'trending-down': { d: 'M3 7l6 6 4-4 8 8M17 17h4v-4' },
  'bar-chart': { d: 'M5 21V11M12 21V4M19 21v-7M3 21h18' },
  'target': { d: 'M12 8v-3M12 19v-3M8 12H5M19 12h-3', extra: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>' },
  'compass': { d: 'M14.5 9.5L11 11l-1.5 3.5L13 13z', extra: '<circle cx="12" cy="12" r="9"/>' },
  'bulb': { d: 'M9 18h6M10 21h4M8.5 15a5 5 0 1 1 7 0c-.8.7-1 1.3-1 2.2H9.5c0-.9-.2-1.5-1-2.2z' },
  'flag': { d: 'M6 21V4M6 5h11l-2 3 2 3H6' },
  'shield': { d: 'M12 3l8 3v5c0 5-3.3 8.5-8 10.5C7.3 19.5 4 16 4 11V6z' },
  'megaphone': { d: 'M4 10v4l3 .5 2 4h2l-1.5-3.5L19 18V6L11.5 9.5H4zM4 10.5l7-1' },
  'star': { d: 'M12 3l2.1 6.1 6.5.1-5.1 4 1.9 6.2L12 15.6 6.6 19.4l1.9-6.2-5.1-4 6.5-.1z', f: true },
  'trophy': { d: 'M7 5h10v4a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M10 14v3M14 14v3M8 20h8M9 20l1-3h4l1 3' },
  'rocket': { d: 'M12 3c3 2 4.5 5 4.5 9L12 15l-4.5-3c0-4 1.5-7 4.5-9zM9 16l-2 4M15 16l2 4M12 20l-.01.5', extra: '<circle cx="12" cy="9" r="1.6"/>' },
  'bolt': { d: 'M13 3L5 13h6l-1 8 9-11h-6z' },
  'flame': { d: 'M12 3c1 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3 1.5-4 .5 1.5 1.5 2 2.5 2C11 9 10.5 6 12 3z' },
  'book': { d: 'M4 5c2-1 5-1 8 .5V21c-3-1.5-6-1.5-8-.5zM20 5c-2-1-5-1-8 .5V21c3-1.5 6-1.5 8-.5z' },
  'newspaper': { d: 'M4 5h13v14a2 2 0 0 0 2-2V8h2v9a3 3 0 0 1-3 3H4zM7 9h7M7 12h7M7 15h4' },
  'box': { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9' },
  'globe': { d: 'M3 12h18M12 3c3 2.5 3 15 0 18M12 3c-3 2.5-3 15 0 18', extra: '<circle cx="12" cy="12" r="9"/>' },
  'sliders': { d: 'M4 8h9M17 8h3M4 16h3M11 16h9M14 6v4M8 14v4' },
  'hourglass': { d: 'M6 3h12M6 21h12M7 3c0 4.5 5 6 5 9s-5 4.5-5 9M17 3c0 4.5-5 6-5 9s5 4.5 5 9' },
  'flask': { d: 'M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 7 21h10a2 2 0 0 0 1.8-3.4L14 9V3M7.5 15h9' },
  'mic': { d: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 18v3M9 21h6' },
  'fin': { d: 'M3 18c3 .9 6-.9 9 0s6 .9 9 0M10.5 18c.2-5 2.5-8.5 5.5-10.5-1 3.2-1 6.8 0 10.5' },
  'skull': { d: 'M8 17v3h8v-3M9.5 20v-2M14.5 20v-2M5 12a7 7 0 1 1 14 0c0 2.5-1.5 4-3 4.5H8C6.5 16 5 14.5 5 12z', extra: '<circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/>' },
  'alert': { d: 'M12 4l9 16H3zM12 10v4M12 17.5v.5' },
  'info': { d: 'M12 11v5M12 8v.5', extra: '<circle cx="12" cy="12" r="9"/>' },
  'heart-pulse': { d: 'M4 13h3l1.5-3 2 6 1.5-4 1 2h4M20.5 11.2A4.6 4.6 0 0 0 12 8a4.6 4.6 0 0 0-8.5 2' },
  'search': { d: 'M20 20l-4-4', extra: '<circle cx="11" cy="11" r="6"/>' },
  'trash': { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5' },
  'grid': { d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  'sitemap': { d: 'M9 5h6v3H9zM4 16h5v3H4zM15 16h5v3h-5zM12 8v4M6.5 16v-2h11v2' },
  'clock': { d: 'M12 7v5l3 2', extra: '<circle cx="12" cy="12" r="9"/>' },
  'anchor': { d: 'M12 7v13M5 13c0 4 3.5 6 7 6s7-2 7-6M8 9h8', extra: '<circle cx="12" cy="5" r="2"/>' },
  'leaf': { d: 'M5 19c0-8 5-13 14-13 0 9-5 14-14 13zM8 16c3-3 5-5 7-6' },
  'scissors': { d: 'M8 8l12 8M8 16l12-8', extra: '<circle cx="6" cy="6.5" r="2.2"/><circle cx="6" cy="17.5" r="2.2"/>' },
  'handshake-break': { d: 'M11 17l2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4M21 3l1 11h-2M3 3l8 8M3 14l4 4M4 21L21 4' },
  'eye': { d: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z', extra: '<circle cx="12" cy="12" r="2.5"/>' },
  'graduation': { d: 'M12 4l10 4-10 4L2 8zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M20 9v5' },
  'droplet': { d: 'M12 3.5c3.2 4 5.5 6.8 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 10.3 8.8 7.5 12 3.5z' },
  'wall': { d: 'M4 7h16v10H4zM4 12h16M11 7v5M7 12v5M15 12v5' },
  'battery-low': { d: 'M2.5 8h15v8h-15zM20 11v2M5 10.5v3' },
  'square': { d: 'M5 5h14v14H5z' },
  'check-square': { d: 'M9 12l2 2 4-4M5 5h14v14H5z' },
};

export function Icon({ name, size = 16, className, style, strokeWidth = 1.6 }: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  const p = P[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-0.14em', flexShrink: 0, ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: (p.d ? `<path d="${p.d}"${p.f ? ' fill="currentColor" stroke="none"' : ''}/>` : '') + (p.extra ?? '') }}
    />
  );
}

/**
 * Abbildung Engine-Emoji → Linien-Icon. Die deterministische Engine speichert
 * Ereignis-Icons als Emoji-Strings (Golden-Master-stabil); im Client
 * übersetzen wir sie beim Rendern in editoriale Icons. Unbekannte fallen auf
 * das Emoji zurück (siehe <Glyph>).
 */
export const EMOJI_ICON: Record<string, IconName> = {
  '🤝': 'handshake', '🏛': 'institution', '🏛️': 'institution', '🏦': 'bank', '💰': 'coins',
  '💵': 'coins', '💶': 'coins', '📈': 'trending-up', '📉': 'trending-down', '📊': 'bar-chart',
  '🎯': 'target', '🧭': 'compass', '💡': 'bulb', '🚩': 'flag', '🏁': 'flag', '🏳️': 'flag',
  '🛡': 'shield', '🛡️': 'shield', '📣': 'megaphone', '📢': 'megaphone', '⭐': 'star', '🌟': 'star',
  '🏆': 'trophy', '🚀': 'rocket', '⚡': 'bolt', '🔥': 'flame', '📚': 'book', '📖': 'book',
  '📰': 'newspaper', '📦': 'box', '🌍': 'globe', '🌐': 'globe', '⚙️': 'sliders', '⚙': 'sliders',
  '⏳': 'hourglass', '⌛': 'hourglass', '🔬': 'flask', '⚗️': 'flask', '🧪': 'flask', '🎤': 'mic',
  '🦈': 'fin', '☠️': 'skull', '☠': 'skull', '⚠️': 'alert', '⚠': 'alert', 'ℹ️': 'info',
  '🩺': 'heart-pulse', '❤️': 'heart-pulse', '🔍': 'search', '🔎': 'search', '🗑': 'trash', '🗑️': 'trash',
  '🔒': 'lock', '🔓': 'unlock', '📅': 'calendar', '🗓️': 'calendar', '🔔': 'bell', '📌': 'pin',
  '✍️': 'pen', '✍': 'pen', '📝': 'note', '📋': 'clipboard', '⚖️': 'scale', '⚖': 'scale',
  '👥': 'users', '👤': 'user', '🧑‍💼': 'user', '👔': 'briefcase', '💼': 'briefcase', '🎩': 'crown',
  '👑': 'crown', '🏢': 'institution', '💬': 'chat', '✉️': 'mail', '✉': 'mail', '📧': 'mail',
  '🎓': 'graduation', '🌱': 'leaf', '✂️': 'scissors', '👁️': 'eye', '🔴': 'dot', '⚓': 'anchor',
  '🕐': 'clock', '🕒': 'clock', '⏰': 'clock', '💧': 'droplet', '🧱': 'wall', '🪫': 'battery-low',
  '🔋': 'battery-low', '☑': 'check-square', '☐': 'square', '✅': 'check-square', '🏗️': 'wall',
};

/**
 * Rendert ein Engine-Emoji als Linien-Icon, wenn bekannt — sonst das Emoji
 * selbst (Fallback). So bleibt die Oberfläche editorial, ohne die Engine
 * anzufassen.
 */
export function Glyph({ e, size = 15, className, style }: { e: string; size?: number; className?: string; style?: CSSProperties }) {
  const name = EMOJI_ICON[e.trim()];
  if (name) return <Icon name={name} size={size} className={className} style={style} />;
  return <span className={className} style={style}>{e}</span>;
}
