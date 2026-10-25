// Shapes adapted from Tabler Icons (MIT): https://github.com/tabler/tabler-icons
// License: assets/icons/LICENSE
const shapes = {
  'alert-circle': `<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
  <path d="M12 8v4" />
  <path d="M12 16h.01" />`,
  'circle-check': `<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
  <path d="M9 12l2 2l4 -4" />`,
  'arrow-up-right': `<path d="M17 7l-10 10" />
  <path d="M8 7l9 0l0 9" />`,
  'arrow-down-left': `<path d="M17 7l-10 10" />
  <path d="M16 17l-9 0l0 -9" />`,
  'sparkles': `<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6" />`,
  'shield-lock': `<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
  <path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  <path d="M12 12l0 2.5" />`,
  'calendar-due': `<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" />
  <path d="M16 3v4" />
  <path d="M8 3v4" />
  <path d="M4 11h16" />
  <path d="M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />`
};

export function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || ''}</svg>`;
}
