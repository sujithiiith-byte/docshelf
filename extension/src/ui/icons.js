// Inline SVG icons for buttons (constants only, safe for innerHTML).
const svg = (body) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  folder: svg('<path d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.5h5.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z"/><path d="M8 7.25v3.5M6.25 9h3.5"/>'),
  refresh: svg('<path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71"/><path d="M13.25 2.75v3h-3"/>'),
  collapse: svg('<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2"/><path d="M5.5 8h5"/>'),
  auto: svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/>'),
  sun: svg('<circle cx="8" cy="8" r="2.75"/><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/>'),
  moon: svg('<path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z"/>'),
  search: svg('<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25l3.5 3.5"/>'),
  split: svg('<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5"/><path d="M8 2.75v10.5"/>'),
  sidebarHide: svg('<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5"/><path d="M6 2.75v10.5"/><path d="M10.5 6.5L9 8l1.5 1.5"/>'),
  sidebarShow: svg('<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5"/><path d="M6 2.75v10.5"/><path d="M9 6.5L10.5 8 9 9.5"/>'),
  close: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
};
