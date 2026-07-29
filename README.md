# since-clock

A live reading of how long it has been since a fixed instant. One `.js` file,
one `.css` file, no dependencies, no build step. Five shells, two hover modes,
one engine underneath all of them.

```html
<p>
  Building for
  <time datetime="2026-05-27T18:40:53-07:00"
        data-since="2026-05-27T18:40:53-07:00">
    <span data-since-value>since 27 May 2026</span>
  </time>
</p>

<link rel="stylesheet" href="since-clock.css">
<script src="since-clock.js" defer></script>
```

That renders `59 days 04:10:12`, and keeps rendering it.

---

## Why this exists

I was building a page whose whole argument was that its numbers came out of
version control and were never typed by hand. So I had a rule: **the numbers
do not animate.**

The reason is worth stating precisely, because it is the reason this component
is written the way it is. A tally that counts up from zero is *briefly wrong*.
Every frame before the last shows a figure that was never true, and a
screenshot caught mid-flight is a lie about a real number. On a page claiming
the figures are real, that is a contradiction rather than a flourish.

Then I wanted a clock on the same page — and a clock that is not moving is
broken.

The two rules only conflict if you write the clock the obvious way.

## The idea

```js
const elapsed = Date.now() - start;
```

Every frame is **computed from the epoch**. Nothing is ever incremented, and
nothing animates *toward* a value.

There is no accumulator, so:

- there is no first frame showing zero;
- there is no drift, over an hour or over a year;
- there is no catch-up pass after the tab was hidden;
- miss a thousand frames and the next one is still exactly right.

Every frame it paints is true at the instant it paints. That is the whole
distinction between a clock and a tally, and it is why a clock is allowed to
move on a page where a counter is not.

It is also why this uses `requestAnimationFrame` and not `setInterval`.
`setInterval` drifts, and a drifting clock has to be corrected — and the moment
you correct it, you are maintaining state again. `rAF` asks the same question
("what time is it?") as often as the display could change, and never carries an
answer over from the last one.

## What it does for you

- **Writes the DOM only when the rendered string changes.** A seconds-resolution
  clock costs one text write per second, not sixty.
- **Parks itself** when the element scrolls off-screen or the tab is hidden, and
  resumes without a catch-up pass, because there is nothing to catch up.
- **Respects `prefers-reduced-motion`** by dropping to minute resolution — still
  live, still correct, nothing flickering at the edge of your eye.
- **Survives a strict CSP.** No inline `<script>`, no inline `style`. Works under
  `script-src 'self'; style-src 'self'`.
- **Degrades to something true.** With JavaScript off, the element keeps whatever
  you server-rendered inside it. Write an honest static fallback — a real date —
  and the script replaces only that text.

## Shells

`data-since-shell` picks the object the clock renders as. Each is a different
object, not a different skin on the same one:

| shell | what it is |
|---|---|
| `bare` *(default)* | plain typeset text, no chrome |
| `rail` | typeset text + a flowing-seconds wheel + an underline rail |
| `odometer` | every configured unit is its own wheel — days/hours/minutes step, seconds flow |
| `dial` | one ring, seconds sweeping as a continuous arc, numerals typeset inside |
| `strata` | elapsed time as stacked proportional bars, each unit a fraction of the one above |

`rail`, `odometer`, `dial` and `strata` are continuous by default — the
wheel/sweep/fill is what the shell *is*. Set `data-since-precision="seconds"`
to keep a shell's chrome but have it tick discretely instead.

## Options

| attribute | value | result |
|---|---|---|
| `data-since` | any string `Date.parse` accepts | **required.** The epoch. |
| `data-since-shell` | `bare` \| `rail` \| `odometer` \| `dial` \| `strata` | which object renders the reading. Default `bare`. |
| `data-since-units` | comma-separated, e.g. `days,hours` | which units render, in order. Default all four. |
| `data-since-precision` | `minutes` \| `seconds` \| `flow` | how fine a reading gets. Default depends on shell (see above). |
| `data-since-labels` | `long` *(default)* | `62 days 01:26:00` |
| | `short` | `62d 01h 26m 00s` |
| | `none` | `62 01:26:00` |
| `data-since-hover` | `reveal` | hover/focus fades the reading out and an alternate reading — a different unit, then the epoch itself — fades in over it |
| | `scrub` | press and drag across the element to read whatever instant your pointer maps to, between the epoch and now |
| `data-since-format` *(legacy)* | `full` \| `minutes` \| `days` \| `compact` | the pre-shell attribute. Still honoured — see below. |
| `data-since-flow` *(legacy)* | present (boolean) | still works, forever — see below. |

### Flow mode (legacy `data-since-flow`)

```html
<time datetime="2026-05-27T18:40:53-07:00"
      data-since="2026-05-27T18:40:53-07:00"
      data-since-flow>
  <span data-since-value>since 27 May 2026</span>
</time>
```

