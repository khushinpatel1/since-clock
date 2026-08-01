/* ==========================================================================
   since-clock — elapsed time from a fixed epoch, computed rather than counted.

   Upgrades any element carrying data-since="<ISO 8601>" into a live reading of
   how long it has been since that instant. Without this file the element still
   says something true; with it, the same element says something true that is
   also moving.

   ── the one idea in here ────────────────────────────────────────────────

   A tally that animates is briefly wrong. Counting up from zero means every
   frame before the last shows a figure that was never true, and a screenshot
   caught mid-flight is a lie about a real number. A clock is the opposite
   case, and only because of how it is written:

       every frame is computed from the epoch — now - start.
       nothing is ever incremented, and nothing animates toward a value.

   Miss a thousand frames and the next one is still exactly right. That is
   the whole reason a clock is allowed to move on a page whose numbers
   otherwise may not, and it is the engine underneath every shell below —
   the shells are presentation, reading the same one computation.

   ── shells (data-since-shell) ───────────────────────────────────────────

   bare      plain typeset text, no chrome. The default.
   rail      typeset text + a flowing-seconds wheel + an underline rail.
   odometer  every configured unit is its own wheel; seconds flow, the rest
             step when their value changes.
   dial      one ring, seconds sweeping as a continuous arc, numerals inside.
   strata    elapsed time as stacked proportional bars, each unit a fraction
             of the one above.

   Configuration is attributes (data-since-units, data-since-precision,
   data-since-labels, data-since-hover) because drop-in-with-no-build is the
   product. Styling is custom properties only — no shell hardcodes a colour,
   size or duration; see since-clock.css for the full list.

   data-since-flow is the original attribute and keeps working forever: it is
   published and strangers already have it in real pages. It maps onto
   data-since-precision="flow" and, when no shell is named, onto the "rail"
   shell — which is the exact rendering data-since-flow always produced, so a
   page written against the old attribute looks identical under the new
   engine.

   ── hover (data-since-hover) ─────────────────────────────────────────────

   reveal  hover or focus fades the reading out and an alternate reading — the
           same elapsed time in a different unit, then the epoch itself — fades
           in over it. Disclosure, not sparkle: a clock cannot say the date, so
           hovering it says the date.
   scrub   press and drag across the element and the numerals read whatever
           instant your pointer position maps to, between the epoch and now.
           The engine has always been "elapsed time for an arbitrary instant";
           scrub is the same idea flow mode is, one level up — flow reads a
           fractional second nobody asked for, scrub reads a fractional day
           somebody picked. A setInterval clock cannot do either.

   Reduced motion turns off every continuous mechanism (wheels, the dial's
   sweep, the strata seconds fill, mount, beat) and drops to minute-resolution
   text, same guarantee this file has always made. It does not touch scrub —
   scrub is a user action, not an animation.

   MIT. No dependencies, no build step.
   ========================================================================== */

