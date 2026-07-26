# since-clock

A live reading of how long it has been since a fixed instant. One `.js` file,
one `.css` file, no dependencies, no build step, ~140 lines.

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

## Options

| attribute | value | result |
|---|---|---|
| `data-since` | any string `Date.parse` accepts | **required.** The epoch. |
| `data-since-format` | `full` *(default)* | `59 days 04:10:12` |
| | `minutes` | `59 days 04:10` |
| | `days` | `59 days` |
| | `compact` | `59d 04h 10m 12s` |
| `data-since-flow` | present (boolean) | `59 days 04:10:` + a continuously moving seconds wheel |

### Flow mode

```html
<time datetime="2026-05-27T18:40:53-07:00"
      data-since="2026-05-27T18:40:53-07:00"
      data-since-flow>
  <span data-since-value>since 27 May 2026</span>
</time>
```

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
commit of the first project — flow mode runs in that site's masthead, next to
the name.
