#!/usr/bin/env node
// doc-gc — garbage collection for markdown gravity.
//
// Studio law says docs/ holds live work orders only: when one is done it
// becomes a line in NORTH.md and the file goes away. That law had no script
// behind it, so finished work orders accumulated and kept steering sessions
// months after they closed. This is the script.
//
// The model is reachability. NORTH.md is the only root of gravity in a repo.
// A markdown file is LIVE only if something alive points at it — NORTH.md,
// a permanent file, real source code, or another live doc. Nothing else has
// standing. A doc nothing points at is an ORPHAN: it still influences any
// session that stumbles into it, but no one decided it should.
//
// It never deletes on its own. `--check` reports and fails; `--retire` is the
// one path that removes anything, and it tags the pre-deletion commit first so
// every retired doc stays recoverable forever:
//
//     git show archive/doc-<slug>:<path>
//
// Usage:
//   node scripts/doc-gc.mjs [repo]              report one repo
//   node scripts/doc-gc.mjs --all               report every repo in ~/Dev
//   node scripts/doc-gc.mjs [repo] --check      exit 1 on orphans/finished docs
//   node scripts/doc-gc.mjs [repo] --retire <path> [...] --why "reason"
//   node scripts/doc-gc.mjs --sync              push this file into every repo
//
// This file is the source of truth and lives at ~/Dev/scripts/doc-gc.mjs. Each
// repo carries a byte-identical copy at its own scripts/doc-gc.mjs, because CI
// checks out one repo alone and `../scripts/` does not exist there. `--sync`
// distributes it; `--all` reports any copy that has drifted.
//
// See ~/Dev/CLAUDE.md § Keeping it clean.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STUDIO = '/Users/khushinpatel/Dev';
const STALE_DAYS = 45;

// Files that carry standing by their name alone. NORTH is the repo's truth,
// AGENTS/CLAUDE point at it, README and CHANGELOG are for humans arriving cold.
const PERMANENT = new Set(['NORTH.md', 'README.md', 'CHANGELOG.md', 'CLAUDE.md', 'AGENTS.md', 'LICENSE.md']);

const SKIP = /(^|\/)(node_modules|\.venv|vendor|build|dist|out|target|DerivedData|playwright-report|\.transcripts)(\/|$)/;

// Loaded by convention rather than by reference — Claude Code reads these by
// their location, so nothing in the repo ever links to them.
const CONVENTION = /(^|\/)\.claude\/(commands|agents|skills|hooks)\//;

// The one opt-out. A doc that is genuinely a standing reference — read on
// demand for years, never "finished" — declares it in its own text:
//
//     <!-- doc-gc: standing -->
//
// Permanence has to be claimed deliberately, in the file, by someone who
// decided it. That is the whole difference between a reference and a corpse.
const STANDING = /<!--\s*doc-gc:\s*standing\s*-->/i;

// A doc announcing its own completion. These are the expensive ones: they read
// as authority, and the line saying they're closed is usually four paragraphs
// in where nobody looks.
const FINISHED_MARKERS = [
  /^\s*[*_]*(?:status|state)[*_]*\s*[:—-][^\n]*?\b(complete|completed|done|closed|approved|shipped|landed|superseded|obsolete|archived)\b/im,
  /\b(?:partially |fully )?superseded by\b/i,
  /\bthis (?:file|document|work order|section) (?:is |closes)\b[^\n]*\b(?:done|closed|complete|obsolete)\b/i,
  /\bthis closes\b/i,
  /\ball (?:items|sections|phases|slices|of it) (?:are |is )?(?:done|closed|complete|build-closed)\b/i,
  /^#[^\n]*\b(APPROVED|COMPLETE|DONE|SUPERSEDED|OBSOLETE|ARCHIVED)\b/m,
];

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// A repo *root*, not merely a path inside one — otherwise every subdirectory
// of ~/Dev reports as its own repo with the parent's whole file list.
const isRepo = (dir) => {
  try {
    return fs.realpathSync(git(dir, ['rev-parse', '--show-toplevel']).trim()) === fs.realpathSync(dir);
  } catch {
    return false;
  }
};

const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

