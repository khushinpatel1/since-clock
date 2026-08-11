/* since-studio — the console that opens out of the clock.

   Optional. Opt-in. Not the component. A page adds data-since-studio to a
   clock it wants configurable, loads this file and studio.css, and gets a
   console; every other clock on every other page is untouched, which is the
   only way to add this to something strangers have already embedded.

   ── what it is doing ─────────────────────────────────────────────────────

   1. Wraps each studio clock in a seat and a plate. The plate is what the
      motion effects decorate; the clock inside it is stock.
   2. On click, FLIPs the plate out of the seat and into a full-screen
      console — measure, move, measure, animate the difference away. The
      clock node is never replaced, never re-created and never re-mounted, so
      it does not stop, blink, or show a zero at any point in the transition.
      That is not a nicety. A configurator for a component whose entire claim
      is "no frame it paints is ever wrong" cannot make it paint a wrong
      frame while you configure it.
   3. Writes configuration back as the same data-since-* attributes a
      consumer would type by hand, then calls SinceClock.refresh(). Nothing
      here reaches inside the engine — the console drives the component
      through its public surface, which is also how it stays honest about
      what that surface can do.
   4. Emits the markup you would paste, and a permalink that encodes the
      whole configuration in the URL. That is the payload. A configurator
      that cannot hand you its result is a toy.

   Effects are adapted from motion-kit (khushinpatel1/motion-kit, MIT, same
   author). See studio.css for the one rule governing which of them are
   allowed near the numerals.
*/

