/* ==========================================================================
   since-clock — elapsed time from a fixed epoch, computed rather than counted.

   Upgrades any element carrying data-since="<ISO 8601>" into a live reading of
   how long it has been since that instant. Without this file the element still
   says something true; with it, the same element says something true that is
   also moving.

   ── the one idea in here ────────────────────────────────────────────────

   A tally that animates is briefly wrong. Counting up from zero means every
   frame before the last shows a figure that was never true, and a screenshot
   caught mid-flight is a lie about a real number. That is why the numbers on
   this site are typeset and sit still.

   A clock is the opposite case, and only because of how it is written:

       every frame is computed from the epoch — now - start.
       nothing is ever incremented, and nothing animates toward a value.

   There is no accumulator, so there is no first frame showing zero, no drift
   over hours, and no wrong state to catch. Miss a thousand frames and the next
   one is still exactly right. Suspend the tab for a week and it resumes correct
   without knowing anything happened. Every frame it paints is true at the
   instant it paints, which is the whole reason a clock is allowed to move on a
   page whose numbers otherwise may not.

   That is also why it uses requestAnimationFrame rather than setInterval.
   setInterval drifts, and a drifting clock has to be corrected — the moment you
   correct it you are back to maintaining state. rAF asks the same question
   ("what time is it?") as often as the display can change, and the answer is
   never carried over from the last one.

   ── behaviour ───────────────────────────────────────────────────────────

   - The DOM is written only when the rendered string actually changes, so a
     seconds-resolution clock costs one text write per second, not sixty.
   - The loop parks itself when the element is off-screen or the tab is hidden,
     and re-computes on the way back rather than catching up.
   - prefers-reduced-motion drops to minute resolution: still live, still
     correct, nothing flickering in the corner of anyone's eye.
   - No inline styles and no inline script, so it survives a strict CSP
     (script-src 'self'; style-src 'self'). Values reach CSS as data attributes.

   ── the flow mode ───────────────────────────────────────────────────────

   `data-since-flow` on an element opts its final unit — seconds — into a
   continuous vertical wheel instead of a typeset digit pair. This is the
   same idea taken one step further: a clock that ticks *looks* computed but
   isn't, quite — it still only knows the time to the nearest second, and it
   snaps from "41" to "42" the instant the clock believes a second has
   passed, which is itself a small lie of timing. Flow mode reads the exact
   fractional position between 41 and 42 (elapsed-ms modulo 60000, divided by
   1000) and holds the wheel there, continuously, every frame. It does not
   animate *toward* 42; there is no destination and no easing — the wheel's
   position on any given frame is simply where `now - start` says it is, the
   same computation the rest of this file makes, just read at sub-second
   precision instead of rounded down to it. A counting clock cannot do this
   honestly, because a counter only knows the ticks it has counted, never the
   distance between them.

   Days, hours and minutes stay typeset and still — they are exact whole
   units and moving them would only be decoration. Only the unit that is
   genuinely continuous gets to move.

   `prefers-reduced-motion: reduce` turns flow off entirely and falls back to
   plain minute-resolution text, same as a non-flow clock — nothing moving,
   still live, still correct. The wheel is decorative (`aria-hidden`); the
   accessible reading is a plain-text sibling, updated the same way the rest
   of this component updates text — no `aria-live`, so it is available on
   demand and never spoken uninvited.

   MIT. No dependencies, no build step.
   ========================================================================== */