// Repos in this studio name each other's files by path — khushin's NORTH.md
// points at `~/Dev/docs/KP-TONE-PROFILE.md`, garden-native's at garden's
// marathon doc. A per-repo scan can't see that and would call them orphans.
let studioCorpus = null;
const crossRepoReferrer = (repo, file) => {
  if (studioCorpus === null) {
    studioCorpus = [];
    for (const entry of fs.readdirSync(STUDIO)) {
      if (entry.startsWith('.')) continue;
      const dir = path.join(STUDIO, entry);
      try {
        if (!fs.statSync(dir).isDirectory() || !isRepo(dir)) continue;
        for (const f of git(dir, ['ls-files', '-z']).split('\0').filter(Boolean)) {
          if (SKIP.test(f)) continue;
          try {
            studioCorpus.push({ repo: entry, file: f, text: fs.readFileSync(path.join(dir, f), 'utf8') });
          } catch { /* binary or unreadable — nothing to reference with */ }
        }
      } catch { /* not a directory we can read */ }
    }
  }
  const mine = path.basename(repo);
  const hit = studioCorpus.find(
    (c) => c.repo !== mine && (c.text.includes(`${mine}/${file}`) || c.text.includes(path.basename(file))),
  );
  return hit ? `${hit.repo}/${hit.file}` : null;
};

