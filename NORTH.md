# NORTH — since-clock

A live reading of elapsed time since a fixed instant. One `.js`, one `.css`, no
dependencies, no build step. MIT. Published for strangers to use, which is the
point of it — it is the first thing this studio has that is useful outside it.

The idea it exists to carry: **every frame is computed from the epoch, never
incremented.** `Date.now() - start`. No accumulator means no first frame showing
zero, no drift, and no catch-up after a hidden tab — which is what makes a clock
legitimate on a page where an animated counter is not. The README is the pitch
and that paragraph is the pitch's spine; if it ever stops being true, this repo
has stopped being interesting.

## Run it / test it
Open `index.html`. There is nothing to install and nothing to build.

The demo page is the test: five configurations including a deliberately
unparseable epoch, which must leave its fallback completely alone. Check in both
themes, and with `prefers-reduced-motion` on — that one drops to minute
resolution rather than stopping.

## Deploy it
Nothing is deployed. The repo is the artefact. `index.html` is a live demo if it
is ever served, but it is not required to be.

## In flight
- **Published 2026-07-26**, MIT, at `khushinpatel1/since-clock`. KP's call, made
  the same day the studio's classification policy changed to "public by default
  unless we plan to sell it." This repo is not for sale and never was.
- `site/clock.js` in the `khushin` repo is the same file under a different
  name. It is a copy, deliberately — vendoring two readable files beats a
  dependency — but the two must not drift. Change one, change the other.
