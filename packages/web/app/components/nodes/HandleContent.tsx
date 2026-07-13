// Shared handle geometry and color. Handles render as small rectangles (taller
// than wide) in the theme primary color. A node exposes one target handle on its
// left edge and one source handle on its right edge; direction is implied by the
// edge the handle sits on, so no arrow glyph.
export const HANDLE_WIDTH = 6;
export const HANDLE_HEIGHT = 15;
export const HANDLE_RADIUS = '2px';
export const HANDLE_COLOR = 'var(--primary)';
