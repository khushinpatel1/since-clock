import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../since-clock.js', import.meta.url), 'utf8');

class FakeNode {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this._text = text;
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  get innerHTML() {
    return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text;
  }

  set innerHTML(value) {
    this._text = String(value);
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    if (index < 0) return this.appendChild(child);
    this.children.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  cloneNode() {
    const clone = new FakeNode(this.tagName, { ...this.attributes }, this._text);
    clone.className = this.className;
    return clone;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  querySelector(selector) {
    if (selector === '[data-since-value]') {
      return this.children.find((child) => child.hasAttribute('data-since-value'))
        || this.children.map((child) => child.querySelector(selector)).find(Boolean)
        || null;
    }
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return (this.className || '').split(/\s+/).includes(className)
        ? this
        : this.children.map((child) => child.querySelector(selector)).find(Boolean)
          || null;
    }
    return null;
  }

  addEventListener() {}
  removeEventListener() {}
  animate() { return { cancel() {} }; }
}

const makeClock = (epoch, attrs = {}, fallback = 'since the beginning') => {
  const value = new FakeNode('span', { 'data-since-value': '' }, fallback);
  return new FakeNode('time', { 'data-since': epoch, ...attrs }, '').appendChild(value).parentNode;
};

const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);

const run = ({ now, reduced = false, nodes }) => {
  const RealDate = Date;
  let currentNow = now;
  class FixedDate extends RealDate {
    static now() { return currentNow; }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  }
  const document = {
    hidden: false,
    documentElement: new FakeNode('html'),
    querySelectorAll(selector) { return selector === '[data-since]' ? nodes : []; },
    createElement(tag) { return new FakeNode(tag); },
    createElementNS(_namespace, tag) { return new FakeNode(tag); },
    addEventListener() {},
  };
  const delays = [];
  const context = {
    Date: FixedDate,
    Intl,
    document,
    window: {},
    console,
    matchMedia() { return { matches: reduced, addEventListener() {} }; },
    addEventListener() {},
    requestAnimationFrame(callback) { callback(); },
    setTimeout(_callback, delay) { delays.push(delay); return delays.length; },
    clearTimeout() {},
    clearInterval() {},
  };
  vm.runInNewContext(source, context, { filename: 'since-clock.js' });
  return { context, delays, setNow(value) { currentNow = value; } };
};

const now = Date.parse('2026-08-09T12:00:00Z');
const noClocks = run({ now, nodes: [] });
assert.equal(typeof noClocks.context.window.SinceClock.refresh, 'function', 'refresh is available even with no clocks');

const past = makeClock('2026-08-07T08:03:04Z');
const future = makeClock('2026-08-10T12:00:00Z', {}, 'starts tomorrow');
const preservedTabStop = makeClock('2026-08-07T08:03:04Z', { tabindex: '0' });
const baseline = run({ now, nodes: [past, future, preservedTabStop] });
assert.equal(past.dataset.sinceLive, 'on');
assert.equal(past.querySelector('[data-since-value]').textContent, '2 days 03:56:56');
assert.equal(future.dataset.sinceLive, undefined, 'future epochs keep their authored fallback');
assert.equal(future.querySelector('[data-since-value]').textContent, 'starts tomorrow');
assert.equal(preservedTabStop.getAttribute('tabindex'), '0', 'normal clocks do not steal a host tab stop');
assert.ok(baseline.delays[0] >= 50 && baseline.delays[0] < 1100, 'plain second-precision clocks use a one-second cadence');

const futureOnly = makeClock('2026-08-10T12:00:00Z', {}, 'starts tomorrow');
const futureRun = run({ now, nodes: [futureOnly] });
assert.equal(futureRun.context.window.SinceClock.clocks.length, 0, 'future clocks are not registered early');
futureRun.setNow(Date.parse('2026-08-10T12:00:01Z'));
futureRun.context.window.SinceClock.refresh();
assert.equal(futureOnly.dataset.sinceLive, 'on', 'a future clock becomes live after refresh');
assert.equal(futureRun.context.window.SinceClock.clocks.length, 1, 'refresh does not duplicate a newly live clock');
futureRun.context.window.SinceClock.refresh();
assert.equal(futureRun.context.window.SinceClock.clocks.length, 1, 'repeated refresh keeps one registration');

const insertedNodes = [makeClock('2026-08-07T08:03:04Z')];
const insertedRun = run({ now, nodes: insertedNodes });
const lateClock = makeClock('2026-08-08T08:03:04Z');
insertedNodes.push(lateClock);
insertedRun.context.window.SinceClock.refresh();
assert.equal(lateClock.dataset.sinceLive, 'on', 'refresh registers a clock inserted after load');
assert.equal(insertedRun.context.window.SinceClock.clocks.length, 2, 'inserted clocks share the existing registration set');

