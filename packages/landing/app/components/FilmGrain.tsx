// Site-wide film grain: a monochrome fractal-noise tile blended over the page
// with mix-blend-screen, so it reads as texture on dark areas and vanishes on
// light ones (screen over white ≈ white). Fixed to the viewport (filmic — it
// doesn't scroll with content) and click-through. Mounted once in the root
// layout so every section inherits the same grain the developers band uses.
export function FilmGrain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[50] opacity-[0.28] mix-blend-screen"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23grain)'/%3E%3C/svg%3E\")",
        backgroundSize: '160px 160px',
      }}
    />
  );
}
