# Since Clock launch gate report

Date: 2026-08-10 (America/Los_Angeles)

## Automated gate

Commands:

```sh
node scripts/smoke-test.mjs
node scripts/time-test.mjs
node scripts/doc-gc.mjs . --check
```

Result: PASS.

- Smoke test, deterministic time test, and doc-gc: PASS.
- The tested cases include past/future epochs, DST, reduced motion, and host focus state.

## Host browser evidence

Real local HTTP page: `http://127.0.0.1:4174/index.html`.

- No console warnings or errors.
- Seven live clocks and all five shells rendered.
- Configurator opened as one dialog and exposed shell, unit, precision, label, hover, palette, motion, and effect controls.
- Scrub exposed `role=slider`, `tabindex=0`, and ARIA value text. ArrowLeft changed the value by about one hour; End returned it to live time.

## Measurable visual/accessibility evidence

`uilint` at desktop 1280×800 returned HTTP 200 and found capped overlap detections, 3.6–4.4:1 contrast on several small labels/numbers, and text below 12px.

`uilint` at mobile dark 390×844 returned HTTP 200 and found real 70px horizontal overflow from the quick-start section, capped overlaps, one contrast finding, one 41px target, and text below 12px.

## Media evidence

Completed captures are the actual host files in `media/`: `desktop-hero.png`, `five-shells.png`, `configurator.png`, and `mobile-dark.png`.

`media/CONTACT-SHEET.png` is a labeled composite of those captures. `media/demo.mp4` is a silent, frame-sequenced montage with restrained fades; it is not a live screen recording and does not claim to show live clock updates or interaction between the captured states.

## Verdict

Functional engine and interaction evidence: **PASS**.

Public promotion: **HOLD** until the 70px mobile overflow and verified accessibility defects are fixed and re-captured. Do not use the media as evidence that those defects are resolved.