function analyse(repo) {
  const tracked = git(repo, ['ls-files', '-z']).split('\0').filter(Boolean).filter((f) => !SKIP.test(f));
  const docs = tracked.filter((f) => f.toLowerCase().endsWith('.md'));
  const source = tracked.filter((f) => !f.toLowerCase().endsWith('.md'));

  const bodies = new Map();
  const bodyOf = (f) => {
    if (!bodies.has(f)) {
      try {
        bodies.set(f, fs.readFileSync(path.join(repo, f), 'utf8'));
      } catch {
        bodies.set(f, '');
      }
    }
    return bodies.get(f);
  };

  // Does `text` point at doc `d`? Match the repo-relative path first (precise),
  // then the bare basename (loose, but a doc named in prose is still named).
  // Basenames like README.md are too common to match loosely, so path only.
  const mentions = (text, d) => {
    const base = path.basename(d);
    if (text.includes(d)) return true;
    if (PERMANENT.has(base)) return false;
    return text.includes(base);
  };

  // A directory the build reads whole — `scripts/build.mjs` calling readdir on
  // `content/notes` keeps every note in it live without naming one of them.
  // The read idiom has to be on the same line as the path: a bare mention of
  // `docs/` in a .gitignore or a stray URL is not a claim on anything.
  const CODE = /\.(mjs|cjs|js|jsx|ts|tsx|py|sh|bash|zsh|rb|go|rs|kt|kts|swift|json|yml|yaml|html|astro|vue|svelte)$/i;
  const READS_DIR = /readdir|readDir|opendir|listdir|iterdir|glob|walk|scandir|fs\.read|Path\(|Dir\(|Dir\s*=|join\(|resolve\(|\*\.md/i;
  const globbed = new Set();
  const globSource = source.filter((s) => CODE.test(s) && !/(^|\/)\.gitignore$/.test(s));
  for (const d of docs) {
    // Only a specific directory counts — `content/notes`, never a bare `docs/`.
    // A top-level doc-space folder matching some path in some script is
    // coincidence, and letting it pass would exempt the whole repo.
    for (let dir = path.dirname(d); dir.includes('/'); dir = path.dirname(dir)) {
      if (globbed.has(dir)) break;
      const read = globSource.some((s) =>
        bodyOf(s).split('\n').some((line) => line.includes(dir) && READS_DIR.test(line)));
      if (read) {
        globbed.add(dir);
        break;
      }
    }
  }

  // Roots: permanent by name, loaded by convention, sitting in a glob-read
  // directory, or named by real source code (a script that reads it, a
  // component that renders it).
  const roots = new Set();
  const referrers = new Map();
  const root = (d, why) => {
    roots.add(d);
    referrers.set(d, why);
  };
  for (const d of docs) {
    if (PERMANENT.has(path.basename(d))) root(d, 'permanent');
    else if (CONVENTION.test(d)) root(d, 'convention');
    else {
      const dir = [...globbed].find((g) => d.startsWith(`${g}/`));
      if (dir) root(d, `read whole: ${dir}/`);
      else {
        const s = source.find((f) => mentions(bodyOf(f), d));
        if (s) root(d, s);
      }
    }
  }
  for (const d of docs) {
    if (roots.has(d)) continue;
    const cross = crossRepoReferrer(repo, d);
    if (cross) root(d, `${cross} (other repo)`);
  }

  // Walk outward from the roots. A live doc confers life on what it links to.
  const live = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const from = queue.shift();
    const text = bodyOf(from);
    for (const d of docs) {
      if (live.has(d) || d === from) continue;
      if (mentions(text, d)) {
        live.add(d);
        referrers.set(d, from);
        queue.push(d);
      }
    }
  }

  return docs
    .map((file) => {
      const body = bodyOf(file);
      const head = body.split('\n').slice(0, 40).join('\n');
      const lastTouched = git(repo, ['log', '-1', '--format=%ad', '--date=short', '--', file]).trim();
      const age = lastTouched ? daysSince(lastTouched) : 0;
      const permanent = PERMANENT.has(path.basename(file)) || STANDING.test(body);
      const finished = !permanent && FINISHED_MARKERS.some((re) => re.test(head));

      let verdict;
      if (permanent) verdict = 'PERMANENT';
      else if (!live.has(file)) verdict = 'ORPHAN';
      else if (finished) verdict = 'FINISHED';
      else if (age > STALE_DAYS) verdict = 'STALE';
      else verdict = 'LIVE';

      return {
        file,
        verdict,
        lastTouched,
        age,
        words: body.split(/\s+/).filter(Boolean).length,
        via: referrers.get(file) ?? null,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

const REASON = {
  ORPHAN: 'nothing alive points at it — it steers sessions without standing',
  FINISHED: 'says it is complete/superseded in its own header',
  STALE: `untouched ${STALE_DAYS}+ days while claiming to be live work`,
};

function report(repo, rows) {
  const name = path.basename(repo);
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {});
  const flagged = rows.filter((r) => r.verdict !== 'PERMANENT' && r.verdict !== 'LIVE');

  const copy = fs.existsSync(SOURCE) ? copyState(repo) : null;
  const drift = copy === 'drifted' ? '  ⚠️  local scripts/doc-gc.mjs has drifted — run --sync'
    : copy === 'missing' ? '  ⚠️  no local scripts/doc-gc.mjs — CI cannot run this check; run --sync'
    : '';

  console.log(`\n── ${name} — ${rows.length} tracked docs · ` +
    ['ORPHAN', 'FINISHED', 'STALE'].map((k) => `${counts[k] ?? 0} ${k.toLowerCase()}`).join(' · ') + drift);

  for (const group of ['ORPHAN', 'FINISHED', 'STALE']) {
    const items = flagged.filter((r) => r.verdict === group);
    if (!items.length) continue;
    console.log(`\n  ${group} — ${REASON[group]}`);
    for (const r of items) {
      console.log(`    ${r.file}  (${r.words}w, last touched ${r.lastTouched})`);
    }
  }
  if (!flagged.length) console.log('  clean — every doc is permanent or reachable from live work.');
  return flagged;
}

function retire(repo, files, why) {
  if (!why) {
    console.error('doc-gc: --retire needs --why "<reason>" — a retired doc with no reason is just a deletion.');
    process.exit(1);
  }
  const dirty = git(repo, ['status', '--porcelain']).trim();
  if (dirty) {
    console.error('doc-gc: working tree is dirty — commit or stash first so the archive tag is clean.');
    process.exit(1);
  }
  for (const file of files) {
    const full = path.join(repo, file);
    if (!fs.existsSync(full)) {
      console.error(`doc-gc: no such file: ${file}`);
      process.exit(1);
    }
    const slug = file.replace(/\.md$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const tag = `archive/doc-${slug}`;
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    git(repo, ['tag', '-a', tag, head, '-m', `Retired ${file}: ${why}\n\nRecover with: git show ${tag}:${file}`]);
    git(repo, ['rm', '-q', file]);
    console.log(`  retired ${file} → ${tag}`);
  }
  git(repo, ['commit', '-q', '-m',
    `Retire ${files.length} finished doc${files.length > 1 ? 's' : ''}: ${why}\n\n` +
    files.map((f) => `- ${f} (archive/doc-${f.replace(/\.md$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()})`).join('\n')]);
  console.log(`\n  committed. Push the tags too: git push --tags`);
}

const SOURCE = path.join(STUDIO, 'scripts/doc-gc.mjs');

const studioRepos = () =>
  fs.readdirSync(STUDIO)
    .filter((d) => !d.startsWith('.'))
    .map((d) => path.join(STUDIO, d))
    .filter((d) => {
      try {
        return fs.statSync(d).isDirectory() && isRepo(d);
      } catch {
        return false;
      }
    });

// Copies drift silently and a stale copy is a check that quietly stops
// checking, so every report says so.
const copyState = (repo) => {
  const copy = path.join(repo, 'scripts/doc-gc.mjs');
  if (path.resolve(repo) === STUDIO) return null;
  if (!fs.existsSync(copy)) return 'missing';
  return fs.readFileSync(copy, 'utf8') === fs.readFileSync(SOURCE, 'utf8') ? 'current' : 'drifted';
};

function sync() {
  const body = fs.readFileSync(SOURCE, 'utf8');
  for (const repo of studioRepos()) {
    if (path.resolve(repo) === STUDIO) continue;
    const dir = path.join(repo, 'scripts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, 'doc-gc.mjs');
    const changed = !fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== body;
    fs.writeFileSync(dest, body);
    fs.chmodSync(dest, 0o755);
    console.log(`  ${changed ? 'synced ' : 'current'}  ${path.basename(repo)}/scripts/doc-gc.mjs`);
  }
}

// ── main ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const valueOf = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

if (flag('--sync')) {
  sync();
  process.exit(0);
}

// `--map` writes the graph out as one page. ~/Dev is an Obsidian vault, so the
// wiki-links below give KP a real graph view: every live doc is a node joined
// to whatever keeps it alive, and orphans sit unconnected where you can see
// them. It is generated — regenerate rather than edit.
if (flag('--map')) {
  const out = [
    '# Studio map — every tracked document, and what keeps it alive',
    '',
    '<!-- doc-gc: standing -->',
    'Generated by `node ~/Dev/scripts/doc-gc.mjs --map`. Do not edit — regenerate.',
    'Standing because it is the studio\'s index of itself: the one page that answers',
    '"what documents exist and why" without opening eight repos.',
    '',
    `Regenerated ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'Open this vault in Obsidian and use the graph view: live docs cluster around',
    'the NORTH.md they hang from, and anything orphaned floats alone.',
    '',
  ];
  let orphans = 0;
  for (const repo of [...studioRepos(), STUDIO]) {
    const rows = analyse(repo);
    const name = path.basename(repo);
    out.push(`## ${name}`, '');
    for (const r of rows) {
      const link = `[[${name}/${r.file}|${r.file}]]`;
      if (r.verdict === 'PERMANENT') out.push(`- **${link}** — permanent`);
      else if (r.verdict === 'LIVE') out.push(`- ${link} — alive via \`${r.via}\``);
      else {
        orphans += 1;
        out.push(`- ⚠️ ${link} — **${r.verdict}**, ${REASON[r.verdict]}`);
      }
    }
    out.push('');
  }
  out.push('---', '', orphans
    ? `${orphans} document(s) flagged. \`--check\` fails on these.`
    : 'Nothing flagged. Every document is permanent or reachable from live work.');
  const dest = path.join(STUDIO, 'docs/STUDIO-MAP.md');
  fs.writeFileSync(dest, `${out.join('\n')}\n`);
  console.log(`  wrote ${dest} — ${orphans} flagged`);
  process.exit(0);
}

if (flag('--retire')) {
  const repo = path.resolve(argv[0] && !argv[0].startsWith('--') ? argv[0] : '.');
  const files = argv.slice(argv.indexOf('--retire') + 1).filter((a) => !a.startsWith('--') && a !== valueOf('--why'));
  retire(repo, files, valueOf('--why'));
  process.exit(0);
}

const targets = flag('--all')
  ? [...studioRepos(), STUDIO]
  : [path.resolve(argv[0] && !argv[0].startsWith('--') ? argv[0] : '.')];

let flaggedTotal = 0;
for (const repo of targets) {
  if (!isRepo(repo)) {
    console.error(`doc-gc: not a git repo: ${repo}`);
    process.exit(1);
  }
  const rows = analyse(repo);
  if (flag('--json')) {
    console.log(JSON.stringify({ repo, rows }, null, 2));
    continue;
  }
  flaggedTotal += report(repo, rows).filter((r) => r.verdict !== 'STALE').length;
}

if (flag('--check') && flaggedTotal > 0) {
  console.error(
    `\ndoc-gc: ${flaggedTotal} doc(s) have no live claim on this repo.\n` +
    `Fold what still matters into NORTH.md, then retire them:\n` +
    `  node ~/Dev/scripts/doc-gc.mjs . --retire <path> --why "<reason>"\n` +
    `Nothing is lost — each retirement leaves an archive/doc-* tag.\n`);
  process.exit(1);
}