const invalidated = makeClock('2026-08-07T08:03:04Z', {}, 'authored fallback');
const invalidatedRun = run({ now, nodes: [invalidated] });
invalidated.setAttribute('data-since', 'whenever');
invalidatedRun.context.window.SinceClock.refresh();
assert.equal(invalidated.dataset.sinceLive, undefined, 'invalid reconfiguration deactivates a live clock');
assert.equal(invalidated.querySelector('[data-since-value]').textContent, 'authored fallback', 'invalid reconfiguration restores fallback copy');
invalidated.setAttribute('data-since', '2026-08-07T08:03:04Z');
invalidatedRun.context.window.SinceClock.refresh();
assert.equal(invalidated.dataset.sinceLive, 'on', 'a deactivated clock can become live again');

const hostInteraction = makeClock('2026-08-07T08:03:04Z', {
  'data-since-hover': 'scrub', tabindex: '4', role: 'group', 'aria-label': 'Host time',
});
const hostRun = run({ now, nodes: [hostInteraction] });
assert.equal(hostInteraction.getAttribute('role'), 'slider');
assert.equal(hostInteraction.getAttribute('aria-label'), 'Scrub elapsed time');
hostInteraction.setAttribute('data-since-hover', 'reveal');
hostRun.context.window.SinceClock.refresh();
assert.equal(hostInteraction.getAttribute('role'), 'group', 'host role is restored after hover reconfiguration');
assert.equal(hostInteraction.getAttribute('aria-label'), 'Host time', 'host ARIA label is restored after hover reconfiguration');
assert.equal(hostInteraction.getAttribute('tabindex'), '4', 'host tab stop survives hover reconfiguration');
hostInteraction.setAttribute('data-since-hover', 'scrub');
hostInteraction.setAttribute('data-since', '2026-08-10T12:00:00Z');
hostRun.context.window.SinceClock.refresh();
assert.equal(hostInteraction.getAttribute('role'), 'group', 'future deactivation restores host role');
assert.equal(hostInteraction.getAttribute('aria-label'), 'Host time', 'future deactivation restores host label');
assert.equal(hostInteraction.getAttribute('tabindex'), '4', 'future deactivation preserves host tab stop');

const ownedInteraction = makeClock('2026-08-07T08:03:04Z', { 'data-since-hover': 'scrub' });
const ownedRun = run({ now, nodes: [ownedInteraction] });
assert.equal(ownedInteraction.getAttribute('tabindex'), '0');
ownedInteraction.removeAttribute('data-since-hover');
ownedRun.context.window.SinceClock.refresh();
assert.equal(ownedInteraction.getAttribute('tabindex'), null, 'component-owned tab stop is removed when scrub ends');

const odometer = makeClock('2026-08-07T08:03:04Z', { 'data-since-shell': 'odometer' });
const dial = makeClock('2026-08-07T08:03:04Z', { 'data-since-shell': 'dial' });
const strata = makeClock('2026-08-07T08:03:04Z', { 'data-since-shell': 'strata' });
run({ now, reduced: true, nodes: [odometer, dial, strata] });
const odometerDecor = descendants(odometer).filter((node) => node.getAttribute('aria-hidden') === 'true');
const dialDecor = descendants(dial).filter((node) => node.getAttribute('aria-hidden') === 'true');
const strataDecor = descendants(strata).filter((node) => node.getAttribute('aria-hidden') === 'true');
assert.ok(odometerDecor.length >= 5, 'odometer columns and separators are decorative');
assert.ok(dialDecor.some((node) => node.tagName === 'SVG'), 'dial ring is decorative');
assert.ok(strataDecor.length >= 2, 'strata bars are decorative');

const dstEpoch = '2026-03-08T01:30:00-08:00';
const dstNow = Date.parse('2026-03-09T01:30:00-07:00');
const acrossDst = makeClock(dstEpoch);
run({ now: dstNow, nodes: [acrossDst] });
assert.equal(acrossDst.querySelector('[data-since-value]').textContent, '0 days 23:00:00', 'elapsed time follows the real offset change');

const reduced = makeClock('2026-08-07T08:55:55Z');
const reducedRun = run({ now, reduced: true, nodes: [reduced] });
assert.equal(reduced.querySelector('[data-since-value]').textContent, '2 days 03:04', 'reduced motion keeps the clock live at minute precision');
assert.ok(reducedRun.delays[0] >= 50 && reducedRun.delays[0] < 60050, 'reduced motion uses a minute cadence');

const reducedSecondsOnly = makeClock('2026-08-09T11:57:00Z', { 'data-since-units': 'seconds' });
run({ now, reduced: true, nodes: [reducedSecondsOnly] });
assert.equal(reducedSecondsOnly.querySelector('[data-since-value]').textContent, '3 minutes', 'seconds-only clocks have a useful reduced-motion fallback');

console.log('since-clock time tests: past, future, DST, reduced motion, and host focus state pass');