(() => {
  const nodes = document.querySelectorAll('[data-since]');
  if (!nodes.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
  const pad = (n) => String(n).padStart(2, '0');

  /* Elapsed time is broken down in fixed units — days, hours, minutes,
     seconds. Deliberately not months or years: those are not fixed lengths,
     so "2 months 4 days" means different amounts of time depending on which
     months, and the whole point of this component is that what it says is
     exactly true. Days are the largest honest unit. */
  const parts = (ms) => {
    const total = Math.max(0, ms);
    return {
      days: Math.floor(total / MS.day),
      hours: Math.floor(total / MS.hour) % 24,
      minutes: Math.floor(total / MS.minute) % 60,
      seconds: Math.floor(total / MS.second) % 60,
    };
  };

  const formats = {
    // 60 days 04:17:32
    full: (p) => `${p.days} ${p.days === 1 ? 'day' : 'days'} ${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`,
    // 60 days 04:17
    minutes: (p) => `${p.days} ${p.days === 1 ? 'day' : 'days'} ${pad(p.hours)}:${pad(p.minutes)}`,
    // 60 days
    days: (p) => `${p.days} ${p.days === 1 ? 'day' : 'days'}`,
    // 60d 04h 17m 32s
    compact: (p) => `${p.days}d ${pad(p.hours)}h ${pad(p.minutes)}m ${pad(p.seconds)}s`,
  };

  // Rows the wheel strip is built from: 00..59, then 00 once more so the
  // wrap from 59 back to 00 is a continuation of the same strip rather than
  // a jump-cut back to its start — the extra row is never actually reached
  // as a resting position, only passed through mid-flow.
  const WHEEL_ROWS = 61;

  const clocks = [];

  for (const node of nodes) {
    const start = Date.parse(node.dataset.since);
    // An unparseable epoch leaves the server-rendered fallback exactly as it
    // is. A clock that cannot tell the time should say nothing, not "NaN".
    if (!Number.isFinite(start)) continue;

    const target = node.querySelector('[data-since-value]') || node;
    clocks.push({
      node,
      target,
      start,
      format: node.dataset.sinceFormat || 'full',
      flow: 'sinceFlow' in node.dataset,
      last: null,
      lastStatic: null,
      lastSr: null,
      renderMode: null, // 'flow' | 'text', decided per paint so it can react
                         // to prefers-reduced-motion changing mid-session
      flowEls: null,
      visible: true,
    });
    node.dataset.sinceLive = 'on';
  }

  if (!clocks.length) return;

  // Builds the flow-mode DOM once per clock: a decorative wheel (aria-hidden)
  // plus a plain-text sibling that carries the real accessible name. Nothing
  // here is server-rendered — without JS the element still shows whatever
  // static fallback it was given, same as any other clock in this file.
  const buildFlowDom = (clock) => {
    const wrap = document.createElement('span');
    wrap.className = 'since-flow';
    wrap.setAttribute('aria-hidden', 'true');

    const staticEl = document.createElement('span');
    staticEl.className = 'since-flow__static';

    const wheel = document.createElement('span');
    wheel.className = 'since-flow__wheel';
    const strip = document.createElement('span');
    strip.className = 'since-flow__strip';
    for (let i = 0; i < WHEEL_ROWS; i += 1) {
      const row = document.createElement('span');
      row.className = 'since-flow__row';
      row.textContent = pad(i % 60);
      strip.appendChild(row);
    }
    wheel.appendChild(strip);

    wrap.appendChild(staticEl);
    wrap.appendChild(wheel);

    // The accessible reading. Not aria-hidden, so it is what a screen reader
    // reports as this element's name — a full, ordinary sentence, not a
    // stream of spinning digits. It updates the same way plain-text clocks
    // in this file update: no aria-live, so nothing is announced uninvited.
    const sr = document.createElement('span');
    sr.className = 'since-flow__sr';

    clock.target.textContent = '';
    clock.target.appendChild(wrap);
    clock.target.appendChild(sr);
    clock.flowEls = { staticEl, strip, sr };
  };

  const paint = (clock) => {
    // The whole component, in one line: read the wall clock, subtract the
    // epoch. No accumulator, nothing incremented, nothing tweened.
    const elapsed = Date.now() - clock.start;
    const p = parts(elapsed);
    const flowActive = clock.flow && !reduced.matches;
    const desiredMode = flowActive ? 'flow' : 'text';

    if (desiredMode !== clock.renderMode) {
      // Switching between flow and reduced-motion text is rare — it only
      // happens on the initial paint and on a live prefers-reduced-motion
      // change — so rebuilding is cheap and keeps the two modes from having
      // to share fragile state.
      clock.renderMode = desiredMode;
      clock.last = null;
      clock.lastStatic = null;
      clock.lastSr = null;
      if (desiredMode === 'flow' && !clock.flowEls) buildFlowDom(clock);
    }

    if (desiredMode === 'text') {
      const mode = reduced.matches && clock.format === 'full' ? 'minutes' : clock.format;
      const text = (formats[mode] || formats.full)(parts(elapsed));
      if (text === clock.last) return; // one DOM write per visible change
      clock.last = text;
      clock.target.textContent = text;
      return;
    }

    // Flow mode: days/hours/minutes are typeset text, exactly like the
    // `minutes` format above — they are whole units and holding them still
    // is correct. Only seconds move, and only as a wheel.
    const staticText = `${p.days} ${p.days === 1 ? 'day' : 'days'} ${pad(p.hours)}:${pad(p.minutes)}:`;
    if (staticText !== clock.lastStatic) {
      clock.lastStatic = staticText;
      clock.flowEls.staticEl.textContent = staticText;
    }

    // The continuous position: whole seconds plus the fraction of the
    // current second already elapsed, e.g. 41.7 while travelling from the
    // "41" row to the "42" row. This is `elapsed` read at a finer grain, not
    // a separate timer — there is still exactly one thing this file ever
    // computes: now minus start.
    const secondsFloat = (elapsed % 60000) / 1000;
    // A bare number multiplied by a length unit inside calc() is a standard
    // custom-property pattern — no @property registration needed in any
    // evergreen browser. transform is the only property this touches per
    // frame, so it stays on the compositor and never triggers layout.
    clock.flowEls.strip.style.setProperty('--since-flow-pos', secondsFloat.toFixed(3));

    const srText = formats.full(p);
    if (srText !== clock.lastSr) {
      clock.lastSr = srText;
      clock.flowEls.sr.textContent = srText;
    }
  };

  let running = false;

  const frame = () => {
    const live = clocks.filter((c) => c.visible);
    if (document.hidden || !live.length) { running = false; return; }
    for (const clock of live) paint(clock);
    requestAnimationFrame(frame);
  };

  const wake = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  };

  /* Parking. A clock nobody is looking at is a rAF loop keeping a laptop fan
     on for no reason. Coming back does not need a catch-up pass, because
     there is nothing to catch up — the next computed frame is simply right. */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const clock = clocks.find((c) => c.node === entry.target);
        if (clock) clock.visible = entry.isIntersecting;
      }
      wake();
    }, { rootMargin: '64px' });
    for (const clock of clocks) io.observe(clock.node);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  reduced.addEventListener('change', () => {
    for (const clock of clocks) clock.last = null; // force a repaint at the new resolution
    wake();
  });

  // Paint once immediately, so the upgrade from the static fallback happens in
  // the first frame rather than up to a second later.
  for (const clock of clocks) paint(clock);
  wake();
})();