(() => {
  const PALETTES = [
    { name: 'ember', accent: '#c81e3a', ink: '#f4f4f5' },
    { name: 'signal', accent: '#22c55e', ink: '#ecfdf5' },
    { name: 'cyan', accent: '#06b6d4', ink: '#ecfeff' },
    { name: 'violet', accent: '#7c3aed', ink: '#f5f3ff' },
    { name: 'amber', accent: '#f59e0b', ink: '#fffbeb' },
    { name: 'paper', accent: '#111827', ink: '#f5f4f2' },
    { name: 'neutral', accent: '#737373', ink: '#f5f5f5' },
  ];
  window.SinceStudioPalettes = PALETTES;
  const roots = document.querySelectorAll('[data-since-studio]');
  if (!roots.length) return;

  const html = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const hoverable = matchMedia('(hover: hover)');

  // One helper, matching the engine's: the OS asked, unless the reader has
  // overridden it on this page.
  const stilled = () => html.dataset.motion !== 'allow' && mq.matches;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---- configuration model ------------------------------------------------

  const SHELLS = ['bare', 'rail', 'odometer', 'dial', 'strata'];
  const UNITS = ['days', 'hours', 'minutes', 'seconds'];
  const PRECISION = ['flow', 'seconds', 'minutes'];
  const LABELS = ['long', 'short', 'none'];
  const HOVER = ['none', 'reveal', 'scrub'];

  /* The nine element-tier effects. Each is a motion-kit effect adapted to an
     inline measurement rather than a marketing card; `still` marks the ones
     that are pure continuous animation and therefore genuinely have nothing
     to show under reduced motion. spotlight and tilt are not marked: they
     track a pointer that is already moving, which is not the same thing as
     motion the page started on its own — the kit makes that distinction too,
     and it is why cursor-spotlight-card keeps working under reduce and
     dimensional-tilt-card does not. */
  const FX = [
    { id: 'aurora', name: 'aurora', from: 'aurora-glass', still: true },
    { id: 'spotlight', name: 'spotlight', from: 'cursor-spotlight-card', still: false },
    { id: 'tilt', name: 'tilt', from: 'dimensional-tilt-card', still: true },
    { id: 'sheen', name: 'sheen', from: 'dimensional-tilt-card', still: true },
    { id: 'grain', name: 'grain', from: 'noise-grain-overlay', still: false },
    { id: 'float', name: 'float', from: 'floating-card', still: true },
    { id: 'shimmer', name: 'shimmer', from: 'shimmer-text', still: true },
    { id: 'pulse', name: 'beat rings', from: 'pulse-ring', still: true },
    { id: 'trail', name: 'trail', from: 'particle-cursor-trail', still: true },
  ];

  const PROPS = [
    { key: 'accent', prop: '--since-accent', type: 'color', value: '#c81e3a' },
    { key: 'ink', prop: '--since-ink', type: 'color', value: '#f4f4f5' },
    // `live` exists only for size. The console needs to scale the clock up
    // when it opens, and an inline --since-size would outrank any stylesheet
    // rule trying to. So the slider writes --studio-size, the stylesheet
    // derives --since-size from it, and the stage is free to multiply. The
    // copied markup still says --since-size, because that is the property a
    // consumer actually sets.
    { key: 'size', prop: '--since-size', live: '--studio-size', type: 'range', unit: 'em', min: 0.8, max: 4, step: 0.05, value: 1.6 },
    { key: 'gap', prop: '--since-gap', type: 'range', unit: 'em', min: 0, max: 1.2, step: 0.05, value: 0.35 },
    { key: 'radius', prop: '--since-radius', type: 'range', unit: 'em', min: 0, max: 1, step: 0.02, value: 0.2 },
    { key: 'duration', prop: '--since-duration', type: 'range', unit: 'ms', min: 0, max: 900, step: 10, value: 300 },
  ];

  const defaults = (node) => {
    const computed = getComputedStyle(node);
    const readProp = (p) => {
      const value = computed.getPropertyValue(p.prop).trim();
      if (!value) return p.value;
      if (p.type === 'range') {
        const match = value.match(new RegExp(`^(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))${p.unit}$`));
        return match ? Number(match[1]) : p.value;
      }
      return value;
    };
    const units = node.dataset.sinceUnits
      ? node.dataset.sinceUnits.split(',').map((u) => u.trim()).filter((u) => UNITS.includes(u))
      : UNITS.slice();

    return {
      epoch: node.dataset.since,
      shell: SHELLS.includes(node.dataset.sinceShell) ? node.dataset.sinceShell : 'rail',
      units: units.length ? units : UNITS.slice(),
      precision: PRECISION.includes(node.dataset.sincePrecision) ? node.dataset.sincePrecision : 'flow',
      labels: LABELS.includes(node.dataset.sinceLabels) ? node.dataset.sinceLabels : 'long',
      hover: HOVER.includes(node.dataset.sinceHover) ? node.dataset.sinceHover : 'none',
      props: Object.fromEntries(PROPS.map((p) => [p.key, readProp(p)])),
      fx: new Set(['aurora', 'grain', 'spotlight']),
    };
  };

  // ---- permalink ----------------------------------------------------------

  /* Readable rather than compact. A packed base64 blob would be shorter and
     would also make the URL a thing only this page can produce — someone who
     wants a cyan dial should be able to type one. */
  const encode = (s) => {
    const q = new URLSearchParams();
    q.set('shell', s.shell);
    q.set('units', s.units.join(','));
    q.set('precision', s.precision);
    q.set('labels', s.labels);
    q.set('hover', s.hover);
    q.set('epoch', s.epoch);
    for (const p of PROPS) if (String(s.props[p.key]) !== String(p.value)) q.set(p.key, s.props[p.key]);
    q.set('fx', [...s.fx].join(',') || 'none');
    return q.toString();
  };

  const decode = (s, hash) => {
    const q = new URLSearchParams(hash.replace(/^#/, ''));
    if (!q.has('shell') && !q.has('fx')) return false;
    if (SHELLS.includes(q.get('shell'))) s.shell = q.get('shell');
    if (PRECISION.includes(q.get('precision'))) s.precision = q.get('precision');
    if (LABELS.includes(q.get('labels'))) s.labels = q.get('labels');
    if (HOVER.includes(q.get('hover'))) s.hover = q.get('hover');
    const u = (q.get('units') || '').split(',').filter((x) => UNITS.includes(x));
    if (u.length) s.units = u;
    // An epoch from a URL is a stranger's input: parse it before trusting it,
    // for the same reason the engine refuses to render an unparseable one.
    const ep = q.get('epoch');
    if (ep && Number.isFinite(Date.parse(ep))) s.epoch = ep;
    for (const p of PROPS) if (q.has(p.key)) s.props[p.key] = q.get(p.key);
    if (q.has('fx')) {
      const list = q.get('fx').split(',').filter((x) => FX.some((f) => f.id === x));
      s.fx = new Set(list);
    }
    return true;
  };

  // ---- one studio instance ------------------------------------------------

  const mount = (clockNode) => {
    const state = defaults(clockNode);
    decode(state, location.hash);

    // -- structure
    const seat = el('span', 'studio-seat');
    const plate = el('span', 'studio-plate');
    const grain = el('span', 'studio-grain');
    grain.setAttribute('aria-hidden', 'true');
    clockNode.parentNode.insertBefore(seat, clockNode);
    plate.appendChild(clockNode);
    plate.appendChild(grain);
    seat.appendChild(plate);
    const hint = el('span', 'studio-seat__hint', 'click to configure');
    hint.setAttribute('aria-hidden', 'true');
    seat.appendChild(hint);

    seat.tabIndex = 0;
    seat.setAttribute('role', 'button');
    seat.setAttribute('aria-expanded', 'false');
    seat.setAttribute('aria-label', 'Configure this clock');

    // -- apply
    const applyClock = () => {
      const d = clockNode.dataset;
      d.since = state.epoch;
      d.sinceShell = state.shell;
      d.sinceUnits = state.units.join(',');
      d.sincePrecision = state.precision;
      d.sinceLabels = state.labels;
      if (state.hover === 'none') delete d.sinceHover; else d.sinceHover = state.hover;
      // The public API, not a private hook. If this call cannot express a
      // change, the component cannot either, and that is worth finding out
      // here rather than in someone else's page.
      if (window.SinceClock) window.SinceClock.refresh();
    };

    /* Both of these write to the plate rather than the seat, and that is not
       cosmetic: the plate is what travels into the console during the FLIP,
       so anything set on the seat would silently stop applying the moment
       the console opened — the clock would lose its colour and every effect
       at once, exactly when the reader is looking hardest at it. Whatever
       styles the clock has to live on the thing the clock is inside. */
    const applyProps = () => {
      for (const p of PROPS) {
        plate.style.setProperty(p.live || p.prop, `${state.props[p.key]}${p.unit || ''}`);
      }
      plate.style.setProperty('--studio-edge-hi', state.props.accent);
      seat.style.setProperty('--studio-edge-hi', state.props.accent);
    };

    const applyFx = () => {
      plate.dataset.fx = [...state.fx].join(' ');
    };

    const markup = () => {
      const attrs = [`datetime="${state.epoch}"`, `data-since="${state.epoch}"`];
      if (state.shell !== 'bare') attrs.push(`data-since-shell="${state.shell}"`);
      if (state.units.join(',') !== UNITS.join(',')) attrs.push(`data-since-units="${state.units.join(',')}"`);
      if (state.precision !== 'seconds') attrs.push(`data-since-precision="${state.precision}"`);
      if (state.labels !== 'long') attrs.push(`data-since-labels="${state.labels}"`);
      if (state.hover !== 'none') attrs.push(`data-since-hover="${state.hover}"`);
      const changed = PROPS.filter((p) => String(state.props[p.key]) !== String(p.value));
      const style = changed.length
        ? `<style>\n  .my-clock {\n${changed.map((p) => `    ${p.prop}: ${state.props[p.key]}${p.unit || ''};`).join('\n')}\n  }\n</style>\n\n`
        : '';
      return `${style}<time class="my-clock"\n      ${attrs.join('\n      ')}>\n  <span data-since-value>since ${new Date(state.epoch).toLocaleDateString()}</span>\n</time>`;
    };

    let out = null, link = null;
    const sync = ({ clock = true } = {}) => {
      if (clock) applyClock();
      applyProps();
      applyFx();
      if (out) out.textContent = markup();
      const q = new URLSearchParams(encode(state));
      const display = new URLSearchParams(location.hash.replace(/^#/, ''));
      for (const key of ['appearance', 'theme']) if (display.has(key)) q.set(key, display.get(key));
      history.replaceState(null, '', `#${q}`);
      if (link) link.value = `${location.origin}${location.pathname}#${q}`;
      renderChips();
    };

    // ---- the console -----------------------------------------------------

    let scrim = null, panel = null, stage = null, consoleEl = null, open = false;
    let focusables = [];
    let chipRenderers = [];
    let syncInputs = () => {};
    const renderChips = () => chipRenderers.forEach((f) => f());

    /* magnetic-action-button, adapted: the kit's version pulls a large CTA
       toward the pointer. Here the targets are 28px chips, so the pull is a
       third of the kit's and capped hard — a chip that outruns the cursor is
       a chip you cannot click. */
    const magnetic = (btn) => {
      if (!hoverable.matches) return;
      btn.addEventListener('pointermove', (e) => {
        if (stilled()) return;
        const r = btn.getBoundingClientRect();
        const dx = Math.max(-6, Math.min(6, (e.clientX - (r.left + r.width / 2)) * 0.3));
        const dy = Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) * 0.3));
        btn.style.setProperty('--mx', `${dx}px`);
        btn.style.setProperty('--my', `${dy}px`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    };

    const group = (title, i) => {
      const g = el('div', 'studio-group');
      g.style.setProperty('--i', String(i));
      g.appendChild(el('h3', null, title));
      return g;
    };

    const chipRow = (values, get, set, labelFor) => {
      const wrap = el('div', 'studio-chips');
      const btns = values.map((v) => {
        const b = el('button', 'studio-chip', labelFor ? labelFor(v) : v);
        b.type = 'button';
        b.addEventListener('click', () => { set(v); sync(); });
        magnetic(b);
        wrap.appendChild(b);
        return [b, v];
      });
      chipRenderers.push(() => {
        for (const [b, v] of btns) b.setAttribute('aria-pressed', String(get() === v));
      });
      return wrap;
    };

    const buildPanel = () => {
      const p = el('div', 'studio-panel');
      let i = 0;

      // shell — card-fan-deck's "pick one from a spread" idea, flattened to
      // chips because five words beat five cards on a phone.
      const gShell = group('shell', i++);
      gShell.appendChild(chipRow(SHELLS, () => state.shell, (v) => { state.shell = v; }));
      gShell.appendChild(el('p', 'studio-note',
        'The engine does not change between these. Every shell is reading the same Date.now() - start, which is why switching one mid-second does not disturb the number.'));
      p.appendChild(gShell);

      // reading
      const gRead = group('reading', i++);
      const uRow = el('div', 'studio-row');
      uRow.appendChild(el('label', null, 'units'));
      const uChips = el('div', 'studio-chips');
      const uBtns = UNITS.map((u) => {
        const b = el('button', 'studio-chip', u);
        b.type = 'button';
        b.addEventListener('click', () => {
          const has = state.units.includes(u);
          // Never let the last unit be removed: a clock configured to display
          // nothing is not a configuration, it is a broken clock.
          if (has && state.units.length === 1) return;
          state.units = has ? state.units.filter((x) => x !== u) : UNITS.filter((x) => state.units.includes(x) || x === u);
          sync();
        });
        magnetic(b);
        uChips.appendChild(b);
        return [b, u];
      });
      chipRenderers.push(() => {
        for (const [b, u] of uBtns) b.setAttribute('aria-pressed', String(state.units.includes(u)));
      });
      uRow.appendChild(uChips);
      gRead.appendChild(uRow);

      const pRow = el('div', 'studio-row');
      pRow.appendChild(el('label', null, 'precision'));
      pRow.appendChild(chipRow(PRECISION, () => state.precision, (v) => { state.precision = v; }));
      gRead.appendChild(pRow);

      const lRow = el('div', 'studio-row');
      lRow.appendChild(el('label', null, 'labels'));
      lRow.appendChild(chipRow(LABELS, () => state.labels, (v) => { state.labels = v; }));
      gRead.appendChild(lRow);

      const hRow = el('div', 'studio-row');
      hRow.appendChild(el('label', null, 'hover'));
      hRow.appendChild(chipRow(HOVER, () => state.hover, (v) => { state.hover = v; }));
      gRead.appendChild(hRow);
      gRead.appendChild(el('p', 'studio-note',
        'scrub turns the clock into a slider over its own history — drag it. Tap and drag share one pointer here, so a short press stays a click and opens this panel.'));
      p.appendChild(gRead);

      // colour
      const gColour = group('colour', i++);
      const sw = el('div', 'studio-swatches');
      const swBtns = PALETTES.map((pal) => {
        const b = el('button', 'studio-swatch');
        b.type = 'button';
        b.style.background = pal.accent;
        b.title = pal.name;
        b.setAttribute('aria-label', `${pal.name} palette`);
        b.addEventListener('click', () => {
          state.props.accent = pal.accent;
          state.props.ink = pal.ink;
          syncInputs();
          sync();
        });
        sw.appendChild(b);
        return [b, pal];
      });
      chipRenderers.push(() => {
        for (const [b, pal] of swBtns) b.setAttribute('aria-pressed', String(state.props.accent === pal.accent));
      });
      gColour.appendChild(sw);

      const inputs = [];
      syncInputs = () => { for (const [inp, prop] of inputs) inp.value = state.props[prop.key]; };
      for (const prop of PROPS) {
        const row = el('div', 'studio-row');
        row.appendChild(el('label', null, prop.key));
        const input = document.createElement('input');
        input.type = prop.type;
        if (prop.type === 'range') {
          input.min = prop.min; input.max = prop.max; input.step = prop.step;
        }
        input.value = state.props[prop.key];
        input.setAttribute('aria-label', prop.prop);
        input.addEventListener('input', () => {
          state.props[prop.key] = input.value;
          sync({ clock: false });
        });
        row.appendChild(input);
        gColour.appendChild(row);
        inputs.push([input, prop]);
      }
      p.appendChild(gColour);

      // motion
      const gMotion = group('motion', i++);
      const rm = el('div', 'studio-rm');
      rm.appendChild(el('p', null,
        'Your system asks for reduced motion, so the continuous effects below are off and this clock is holding still. That is the default and it stays the default. If you want to see them anyway, on this page only:'));
      const rmBtn = el('button', null, 'show the motion anyway');
      rmBtn.type = 'button';
      rmBtn.addEventListener('click', () => {
        const on = html.dataset.motion === 'allow';
        if (on) delete html.dataset.motion; else html.dataset.motion = 'allow';
        if (on) delete html.dataset.motionOverride; else html.dataset.motionOverride = 'allow';
        rmBtn.textContent = on ? 'show the motion anyway' : 'put the stillness back';
        // The engine listens for this and rebuilds the shells whose DOM
        // differs between still and moving.
        dispatchEvent(new Event('khushin:motionchange'));
        sync({ clock: false });
      });
      rm.appendChild(rmBtn);
      gMotion.appendChild(rm);

      const fxWrap = el('div', 'studio-chips');
      const fxBtns = FX.map((f) => {
        const b = el('button', 'studio-chip', f.name);
        b.type = 'button';
        b.title = `motion-kit: ${f.from}`;
        b.addEventListener('click', () => {
          if (state.fx.has(f.id)) state.fx.delete(f.id); else state.fx.add(f.id);
          sync({ clock: false });
        });
        magnetic(b);
        fxWrap.appendChild(b);
        return [b, f];
      });
      chipRenderers.push(() => {
        const quiet = stilled();
        rm.classList.toggle('is-shown', mq.matches);
        for (const [b, f] of fxBtns) {
          b.setAttribute('aria-pressed', String(state.fx.has(f.id)));
          // Stilled options stay visible and stay selectable. The reader's
          // choice is recorded and travels in the permalink; it simply is not
          // playing right now, and the strikethrough says so.
          b.dataset.stilled = String(quiet && f.still);
        }
      });
      gMotion.appendChild(fxWrap);
      gMotion.appendChild(el('p', 'studio-note',
        'Nine effects from motion-kit, adapted. shimmer is allowed on the numerals because it changes their colour, not their content; text-scramble-hover is not, because a clock that displays random glyphs is a clock displaying readings that were never true. It dresses this panel instead.'));
      p.appendChild(gMotion);

      // epoch
      const gEpoch = group('epoch', i++);
      const eRow = el('div', 'studio-row');
      eRow.appendChild(el('label', null, 'since'));
      const eInput = document.createElement('input');
      eInput.type = 'datetime-local';
      eInput.setAttribute('aria-label', 'The instant this clock counts from');
      const toLocal = (iso) => {
        const d = new Date(iso);
        if (!Number.isFinite(d.getTime())) return '';
        const p2 = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
      };
      eInput.value = toLocal(state.epoch);
      eInput.addEventListener('input', () => {
        const t = Date.parse(eInput.value);
        if (!Number.isFinite(t)) return;
        state.epoch = new Date(t).toISOString();
        sync();
      });
      eRow.appendChild(eInput);
      gEpoch.appendChild(eRow);
      gEpoch.appendChild(el('p', 'studio-note',
        'Move it and the reading is correct in the next painted frame — there is no counter to reset, because there was never a counter. Set it in the future and the authored fallback stays until the instant passes.'));
      p.appendChild(gEpoch);

      // output — the payload
      const gOut = group('take it with you', i++);
      gOut.classList.add('studio-group--out');
      out = el('pre', 'studio-out');
      gOut.appendChild(out);
      const actions = el('div', 'studio-actions');
      link = document.createElement('input');
      link.type = 'text';
      link.readOnly = true;
      link.className = 'studio-out';
      link.style.flex = '1 1 260px';
      link.setAttribute('aria-label', 'Permalink to this clock');

      const copyBtn = (label, get) => {
        const b = el('button', 'studio-chip', label);
        b.type = 'button';
        b.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(get());
            b.textContent = 'copied';
            setTimeout(() => { b.textContent = label; }, 1200);
          } catch {
            // Clipboard is permissioned and can simply say no. Select the
            // text instead so the reader can still take it.
            b.textContent = 'select it and copy';
            setTimeout(() => { b.textContent = label; }, 1800);
          }
        });
        magnetic(b);
        return b;
      };
      actions.appendChild(copyBtn('copy markup', () => markup()));
      actions.appendChild(copyBtn('copy link', () => link.value));
      gOut.appendChild(actions);
      gOut.appendChild(link);
      gOut.appendChild(el('p', 'studio-note',
        'Paste this next to since-clock.js and since-clock.css and you have exactly what is on screen. The console is not part of that — it is this page only, and the component stays two files with no dependencies.'));
      p.appendChild(gOut);

      return p;
    };

    // ---- FLIP -------------------------------------------------------------

    const flip = (node, first, done) => {
      const last = node.getBoundingClientRect();
      const dx = first.left + first.width / 2 - (last.left + last.width / 2);
      const dy = first.top + first.height / 2 - (last.top + last.height / 2);
      const s = first.width && last.width ? first.width / last.width : 1;
      if (stilled()) { if (done) done(); return; }
      node.classList.add('is-flipping');
      /* translate/scale rather than transform, deliberately: the tilt effect
         owns `transform` on this same element, and the independent transform
         properties compose with it instead of overwriting it. The float
         effect also animates `translate`, which is why it is suspended for
         the duration by .is-flipping. */
      const anim = node.animate(
        [
          { translate: `${dx}px ${dy}px`, scale: String(s) },
          { translate: '0 0', scale: '1' },
        ],
        { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
      anim.finished.catch(() => {}).then(() => {
        node.classList.remove('is-flipping');
        if (done) done();
      });
    };

    const openConsole = () => {
      if (open) return;
      open = true;
      const first = plate.getBoundingClientRect();

      scrim = el('div', 'studio-scrim');
      consoleEl = el('div', 'studio-console');
      consoleEl.setAttribute('role', 'dialog');
      consoleEl.setAttribute('aria-modal', 'true');
      consoleEl.setAttribute('aria-label', 'Configure this clock');
      stage = el('div', 'studio-stage');
      const close = el('button', 'studio-close', 'close');
      close.type = 'button';
      close.addEventListener('click', closeConsole);
      panel = buildPanel();
      consoleEl.appendChild(stage);
      consoleEl.appendChild(panel);
      consoleEl.appendChild(close);
      document.body.appendChild(scrim);
      document.body.appendChild(consoleEl);
      focusables = [...consoleEl.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')];

      // Hold the seat's footprint so the page behind does not reflow twice.
      seat.style.minWidth = `${first.width}px`;
      seat.style.minHeight = `${first.height}px`;
      seat.classList.add('is-vacant');
      seat.setAttribute('aria-expanded', 'true');

      stage.appendChild(plate);
      flip(plate, first);
      requestAnimationFrame(() => {
        scrim.classList.add('is-open');
        consoleEl.classList.add('is-open');
      });

      sync({ clock: false });
      close.focus();
      addEventListener('keydown', onKey);
      scrim.addEventListener('click', closeConsole);
    };

    const closeConsole = () => {
      if (!open) return;
      open = false;
      removeEventListener('keydown', onKey);
      const first = plate.getBoundingClientRect();
      seat.classList.remove('is-vacant');
      seat.style.minWidth = '';
      seat.style.minHeight = '';
      seat.insertBefore(plate, seat.firstChild);
      seat.setAttribute('aria-expanded', 'false');
      flip(plate, first);
      scrim.classList.remove('is-open');
      const dead = [scrim, consoleEl];
      scrim = consoleEl = panel = stage = null;
      focusables = [];
      out = link = null;
      chipRenderers = [];
      setTimeout(() => dead.forEach((n) => n && n.remove()), stilled() ? 0 : 300);
      seat.focus();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeConsole(); }
      if (e.key !== 'Tab' || !focusables.length || !consoleEl) return;
      const current = document.activeElement;
      const index = focusables.indexOf(current);
      const atBoundary = index < 0 || !consoleEl.contains(current)
        || (e.shiftKey ? index <= 0 : index === focusables.length - 1);
      if (!atBoundary) return;
      e.preventDefault();
      focusables[e.shiftKey ? focusables.length - 1 : 0].focus();
    };

    seat.addEventListener('click', (e) => {
      // A scrub drag ends with a click on this element; the engine's tap-slop
      // means a real drag never produces one, but a click that originated on
      // the console's own controls must not re-open anything either.
      if (open) return;
      if (e.target.closest('.studio-panel, .studio-close')) return;
      openConsole();
    });
    seat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (state.hover === 'scrub' && e.key !== 'Enter') return;
        e.preventDefault();
        openConsole();
      }
    });

    // ---- element-tier effect JS ------------------------------------------

    // cursor-spotlight-card + dimensional-tilt-card share one pointer pass.
    if (hoverable.matches) {
      seat.addEventListener('pointermove', (e) => {
        const r = plate.getBoundingClientRect();
        if (state.fx.has('spotlight')) {
          plate.style.setProperty('--x', `${e.clientX - r.left}px`);
          plate.style.setProperty('--y', `${e.clientY - r.top}px`);
        }
        if (state.fx.has('tilt') && !stilled()) {
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          plate.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
          plate.style.setProperty('--ry', `${(x - 0.5) * 8}deg`);
        }
      });
      seat.addEventListener('pointerleave', () => {
        plate.style.setProperty('--rx', '0deg');
        plate.style.setProperty('--ry', '0deg');
      });
    }

    /* particle-cursor-trail, adapted. The kit's version spawns on every
       pointermove across a hero; here it is scoped to the seat and throttled
       to one particle per 40ms, because the target is a 200px object and the
       kit's rate would bury the numerals it is supposed to be decorating. */
    let lastSpark = 0;
    seat.addEventListener('pointermove', (e) => {
      if (!state.fx.has('trail') || stilled()) return;
      const now = performance.now();
      if (now - lastSpark < 40) return;
      lastSpark = now;
      const s = el('span', 'studio-spark');
      s.style.background = state.props.accent;
      document.body.appendChild(s);
      const a = s.animate(
        [
          { transform: `translate(${e.clientX}px, ${e.clientY}px) scale(1)`, opacity: 0.9 },
          { transform: `translate(${e.clientX}px, ${e.clientY + 26}px) scale(0)`, opacity: 0 },
        ],
        { duration: 620, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      a.finished.catch(() => {}).then(() => s.remove());
    });

    // ---- go ---------------------------------------------------------------

    const relay = () => { renderChips(); sync({ clock: false }); };
    mq.addEventListener('change', relay);

    sync();
    return { openConsole, closeConsole };
  };

  const studios = [...roots].map(mount);

  /* text-scramble-hover, at the only altitude where it does not lie: the
     console's own headings. See studio.css's header — the numerals are
     exempt on principle, and this is the effect finding an honest home
     rather than being dropped. */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?';
  document.addEventListener('pointerenter', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.matches('.studio-group > h3')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && html.dataset.motion !== 'allow') return;
    if (t.dataset.busy === '1') return;
    t.dataset.busy = '1';
    const text = t.dataset.text || (t.dataset.text = t.textContent);
    const chars = [...text];
    const started = performance.now();
    const dur = 420, stagger = 34;
    const tick = (now) => {
      const elapsed = now - started;
      t.textContent = chars
        .map((c, i) => {
          const p = Math.max(0, Math.min(1, (elapsed - i * stagger) / dur));
          return p < 1 && c.trim() ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : c;
        })
        .join('');
      if (elapsed < dur + chars.length * stagger) requestAnimationFrame(tick);
      else { t.textContent = text; t.dataset.busy = '0'; }
    };
    requestAnimationFrame(tick);
  }, true);

  window.SinceStudio = { studios };
})();
