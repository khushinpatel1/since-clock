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

The demo page is the test: six configurations including a deliberately
unparseable epoch, which must leave its fallback completely alone, and a
`data-since-flow` example. Check in both themes, and with
`prefers-reduced-motion` on — the plain clocks drop to minute resolution
rather than stopping, and the flow clock drops the wheel entirely and falls
back to the same minute-resolution text.

## Flow mode, 2026-07-26

`data-since-flow` opts an element's seconds into a continuous vertical wheel —
days/hours/minutes stay typeset text, exactly as before. The idea it exists to
carry is one layer under the file header's: **a ticking clock still rounds
down to the second it last decided had passed, and everything between two
ticks is invisible to it.** Flow mode reads the same `Date.now() - start` this
file has always computed, just at the precision the platform actually gives
for free, and holds the wheel at exactly that fractional position — it never
animates *toward* 42, because there is no destination, only where `now -
start` currently says it is. `prefers-reduced-motion` turns it off completely,
same guarantee as the rest of the file: still live, still correct, nothing
moving. See the README's *Flow mode* section for the full argument and the
demo page for a live example.

This shipped the same day the site it was built for — `khushin.com` — put it
in the masthead next to the name, replacing a plainer clock that had been
sitting in the homepage hero.

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