(() => {
  const nodes = document.querySelectorAll('[data-since]');
  if (!nodes.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* data-motion on <html> is the host page's say over the OS setting, in both
     directions. "reduced" forces stillness for a page that wants it without
     the reader having changed anything system-wide; "allow" is the opposite
     and is the harder one to justify, so: a page *about* motion has to be
     able to show motion to someone who asked for less of it, provided they
     asked for it here, deliberately, and can put it back. Absent the
     attribute the OS setting decides, which is the default and the case
     every consumer of this file gets. */
  const motionReduced = () => {
    const flag = document.documentElement.getAttribute('data-motion');
    if (flag === 'allow') return false;
    return reduced.matches || flag === 'reduced';
  };

  const MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
  const pad = (n) => String(n).padStart(2, '0');
  const UNIT_ORDER = ['days', 'hours', 'minutes', 'seconds'];

  /* Elapsed time is broken down in fixed units. Deliberately not months or
     years: those are not fixed lengths, so "2 months 4 days" means different
     amounts of time depending on which months, and the whole point of this
     component is that what it says is exactly true. Days are the largest
     honest unit. */
  const parts = (ms) => {
    const total = Math.max(0, ms);
    return {
      days: Math.floor(total / MS.day),
      hours: Math.floor(total / MS.hour) % 24,
      minutes: Math.floor(total / MS.minute) % 60,
      seconds: Math.floor(total / MS.second) % 60,
    };
  };

  const LONG = {
    days: ['day', 'days'], hours: ['hour', 'hours'],
    minutes: ['minute', 'minutes'], seconds: ['second', 'seconds'],
  };
  const SHORT = { days: 'd', hours: 'h', minutes: 'm', seconds: 's' };

  // First configured unit gets a word (long) or bare number (none/short);
  // everything after it reads like a clock face, colon-joined and padded.
  // This generalises the four formats the component shipped with originally
  // (full/minutes/days/compact) to an arbitrary, orderable unit list.
  const joinUnits = (p, units, labels) => {
    if (!units.length) return '';
    if (labels === 'short') {
      return units.map((u) => `${u === 'days' ? p.days : pad(p[u])}${SHORT[u]}`).join(' ');
    }
    const [first, ...rest] = units;
    const firstText = labels === 'long'
      ? `${p[first]} ${p[first] === 1 ? LONG[first][0] : LONG[first][1]}`
      : String(p[first]);
    const restText = rest.map((u) => pad(p[u])).join(':');
    return restText ? `${firstText} ${restText}` : firstText;
  };

  // data-since-format is the pre-shell attribute; still honoured because a
  // published component does not get to strand a stranger's markup.
  const FORMAT_LEGACY = {
    full: { units: UNIT_ORDER, precision: 'seconds', labels: 'long' },
    minutes: { units: UNIT_ORDER, precision: 'minutes', labels: 'long' },
    days: { units: ['days'], precision: 'minutes', labels: 'long' },
    compact: { units: UNIT_ORDER, precision: 'seconds', labels: 'short' },
  };

  const SHELLS = ['bare', 'rail', 'odometer', 'dial', 'strata'];
  // Shells with a mechanism that can move continuously between ticks — a
  // wheel, a sweep, a bar fill. bare has no such mechanism: text can only
  // ever be exactly right or exactly wrong, never "between".
  const CONTINUOUS_SHELLS = new Set(['rail', 'odometer', 'dial', 'strata']);

  const parseConfig = (node) => {
    const ds = node.dataset;
    let shell = SHELLS.includes(ds.sinceShell) ? ds.sinceShell : null;
    let units = ds.sinceUnits
      ? ds.sinceUnits.split(',').map((s) => s.trim()).filter((u) => UNIT_ORDER.includes(u))
      : null;
    let precision = ['minutes', 'seconds', 'flow'].includes(ds.sincePrecision) ? ds.sincePrecision : null;
    let labels = ['long', 'short', 'none'].includes(ds.sinceLabels) ? ds.sinceLabels : 'long';
    const hover = ['reveal', 'scrub'].includes(ds.sinceHover) ? ds.sinceHover : 'none';
    const legacyFlow = 'sinceFlow' in ds;
    const legacy = FORMAT_LEGACY[ds.sinceFormat];

    if (legacy) {
      units = units || legacy.units;
      precision = precision || legacy.precision;
      if (!ds.sinceLabels) labels = legacy.labels;
    }
    if (legacyFlow) {
      // data-since-flow and data-since-format were always orthogonal: format
      // only ever shaped the *text* fallback (what shows when not flowing),
      // never whether flow itself ran. A legacy page pairing
      // data-since-format="minutes" with data-since-flow (khushin's own
      // masthead did, before this rewrite) must still flow — so flow wins
      // the continuity question outright, even over an explicit "minutes"
      // precision from the format table above.
      precision = precision === 'minutes' ? 'flow' : (precision || 'flow');
      shell = shell || 'rail'; // the exact rendering data-since-flow always produced
    }

    units = (units && units.length) ? units : UNIT_ORDER.slice();
    shell = shell || 'bare';
    precision = precision || 'seconds';

    return { shell, units, precision, labels, hover };
  };

  // The units actually rendered, once precision has had its say. "minutes"
  // precision drops seconds outright; "seconds"/"flow" keep them.
  const effectiveUnits = (clock) =>
    clock.precision === 'minutes' ? clock.units.filter((u) => u !== 'seconds') : clock.units;

  // Continuous shells (rail/odometer/dial/strata) are continuous by default —
  // the wheel/sweep/fill is what the shell IS, not an opt-in. Only "minutes"
  // precision opts out, by dropping the unit the continuous mechanism reads
  // in the first place. "seconds" and "flow" are equivalent here: the
  // distinction only matters for data-since-format's text-only legacy modes,
  // which never reach a continuous shell without data-since-flow alongside.
  const isContinuous = (clock) =>
    CONTINUOUS_SHELLS.has(clock.shell) && clock.precision !== 'minutes' && !motionReduced();

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const clocks = [];
  let io = null;

  // Registration is a function rather than a loop body because it is called
  // twice: once over the document at load, and again by refresh() for any
  // clock that appeared afterwards. Registering an already-live node is a
  // no-op, so refresh() can be called as often as a caller likes.
  const register = (node) => {
    if (node.dataset.sinceLive === 'on') return null;
    const start = Date.parse(node.dataset.since);
    // An unparseable epoch leaves the server-rendered fallback exactly as it
    // is. A clock that cannot tell the time should say nothing, not "NaN".
    if (!Number.isFinite(start)) return null;

    const clock = {
      node, target: node.querySelector('[data-since-value]') || node, start,
      ...parseConfig(node),
      last: null, lastTick: null, minuteBoundary: null, mounted: false,
      scrubElapsed: null, revealTimer: 0, dom: null, visible: true,
    };
    clocks.push(clock);
    node.dataset.sinceLive = 'on';
    if (io) io.observe(node);
    return clock;
  };

  for (const node of nodes) register(node);

  if (!clocks.length) return;

  // ---- shared DOM builders -------------------------------------------

  const el = (tag, cls, attrs) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  // A visually-hidden node that still reaches a screen reader — used for the
  // accessible name behind decorative wheels/dials and for the one-shot
  // announcement scrub makes on release.
  const srNode = (cls) => el('span', `since-sr ${cls || ''}`.trim());

  // 61 rows so the wrap from 59 back to 00 is a continuation of the strip,
  // never a jump-cut. Row 60 is passed through mid-flow, never rested on.
  const buildWheelStrip = () => {
    const strip = el('span', 'since-wheel__strip');
    for (let i = 0; i < 61; i += 1) {
      const row = el('span', 'since-wheel__row');
      row.textContent = pad(i % 60);
      strip.appendChild(row);
    }
    return strip;
  };

  const buildWheel = () => {
    const wheel = el('span', 'since-wheel');
    wheel.setAttribute('aria-hidden', 'true');
    const strip = buildWheelStrip();
    wheel.appendChild(strip);
    return { wheel, strip };
  };

  // Odometer's days/hours/minutes columns are unbounded (days) or too wide to
  // pre-build a strip for, so they step rather than flow: the old value slides
  // out, the new one slides in, over one CSS transition rather than a rAF loop.
  const flipUpdate = (col, text) => {
    if (col.dataset.text === text) return;
    col.dataset.text = text;
    if (motionReduced()) { col.querySelector('.since-wheel__cur').textContent = text; return; }
    const cur = col.querySelector('.since-wheel__cur');
    const ghost = cur.cloneNode(true);
    ghost.classList.add('since-wheel__ghost');
    col.insertBefore(ghost, cur);
    cur.textContent = text;
    ghost.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-100%)', opacity: 0 }],
      { duration: 260, easing: 'ease' });
    cur.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: 260, easing: 'ease' });
    setTimeout(() => ghost.remove(), 280);
  };

  const buildStepColumn = () => {
    const col = el('span', 'since-wheel__col');
    col.appendChild(el('span', 'since-wheel__cur'));
    return col;
  };

  const buildBeatMark = () => {
    const mark = el('span', 'since-beat');
    mark.setAttribute('aria-hidden', 'true');
    return mark;
  };

  const pulse = (mark) => {
    if (!mark || motionReduced()) return;
    mark.animate(
      [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.9)', opacity: 0.35 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 240, easing: 'ease' },
    );
  };

  const buildRevealOverlay = (root) => {
    const overlay = el('span', 'since-reveal');
    overlay.setAttribute('aria-hidden', 'true');
    root.appendChild(overlay);
    return overlay;
  };

  // ---- per-shell DOM ----------------------------------------------------

  const buildBare = (clock) => {
    const root = el('span', 'since since--bare');
    const text = el('span', 'since__text');
    root.appendChild(text);
    clock.dom = { root, text };
  };

  const buildRail = (clock) => {
    const root = el('span', 'since since--rail');
    const text = el('span', 'since__text');
    root.appendChild(text);
    let wheelRefs = null;
    if (isContinuous(clock)) {
      const { wheel, strip } = buildWheel();
      root.appendChild(wheel);
      const sr = srNode('since__sr');
      root.appendChild(sr);
      wheelRefs = { wheel, strip, sr };
    }
    const beat = buildBeatMark();
    root.appendChild(beat);
    clock.dom = { root, text, wheel: wheelRefs, beat };
  };

  const buildOdometer = (clock) => {
    const root = el('span', 'since since--odometer');
    const units = effectiveUnits(clock);
    const cols = {};
    units.forEach((u, i) => {
      if (i > 0) root.appendChild(el('span', 'since__sep'));
      if (u === 'seconds' && isContinuous(clock)) {
        const { wheel, strip } = buildWheel();
        wheel.classList.add('since-wheel--odometer');
        root.appendChild(wheel);
        cols[u] = { flow: true, strip };
      } else {
        const col = buildStepColumn();
        root.appendChild(col);
        cols[u] = { flow: false, col };
      }
    });
    const sr = srNode('since__sr');
    root.appendChild(sr);
    const beat = buildBeatMark();
    root.appendChild(beat);
    clock.dom = { root, cols, sr, beat };
  };

  // Ring geometry: r=15.9 makes the circumference ~99.9, close enough to 100
  // that percentage dash offsets read as clean values without extra math.
  const RING_R = 15.9155;
  const RING_C = 2 * Math.PI * RING_R;

  const buildDial = (clock) => {
    const root = el('span', 'since since--dial');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('class', 'since-dial');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(svg.namespaceURI, 'circle');
    track.setAttribute('class', 'since-dial__track');
    track.setAttribute('cx', '18'); track.setAttribute('cy', '18'); track.setAttribute('r', String(RING_R));
    const sweep = document.createElementNS(svg.namespaceURI, 'circle');
    sweep.setAttribute('class', 'since-dial__sweep');
    sweep.setAttribute('cx', '18'); sweep.setAttribute('cy', '18'); sweep.setAttribute('r', String(RING_R));
    sweep.setAttribute('stroke-dasharray', String(RING_C));
    svg.appendChild(track); svg.appendChild(sweep);
    root.appendChild(svg);
    const text = el('span', 'since__text since-dial__text');
    root.appendChild(text);
    const beat = buildBeatMark();
    root.appendChild(beat);
    clock.dom = { root, sweep, text, beat };
  };

  const buildStrata = (clock) => {
    const root = el('span', 'since since--strata');
    const units = effectiveUnits(clock);
    const head = el('span', 'since__text since-strata__head');
    root.appendChild(head);
    const bars = {};
    // Every unit but the first is a fraction of the one above it; the first
    // (usually days) has nothing above it and is typeset in the head instead.
    for (const u of units.slice(1)) {
      const row = el('span', 'since-strata__row');
      const label = el('span', 'since-strata__label');
      label.textContent = SHORT[u];
      const track = el('span', 'since-strata__track');
      const fill = el('span', 'since-strata__fill');
      track.appendChild(fill);
      row.appendChild(label); row.appendChild(track);
      root.appendChild(row);
      bars[u] = fill;
    }
    const beat = buildBeatMark();
    root.appendChild(beat);
    clock.dom = { root, head, bars };
  };

  const BUILDERS = { bare: buildBare, rail: buildRail, odometer: buildOdometer, dial: buildDial, strata: buildStrata };

  const UNIT_CAP = { days: Infinity, hours: 24, minutes: 60, seconds: 60 };

  // ---- reveal (hover/focus disclosure) -----------------------------------

  const revealVariants = (clock, elapsed) => {
    const p = parts(elapsed);
    const primary = joinUnits(p, effectiveUnits(clock), clock.labels);
    const totalHours = Math.floor(elapsed / MS.hour);
    const altUnit = p.days >= 1 ? `${totalHours.toLocaleString()} hours` : `${Math.floor(elapsed / MS.minute).toLocaleString()} minutes`;
    const epoch = `since ${dateFmt.format(new Date(clock.start))}`;
    return [primary, altUnit, epoch];
  };

  const startReveal = (clock) => {
    if (!clock.dom || !clock.dom.reveal) return;
    const overlay = clock.dom.reveal;
    clock.dom.root.classList.add('is-revealing');
    let i = 0;
    const step = () => {
      const variants = revealVariants(clock, Date.now() - clock.start);
      i = (i % 2) + 1; // cycle between the two alternates while hovered
      overlay.textContent = variants[i];
      overlay.classList.add('is-active');
    };
    step();
    clock.revealTimer = setInterval(step, 1600);
  };

  const stopReveal = (clock) => {
    if (!clock.dom || !clock.dom.reveal) return;
    clearInterval(clock.revealTimer);
    clock.dom.reveal.classList.remove('is-active');
    clock.dom.root.classList.remove('is-revealing');
  };

  // ---- scrub (drag through the clock's own history) ----------------------

  const SCRUB_STEP = MS.hour;
  const SCRUB_STEP_FINE = MS.day;

  const announce = (clock, elapsed) => {
    if (!clock.dom.scrubSr) return;
    clock.dom.scrubSr.textContent = joinUnits(parts(elapsed), effectiveUnits(clock), 'long');
    clock.dom.scrubSr.setAttribute('aria-live', 'polite');
    setTimeout(() => clock.dom.scrubSr.setAttribute('aria-live', 'off'), 1000);
  };

  // Behaviours are wired once per node and read clock.hover at event time,
  // rather than being attached only for the mode configured at build. That is
  // what lets data-since-hover change on a live element: there is no listener
  // to remove, only a mode to re-read. Same reason the role/tabIndex below is
  // applied as state rather than set once.
  const applyHoverRole = (clock) => {
    const node = clock.node;
    if (clock.hover === 'scrub') {
      node.tabIndex = 0;
      node.setAttribute('role', 'slider');
      node.setAttribute('aria-label', 'Scrub elapsed time');
    } else {
      node.removeAttribute('role');
      node.removeAttribute('aria-label');
      if (node.tabIndex === 0 && !node.hasAttribute('tabindex')) node.tabIndex = -1;
      node.removeAttribute('tabindex');
    }
  };

  const wireBehaviors = (clock) => {
    const node = clock.node;

    node.addEventListener('mouseenter', () => { if (clock.hover === 'reveal') startReveal(clock); });
    node.addEventListener('mouseleave', () => { if (clock.hover === 'reveal') stopReveal(clock); });
    node.addEventListener('focusin', () => { if (clock.hover === 'reveal') startReveal(clock); });
    node.addEventListener('focusout', () => { if (clock.hover === 'reveal') stopReveal(clock); });

    const scrubTo = (elapsed) => {
      clock.scrubElapsed = Math.max(0, Math.min(Date.now() - clock.start, elapsed));
      paint(clock);
    };
    const release = () => {
      if (clock.scrubElapsed == null) return;
      const at = clock.scrubElapsed;
      clock.scrubElapsed = null;
      paint(clock);
      announce(clock, at);
    };

    /* Tap and drag share one pointer on this element: a scrub clock that also
       opens something on click cannot decide which it is at pointerdown. So
       pointerdown decides nothing — it arms, and the first movement past
       TAP_SLOP is what commits to scrubbing. Under the slop the gesture stays
       a tap and the element's own click handler (the studio's, or a
       consumer's) fires untouched. */
    const TAP_SLOP = 6;
    let armed = false, dragging = false, originX = 0;

    const at = (clientX) => {
      const rect = node.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return frac * (Date.now() - clock.start);
    };

    node.addEventListener('pointerdown', (e) => {
      if (clock.hover !== 'scrub') return;
      armed = true;
      originX = e.clientX;
    });
    node.addEventListener('pointermove', (e) => {
      if (!armed) return;
      if (!dragging) {
        if (Math.abs(e.clientX - originX) < TAP_SLOP) return;
        dragging = true;
        node.setPointerCapture(e.pointerId);
        scrubTo(at(originX));
      }
      scrubTo(at(e.clientX));
    });
    const endDrag = () => { armed = false; dragging = false; release(); };
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);

    node.addEventListener('keydown', (e) => {
      if (clock.hover !== 'scrub') return;
      const now = Date.now() - clock.start;
      const base = clock.scrubElapsed != null ? clock.scrubElapsed : now;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const step = e.shiftKey ? SCRUB_STEP_FINE : SCRUB_STEP;
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        scrubTo(base + dir * step);
        e.preventDefault();
      } else if (e.key === 'Home') {
        scrubTo(0);
        e.preventDefault();
      } else if (e.key === 'End' || e.key === 'Escape') {
        release();
        e.preventDefault();
      }
    });
    node.addEventListener('blur', release);
  };

  // ---- mount / init -------------------------------------------------------

  // Shells whose seconds column is a structurally different element (a wheel)
  // depending on whether motion is currently allowed — these need their DOM
  // rebuilt on a live prefers-reduced-motion change. dial/strata read
  // isContinuous() per frame instead of building different DOM, so they never
  // need this; rail/odometer bake the choice into buildWheel() vs a step
  // column at build time.
  const WHEEL_SHELLS = new Set(['rail', 'odometer']);

  const initClock = (clock) => {
    stopReveal(clock);
    BUILDERS[clock.shell](clock);
    clock.dom.root.style.position = 'relative';
    if (clock.hover === 'reveal') clock.dom.reveal = buildRevealOverlay(clock.dom.root);
    if (clock.hover === 'scrub') {
      const sr = srNode('since__sr');
      sr.setAttribute('aria-live', 'off');
      clock.dom.root.appendChild(sr);
      clock.dom.scrubSr = sr;
    }
    applyHoverRole(clock);
    clock.last = null;
    clock.target.textContent = '';
    clock.target.appendChild(clock.dom.root);
    if (clock.behaviorsWired) return;
    clock.behaviorsWired = true;
    wireBehaviors(clock);
  };

  // Numerals rise into place from a mask, once, on first real paint. Never
  // again — a clock that replays its own entrance every time you look at it
  // has stopped telling the time and started performing.
  const mount = (clock) => {
    if (clock.mounted || motionReduced()) { clock.mounted = true; return; }
    clock.mounted = true;
    clock.dom.root.classList.add('since-mount');
    clock.dom.root.addEventListener('animationend', () => clock.dom.root.classList.remove('since-mount'), { once: true });
  };

  // ---- render, one function per shell -------------------------------------

  const renderBare = (clock, elapsed) => {
    const text = joinUnits(parts(elapsed), effectiveUnits(clock), clock.labels);
    if (text === clock.last) return;
    clock.last = text;
    clock.dom.text.textContent = text;
  };

  const renderRail = (clock, elapsed) => {
    const p = parts(elapsed);
    const staticUnits = effectiveUnits(clock).filter((u) => u !== 'seconds' || !clock.dom.wheel);
    const text = joinUnits(p, staticUnits, clock.labels);
    if (text !== clock.last) { clock.last = text; clock.dom.text.textContent = text; }
    if (clock.dom.wheel) {
      const secondsFloat = (elapsed % MS.minute) / MS.second;
      clock.dom.wheel.strip.style.transform = `translateY(${(-secondsFloat + 0.2).toFixed(3)}em)`;
      const sr = joinUnits(p, effectiveUnits(clock), 'long');
      if (sr !== clock.dom.wheel.sr.textContent) clock.dom.wheel.sr.textContent = sr;
    }
  };

  const renderOdometer = (clock, elapsed) => {
    const p = parts(elapsed);
    let srChanged = false;
    for (const u in clock.dom.cols) {
      const c = clock.dom.cols[u];
      if (c.flow) {
        const secondsFloat = (elapsed % MS.minute) / MS.second;
        c.strip.style.transform = `translateY(${(-secondsFloat + 0.2).toFixed(3)}em)`;
      } else {
        const text = u === 'days' ? String(p.days) : pad(p[u]);
        flipUpdate(c.col, text);
      }
      srChanged = true;
    }
    if (srChanged) {
      const sr = joinUnits(p, effectiveUnits(clock), 'long');
      if (sr !== clock.dom.sr.textContent) clock.dom.sr.textContent = sr;
    }
  };

  const renderDial = (clock, elapsed) => {
    const p = parts(elapsed);
    const text = joinUnits(p, effectiveUnits(clock).filter((u) => u !== 'seconds'), clock.labels) || joinUnits(p, ['seconds'], clock.labels);
    if (text !== clock.last) { clock.last = text; clock.dom.text.textContent = text; }
    const secondsFloat = isContinuous(clock) ? (elapsed % MS.minute) / MS.second : p.seconds;
    const frac = secondsFloat / 60;
    clock.dom.sweep.style.strokeDashoffset = String(RING_C * (1 - frac));
  };

  const renderStrata = (clock, elapsed) => {
    const p = parts(elapsed);
    const units = effectiveUnits(clock);
    const head = joinUnits(p, [units[0]], clock.labels);
    if (head !== clock.last) { clock.last = head; clock.dom.head.textContent = head; }
    for (const u in clock.dom.bars) {
      const cap = UNIT_CAP[u];
      const value = u === 'seconds' && isContinuous(clock) ? (elapsed % MS.minute) / MS.second : p[u];
      const frac = Math.min(1, value / cap);
      clock.dom.bars[u].style.width = `${(frac * 100).toFixed(2)}%`;
    }
  };

  const RENDER = { bare: renderBare, rail: renderRail, odometer: renderOdometer, dial: renderDial, strata: renderStrata };

  const paint = (clock) => {
    if (!clock.dom) { initClock(clock); mount(clock); }
    const elapsed = clock.scrubElapsed != null ? clock.scrubElapsed : Date.now() - clock.start;

    RENDER[clock.shell](clock, elapsed);

    // The beat: the one real event this clock has. Marking it is the
    // difference between a readout and an instrument. Suppressed while
    // scrubbing — a beat that fires while you are dragging through history
    // reads as a glitch, not a tick.
    if (clock.scrubElapsed == null && !motionReduced()) {
      const boundary = Math.floor(elapsed / MS.minute);
      if (clock.minuteBoundary !== null && boundary !== clock.minuteBoundary) pulse(clock.dom.beat);
      clock.minuteBoundary = boundary;
    }
  };

  // ---- scheduling: unchanged shape from the original file -----------------

  let running = false;
  let reducedTimer = 0;
  let live = clocks.slice();
  const refreshLive = () => { live = clocks.filter((clock) => clock.visible); };

  const anyContinuous = () => live.some((clock) => isContinuous(clock));

  const scheduleReduced = () => {
    clearTimeout(reducedTimer);
    if (document.hidden || !live.length) return;
    const now = Date.now();
    const untilNextMinute = Math.min(...live.map((clock) => {
      const elapsed = Math.max(0, now - clock.start);
      return MS.minute - (elapsed % MS.minute);
    }));
    reducedTimer = setTimeout(() => {
      for (const clock of live) paint(clock);
      scheduleReduced();
    }, Math.max(50, untilNextMinute + 16));
  };

  const frame = () => {
    if (document.hidden || !live.length) { running = false; return; }
    for (const clock of live) paint(clock);
    if (!anyContinuous()) {
      // Nothing on screen needs a frame more often than once a second/minute;
      // fall back to a coarse timer so an all-bare page costs nothing idle.
      running = false;
      scheduleReduced();
      return;
    }
    requestAnimationFrame(frame);
  };

  const wake = () => {
    if (running) return;
    clearTimeout(reducedTimer);
    running = true;
    requestAnimationFrame(frame);
  };

  /* Parking. A clock nobody is looking at is a rAF loop keeping a laptop fan
     on for no reason. Coming back does not need a catch-up pass, because
     there is nothing to catch up — the next computed frame is simply right. */
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const clock = clocks.find((c) => c.node === entry.target);
        if (clock && clock.visible !== entry.isIntersecting) {
          clock.visible = entry.isIntersecting;
          changed = true;
        }
      }
      if (changed) refreshLive();
      wake();
    }, { rootMargin: '64px' });
    for (const clock of clocks) io.observe(clock.node);
  }

  document.addEventListener('visibilitychange', () => {
    refreshLive();
    if (document.hidden) clearTimeout(reducedTimer);
    else wake();
  });
  const motionChanged = () => {
    for (const clock of clocks) {
      clock.last = null;
      clock.lastTick = null;
      // rail/odometer build a structurally different DOM (a wheel vs a step
      // column) depending on whether motion is currently allowed. Rebuild
      // explicitly here, on the event that actually changed the answer,
      // rather than diffing it inside the per-frame paint — a wheel spinning
      // in front of someone who just asked for stillness is the one failure
      // this file exists to prevent.
      if (clock.dom && WHEEL_SHELLS.has(clock.shell)) initClock(clock);
    }
    wake();
  };
  reduced.addEventListener('change', motionChanged);
  addEventListener('khushin:motionchange', motionChanged);

  /* ---- live reconfiguration ---------------------------------------------

     This file used to read every data-since-* attribute exactly once, at
     load, and never again. Two consequences, which are really one missing
     capability: a clock inserted by a framework after hydration never
     started, and an attribute changed on a running clock did nothing.
     refresh() is that capability — it registers clocks it has not seen and
     re-reads configuration on the ones it has, rebuilding only what actually
     changed. Explicit rather than a MutationObserver: a component this small
     should not run an observer over a stranger's document for a case most
     pages never hit.

     What it deliberately does not do is re-mount. The entrance plays once
     per element, ever. A shell swapped underneath a running clock must show
     the correct reading in its first painted frame — no rise, no fade, no
     zero — because the whole argument of this file is that the number
     survives whatever happens to the object drawn around it. An entrance
     replayed on every change would be the component contradicting itself in
     public. */
  const CONFIG_KEYS = ['shell', 'precision', 'labels', 'hover'];

  const refresh = () => {
    for (const node of document.querySelectorAll('[data-since]')) register(node);

    for (const clock of clocks) {
      const next = parseConfig(clock.node);
      let changed = CONFIG_KEYS.some((k) => clock[k] !== next[k])
        || next.units.join() !== clock.units.join();

      // The epoch itself is configuration too. Moving it is the one change
      // that legitimately resets the beat: there is no longer any relationship
      // between the minute boundary just crossed and the one coming.
      const start = Date.parse(clock.node.dataset.since);
      if (Number.isFinite(start) && start !== clock.start) {
        clock.start = start;
        clock.minuteBoundary = null;
        changed = true;
      }

      if (!changed) continue;
      Object.assign(clock, next);
      if (clock.dom) initClock(clock);
      paint(clock);
    }

    refreshLive();
    wake();
  };

  // The only global this file defines. `clocks` is exposed read-mostly so a
  // host page can see what was upgraded; `refresh` is the supported API.
  window.SinceClock = { refresh, clocks };

  // Paint once immediately, so the upgrade from the static fallback happens in
  // the first frame rather than up to a second later.
  for (const clock of clocks) paint(clock);
  wake();
})();
