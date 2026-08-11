# Since Clock launch package

## Position

An honest elapsed-time reading: one fixed computation, five expressive shells, no drift.

## Audience

Designers and frontend developers building launch pages, portfolios, studio sites, changelogs, and product histories that need elapsed time without a service or framework.

## Differentiators

- Every frame derives from `Date.now() - start`; it never increments an accumulator.
- Five shells—bare, rail, odometer, dial, and strata—share the same measurement.
- Plain HTML attributes, two readable files, zero dependencies, and no build step.
- Truthful authored fallback for invalid or future epochs.
- Keyboard- and pointer-accessible scrub, legacy attributes, and reduced-motion behavior.

## Message hierarchy

1. Elapsed time should be computed, not guessed.
2. One engine can support multiple visual readings.
3. The component is easy to vendor and easy to remove.
4. Motion dresses the reading without changing its meaning.

## Launch headlines

1. One computation. Five ways to read time.
2. A clock that never drifts into fiction.
3. Elapsed time, honestly rendered.

## Descriptions

Short: Since Clock is a dependency-free elapsed-time component with five shells, truthful fallbacks, and accessible scrub.

Medium: Since Clock reads elapsed time from a fixed epoch on every update, so it does not drift, begin at zero, or guess after a background tab resumes. Add one JavaScript file and one CSS file, choose bare, rail, odometer, dial, or strata with HTML attributes, and keep an authored fallback for invalid or future input. Reduced motion removes continuous chrome while the measurement stays live.

## Honest caveats

This is elapsed time, not a calendar-duration library: months and years are intentionally not shown because they are not fixed lengths. The demo is a static specimen, not a hosted service. Functional engine and interaction evidence pass, but public promotion is currently on HOLD: host evidence found 70px mobile overflow from the quick-start section plus verified contrast, overlap, target-size, and text-size defects. No production performance, accuracy beyond the stated fixed-unit model, or adoption claim is made here.

## Recommended GitHub description

Dependency-free elapsed-time web component: one fixed epoch, five shells, truthful fallbacks, and accessible scrub.

## Exact topics

`javascript`, `css`, `web-components`, `time`, `accessibility`, `motion-design`, `frontend`, `static-site`, `ui`, `open-source`

## Draft release notes

### Since Clock 1.0

- Added five shells over one fixed-epoch elapsed-time computation.
- Added rail flow, odometer, dial, and strata presentations alongside bare text.
- Added reveal and keyboard/pointer scrub interactions.
- Preserved legacy flow and format attributes.
- Added reduced-motion rebuild behavior and truthful invalid/future fallback.
- Added deterministic tests for past, future, DST, reduced motion, and host focus state.

Known limitation: the host browser gate is captured, but promotion remains blocked by the mobile and accessibility findings above. The media is real but frame-sequenced, not a live screen recording.

## Three-week public marketing plan

| Week | Channel and cadence | Post concept | CTA | Success metric |
| --- | --- | --- | --- | --- |
| 1 | GitHub release + 2 short posts on Bluesky/X | Explain the fixed-epoch rule with a simple elapsed-time example | Read the demo and copy the two files | Demo visits, stars, saves |
| 1 | One frontend community post | Show the same instant in bare, rail, odometer, dial, and strata | Try a shell in an existing page | Click-throughs, forks |
| 2 | Three posts, one every other day | Demonstrate truthful future fallback, legacy markup, and reduced motion | Inspect the HTML contract | Engagement, issue quality |
| 2 | One accessibility-focused discussion | Walk through keyboard scrub and the accessible text path | Test scrub and report friction | Qualified replies, fixes suggested |
| 3 | Two posts + one maintainer note | Show how a static site vendors the component without a service | Copy the quick-start snippet | Repository repeat visits, installs by search/referral |
| 3 | One recap post | Contrast fixed-unit elapsed time with calendar duration | Share a use case or missing shell | Feedback quality, contributor interest |

Cadence is intentionally small: demonstrate the computation and the HTML contract, invite testing, and make no production or adoption claims.

## Media checklist

Completed host captures: `media/desktop-hero.png`, `media/five-shells.png`, `media/configurator.png`, and `media/mobile-dark.png`. Composite and montage: `media/CONTACT-SHEET.png` and `media/demo.mp4`. Promotion remains HOLD pending the gate findings; see `media/README.md` for crop guidance.
