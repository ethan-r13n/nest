# Landing visual source

The ribbon and egg geometry comes from `landing-page-animation/geometry.mjs`.
The forest atmosphere comes from that animation's `atmosphere.mjs`, with denser moss strands,
stronger irregular terrain relief, and a smaller terrain mesh. The local sources live in `apps/web/src/lib/landing-visual/` and use the application's pinned Three.js.

The landing page samples these surfaces into particles. Its entrance follows the six original
curves; the egg arrives after the ribbons. Scrolling disperses the sculpture and returning to
the top gathers it again. The scene is loaded only by the landing page; reduced motion renders a still frame.