`data-since-flow` is the original attribute, published before shells existed,
and it keeps working forever — breaking a stranger's page to tidy an
attribute name is the one thing a published component may not do. It maps
onto `data-since-precision="flow"` and, when no shell is named, onto the
`rail` shell — which is exactly the rendering `data-since-flow` always
produced, so a page written against the old attribute looks identical under
the new engine.

Days, hours and minutes are typeset text — exact whole units, held still.
Seconds become a continuous vertical odometer: it does not step from 41 to
42, it travels there, sitting at exactly the fractional position `now -
start` says it should at that instant.

This is the same idea the whole component is built on, one level deeper. A
clock that ticks looks computed, but a tick is still a small lie of timing —
it only knows a second has passed the moment it decides to say so, and
everything between two ticks is invisible to it. Flow mode reads the same
`Date.now() - start` this file always computes, just at the precision the
platform actually offers, and holds the wheel exactly there. There is still
no accumulator and nothing is tweened toward a target — every frame is a
fresh computation, the wheel just happens to be a more honest way to display
a fractional answer than rounding it down to a static digit pair.

`prefers-reduced-motion: reduce` turns flow off completely and falls back to
plain `minutes`-resolution text — nothing spinning, still live, still
correct, exactly like a non-flow clock under the same setting. The wheel
itself is `aria-hidden`; a plain-text sibling carries the actual accessible
name, updated the same no-`aria-live` way every clock in this file updates,
so nothing is announced uninvited and nothing reads as a stream of spinning
digits.

The script sets `data-since-live="on"` on each element it successfully upgrades,
so you can style the live state differently from the static fallback. Do that:
a page should not claim something is live unless it is.

```css
[data-since-live='on'] { border-bottom: 1px solid currentColor; }
```

If `data-since` is missing or unparseable, that element is left completely
alone — the fallback stands. A clock that cannot tell the time should say
nothing, not `NaN`.

### Scrub — the same idea, one level up

```html
<time data-since="2026-05-27T18:40:53-07:00" data-since-hover="scrub">
  <span data-since-value>since 27 May 2026</span>
</time>
```

Press and drag across the element and the numerals read whatever instant your
pointer position maps to, between the epoch and now. Flow mode reads a
fractional second nobody asked for and holds the wheel there; scrub reads a
fractional day *you* pick and holds the whole reading there. Both exist for
the same reason: the engine was never "elapsed time since start, ticking" —
it was always "elapsed time between start and any instant," and the instant
only ever had to stop being hardcoded to `now`. A `setInterval` clock cannot
do either, because it never knows more than the ticks it has counted.

The element takes `tabindex="0"` only under `scrub` — a clock is otherwise
text, not a control. Left/Right arrows scrub by an hour, Shift+Left/Right by
a day, Home jumps to the epoch, End and Escape return to live and announce
the resolved reading once. Reduced motion does not touch scrub: dragging
through history is a user action, not an animation.

### Reveal — disclosure, not sparkle

```html
<time data-since="2026-05-27T18:40:53-07:00" data-since-hover="reveal">
  <span data-since-value>since 27 May 2026</span>
</time>
```

On hover or focus, the reading dims and an alternate reading fades in over
it, cycling between the same elapsed time in a different unit and the epoch
itself — `62 days` ⇄ `1,489 hours` ⇄ `since 27 May 2026, 09:14`. A clock
cannot say the date; hovering it says the date.

### Custom properties

Every shell styles itself only through these — no shell hardcodes a colour, a
size or a duration, so a page can restyle the clock entirely without opening
`since-clock.css`:

```
--since-size  --since-family  --since-weight  --since-gap
--since-ink   --since-dim     --since-accent  --since-rule
--since-track --since-radius  --since-ease    --since-duration
```

### Units

Days are the largest unit it will show, deliberately. Months and years are not
fixed lengths, so "2 months 4 days" means different amounts of time depending on
which months — and the entire point of this component is that what it says is
exactly true. If you want "about two months", you want a relative-time
formatter, and the platform already has one:
[`Intl.RelativeTimeFormat`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat).

### Several clocks

Every element with `data-since` on the page is upgraded, and they share one
`rAF` loop. Adding a second clock costs no second loop.

## Install

Copy the two files. That is the install.

There is no npm package because there is nothing to resolve, nothing to bundle,
and nothing to keep up to date. If you want it in a package manager, vendoring
two files you can read in five minutes is the cheaper option.

## Browser support

Anything with `requestAnimationFrame` and `dataset`. `IntersectionObserver` is
used when present and skipped when not — without it the clock simply doesn't
park on scroll, which costs nothing but a little battery on a very old browser.

## Licence

MIT. See [LICENSE](LICENSE).

Built for [khushin.com](https://khushin.com), where it counts from the first
commit of the first project — the `rail` shell runs in that site's masthead,
next to the name.
