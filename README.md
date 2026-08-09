# since-clock

An elapsed-time component for showing how long something has been going.
Copy one JavaScript file and one CSS file. There are no dependencies, no
build step, and no service behind the reading.

The important part is the time model:

```js
const elapsed = Date.now() - start;
```

Every reading is computed from the fixed epoch. It is never incremented from
the last reading. That means no drift, no first-frame zero, and no stale
catch-up arithmetic after a background tab resumes.

## Quick start

Keep a useful fallback in the HTML, then load the two files:

```html
<time datetime="2026-05-27T18:40:53-07:00"
      data-since="2026-05-27T18:40:53-07:00">
  <span data-since-value>since 27 May 2026</span>
</time>

<link rel="stylesheet" href="since-clock.css">
<script src="since-clock.js" defer></script>
```

The `datetime` attribute identifies the instant for HTML tools and assistive
technology. `data-since` is the component's input. The fallback remains in
place if the input is invalid or in the future.

Open [`index.html`](index.html) for the live specimen and configuration
console. The console is demo-only; it is not required by the component.

## Why it exists

A generic counter remembers its last answer and adds to it. That is easy to
make inaccurate: timers drift, counters start at zero, and a sleeping tab has
to guess what happened while it was away.

since-clock asks for the current time instead. It uses fixed-duration units —
one day is exactly 86,400,000 milliseconds — for days, hours, minutes, and
seconds, so the answer remains mathematically honest
across time zones, daylight-saving transitions, leap years, clock changes,
long durations, and background-tab resumption. Months and years are not
shown because they are not fixed lengths.

Future epochs are not elapsed time. A future `data-since` value is therefore
left on its authored fallback rather than being rendered as a misleading
zero. If a page intentionally inserts a future value and later changes it to
a past value, call `SinceClock.refresh()` after changing the attribute.

## Options

All configuration is expressed as attributes so the component stays useful in
plain HTML.

| attribute | values | default |
| --- | --- | --- |
| `data-since` | any parseable date/time string | required |
| `data-since-shell` | `bare`, `rail`, `odometer`, `dial`, `strata` | `bare` |
| `data-since-units` | comma-separated `days,hours,minutes,seconds` | all four |
| `data-since-precision` | `minutes`, `seconds`, `flow` | `seconds` |
| `data-since-labels` | `long`, `short`, `none` | `long` |
| `data-since-hover` | `reveal`, `scrub` | none |

For continuous shells, `seconds` and `flow` both retain the shell's
continuous mechanism. `minutes` removes seconds and uses minute cadence.

### Shells

| shell | character |
| --- | --- |
| `bare` | Plain typeset text. The default and the smallest surface. |
| `rail` | Typeset text with a flowing seconds wheel and underline rail. |
| `odometer` | One column per configured unit; larger units step, seconds flow. |
| `dial` | One ring whose sweep represents the current minute. |
| `strata` | Stacked proportional bars for the configured units. |

Every shell reads the same elapsed value. Shells are presentation, not
different clocks.

### Legacy attributes

Published markup keeps working:

- `data-since-flow` maps to `data-since-shell="rail"` and
  `data-since-precision="flow"` when no newer equivalent is present.
- `data-since-format="full|minutes|days|compact"` keeps its original unit
  and label behavior.

Flow mode keeps the larger units as exact text and uses the seconds wheel for
the fractional position computed from `Date.now() - start`; reduced motion
removes that wheel and returns to live minute-resolution text. A successful
upgrade also adds `data-since-live="on"`, which can be used to style only live
readings.

### Reduced motion

`prefers-reduced-motion: reduce` removes continuous wheels, sweeps, fills,
entrances, and beat effects. The reading stays live but drops to minute
resolution, so it does not show stale seconds while the page is deliberately
quiet. Scrubbing is a direct user action and remains available.

The demo also understands `data-motion="reduced"` and
`data-motion="allow"` on `<html>` for deliberate page-level overrides. A host
page should not override a reader's system preference casually.

### Reveal and scrub

`reveal` fades to a second, useful reading on hover or focus: a larger unit or
the source epoch. It does not replace the live value in the DOM.

`scrub` turns the clock into a keyboard and pointer control for exploring its
own history:

```html
<time datetime="2026-05-27T18:40:53-07:00"
      data-since="2026-05-27T18:40:53-07:00" data-since-hover="scrub">
  <span data-since-value>since 27 May 2026</span>
</time>
```

The control uses a slider role, arrow keys move by an hour, Shift+Arrow keys
move by a day, Home jumps to the epoch, and End or Escape returns to live
time. Release announces the resolved scrub value once. The wheel, ring, and
strata/odometer chrome are decorative; accessible text remains plain and does
not announce every animation frame.

### Custom properties

Restyle the component without editing its CSS:

```css
.my-clock {
  --since-size: 2rem;
  --since-family: ui-monospace, monospace;
  --since-weight: 650;
  --since-gap: 0.35em;
  --since-ink: #17202a;
  --since-dim: 0.55;
  --since-accent: #c4472d;
  --since-rule: currentColor;
  --since-track: color-mix(in srgb, currentColor 14%, transparent);
  --since-radius: 0.25em;
  --since-duration: 300ms;
  --since-ease: ease;
}
```

Numerals use tabular figures so a changing second does not move surrounding
content. The component does not impose a global typeface or color.

## Public API

The only global is `window.SinceClock`:

```js
SinceClock.refresh();
SinceClock.clocks; // inspection array of upgraded clock records
```

Call `refresh()` after adding a clock through a client-side renderer or after
changing its `data-since-*` attributes. The function registers new valid
clocks and updates existing ones without replaying their entrance motion.
Treat `SinceClock.clocks` as read-only.

## Performance and accessibility

- Continuous shells share one `requestAnimationFrame` loop.
- Text-only clocks use a one-second or one-minute boundary timer, not a frame
  loop.
- Every frame is derived from the epoch; the component never uses an
  incrementing counter or a drifting `setInterval` catch-up.
- Visible clocks are parked with `IntersectionObserver` when available.
- Hidden tabs stop their scheduler and reconcile from the epoch on resume.
- Decorative wheels, rings, bars, and odometer columns are hidden from
  assistive technology; the reading itself is not a live region.
- `tabular-nums`, focus-visible states, keyboard scrub controls, and touch
  targets are included without requiring a framework.

## Install and contribute

There is intentionally no npm package. Vendor the two readable files so your
page owns exactly what it embeds. This repository's demo and scripts are the
reference surface.

The external files are ordinary static assets: they work under a strict
same-origin `script-src`/`style-src` policy, and the authored fallback remains
useful when JavaScript is disabled or the epoch cannot be parsed.

Run the local checks:

```sh
node scripts/smoke-test.mjs
node scripts/time-test.mjs
node scripts/doc-gc.mjs . --check
```

The deterministic time tests cover past and future inputs, a daylight-saving
offset change, reduced motion, and preservation of a host tab stop. The demo
page is also a manual interaction test for shells, reveal, scrub, themes, and
the configuration console.

Contributions should preserve the central rule: motion may dress a clock, but
it may never make the measurement untrue. See [LICENSE](LICENSE) for the MIT
license.
