/**
 * Boulder Civics Wiki — static site builder
 * Reads from Parachute Vault HTTP API, generates HTML to dist/
 * Run: node build.js
 * Then: pagefind --site dist
 */

import { writeFileSync, mkdirSync, cpSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'dist');
const VAULT_URL = (process.env.VAULT_URL || '').replace(/\/$/, '');
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const BASE = (process.env.SITE_BASE || '/').replace(/([^/])$/, '$1/');

if (!VAULT_URL || !VAULT_TOKEN) {
  console.error('ERROR: VAULT_URL and VAULT_TOKEN must be set. Copy .env.example to .env and fill in values.');
  process.exit(1);
}

// ─── Body config ─────────────────────────────────────────────────────────────

const BODIES = {
  'city-council': {
    name: 'City Council',
    tag: 'city-council',
    description: 'The Boulder City Council is the governing body of the City of Boulder, made up of nine elected members. The Council sets policy, approves the budget, and makes decisions on land use, development, and city services. Regular meetings are held most Thursdays.',
    url: 'https://bouldercolorado.gov/city-council',
    meetingSchedule: 'Regular meetings most Thursdays at 6 PM; alternating with study sessions',
  },
  'planning-board': {
    name: 'Planning Board',
    tag: 'planning-board',
    description: 'The Planning Board reviews and makes recommendations on land use applications, zoning changes, and long-range planning matters. It serves as a key advisory body on development and growth in Boulder.',
    url: 'https://bouldercolorado.gov/planning-board',
    meetingSchedule: '1st, 3rd, and 4th Tuesdays at 6 PM',
  },
  'housing-advisory-board': {
    name: 'Housing Advisory Board',
    tag: 'housing-advisory-board',
    description: 'The Housing Advisory Board advises the City Council and staff on housing policy, affordable housing programs, and strategies to address Boulder\'s housing needs across all income levels.',
    url: 'https://bouldercolorado.gov/housing-advisory-board',
    meetingSchedule: '4th Wednesday at 6 PM',
  },
  'human-relations-commission': {
    name: 'Human Relations Commission',
    tag: 'human-relations-commission',
    description: 'The Human Relations Commission works to promote equity, inclusion, and human dignity in Boulder. It advises the City Council on issues of discrimination, civil rights, and community relations.',
    url: 'https://bouldercolorado.gov/human-relations-commission',
    meetingSchedule: '3rd Monday at 6 PM',
  },
};

const MEETING_TYPE_LABELS = {
  'regular': 'Regular Meeting',
  'study-session': 'Study Session',
  'special': 'Special Meeting',
  'retreat': 'Retreat',
  'joint': 'Joint Session',
  'executive-session': 'Executive Session',
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function vaultFetch(path, params = {}) {
  const url = new URL(`${VAULT_URL}/api${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val));
    else url.searchParams.set(k, v);
  }
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${VAULT_TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`Vault API error ${resp.status} for ${url}`);
  return resp.json();
}

async function fetchAllNotes({ tag, tags, includeContent = false } = {}) {
  const notes = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const params = { include_content: includeContent, limit, offset };
    if (tag) params.tag = tag;
    if (tags) { params.tag = tags; params.tag_match = 'all'; }

    const data = await vaultFetch('/notes', params);
    const page = Array.isArray(data) ? data : (data.notes || []);
    notes.push(...page);

    if (page.length < limit) break;
    offset += limit;
  }

  return notes;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function meetingSlug(note) {
  const name = note.path ? note.path.split('/').pop() : note.id.split('/').pop();
  return slugify(name);
}

const BODY_NAME_TO_SLUG = {
  'City Council': 'city-council',
  'Planning Board': 'planning-board',
  'Housing Advisory Board': 'housing-advisory-board',
  'Human Relations Commission': 'human-relations-commission',
};

function bodySlugFromNote(note) {
  const bodyMeta = note.metadata?.body;
  if (bodyMeta) {
    if (BODIES[bodyMeta]) return bodyMeta;
    if (BODY_NAME_TO_SLUG[bodyMeta]) return BODY_NAME_TO_SLUG[bodyMeta];
  }
  for (const tag of (note.tags || [])) {
    if (BODIES[tag]) return tag;
  }
  return null;
}

function meetingTypeLabel(type) {
  return MEETING_TYPE_LABELS[type] || (type ? type.replace(/-/g, ' ') : 'Meeting');
}

function splitContent(content) {
  const divIdx = content.indexOf('\n---\n');
  if (divIdx === -1) return { header: content, transcript: null };
  const header = content.slice(0, divIdx).trim();
  const rest = content.slice(divIdx + 5).trim();
  const transcriptStart = rest.indexOf('## Transcript');
  if (transcriptStart === -1) return { header, transcript: rest };
  return { header, transcript: rest.slice(transcriptStart) };
}

function stripTitle(markdown) {
  return markdown.replace(/^#[^\n]*\n/, '').trim();
}

function countTranscriptSegments(transcript) {
  if (!transcript) return 0;
  return (transcript.match(/^\[\d+:\d+\]/gm) || []).length;
}

function out(relPath, html) {
  const full = join(OUT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html, 'utf8');
}

function asset(relPath) {
  return `${BASE}${relPath}`.replace(/\/+/g, '/');
}

// ─── HTML templates ───────────────────────────────────────────────────────────

function baseHtml({ title, description = '', bodyClass = '', head = '', canonical = '' }, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Boulder Civics</title>
  ${description ? `<meta name="description" content="${description.replace(/"/g, '&quot;')}">` : ''}
  ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
  <link rel="stylesheet" href="${asset('style.css')}">
  ${head}
</head>
<body class="${bodyClass}">
  <a href="#main" class="skip-link">Skip to content</a>
  <header class="site-header">
    <div class="container">
      <a href="${asset('')}" class="site-logo">
        <span class="logo-icon">⚖</span>
        <span>Boulder Civics</span>
      </a>
      <nav class="site-nav" aria-label="Main navigation">
        <a href="${asset('city-council/')}">City Council</a>
        <a href="${asset('planning-board/')}">Planning Board</a>
        <a href="${asset('housing-advisory-board/')}">Housing Advisory Board</a>
        <a href="${asset('human-relations-commission/')}">Human Relations Commission</a>
        <a href="${asset('search/')}">Search</a>
      </nav>
    </div>
  </header>

  <main id="main" class="container">
    ${content}
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>Meeting records sourced from <a href="https://www.youtube.com/@CityofBoulder" rel="noopener">City of Boulder YouTube</a>. This is an independent civic resource, not affiliated with the City of Boulder.</p>
      <p>Built with <a href="https://github.com/ParachuteComputer/parachute-vault" rel="noopener">Parachute Vault</a>.</p>
    </div>
  </footer>

  <link href="${asset('pagefind/pagefind-ui.css')}" rel="stylesheet">
  <script src="${asset('pagefind/pagefind-ui.js')}"></script>
</body>
</html>`;
}

function tagBadge(tag) {
  return `<span class="tag">${tag.replace(/-/g, ' ')}</span>`;
}

function meetingTypeBadge(type) {
  if (!type) return '';
  const cls = type === 'regular' ? 'type-regular' : type === 'study-session' ? 'type-study' : 'type-special';
  return `<span class="meeting-type ${cls}">${meetingTypeLabel(type)}</span>`;
}

function meetingCard(note, bodySlug) {
  const date = note.metadata?.date || '';
  const type = note.metadata?.['meeting-type'] || 'regular';
  const hasTranscript = (note.tags || []).includes('meeting-transcript');
  const slug = meetingSlug(note);
  const href = asset(`${bodySlug}/${slug}/`);

  return `<article class="meeting-card" data-type="${type}" data-year="${date.slice(0, 4)}">
    <a href="${href}" class="meeting-card-inner">
      <div class="meeting-card-date">${formatDate(date)}</div>
      <div class="meeting-card-meta">
        ${meetingTypeBadge(type)}
        ${hasTranscript ? '<span class="transcript-badge">Transcript</span>' : ''}
      </div>
    </a>
  </article>`;
}

// ─── Page builders ────────────────────────────────────────────────────────────

function buildHomePage(notesByBody, recentMeetings) {
  const bodySummaries = Object.entries(BODIES).map(([slug, body]) => {
    const meetings = notesByBody[slug] || [];
    const latest = meetings[0];
    const latestDate = latest?.metadata?.date ? formatDate(latest.metadata.date) : 'No meetings yet';
    return `<a href="${asset(slug + '/')}" class="body-card">
      <div class="body-card-name">${body.name}</div>
      <div class="body-card-count">${meetings.length} meetings</div>
      <div class="body-card-latest">Latest: ${latestDate}</div>
    </a>`;
  }).join('');

  const recentItems = recentMeetings.slice(0, 12).map(note => {
    const slug = bodySlugFromNote(note);
    const body = BODIES[slug];
    const date = note.metadata?.date || '';
    const type = note.metadata?.['meeting-type'] || 'regular';
    const mslug = meetingSlug(note);
    return `<li class="recent-item">
      <a href="${asset(`${slug}/${mslug}/`)}">
        <span class="recent-date">${formatDate(date)}</span>
        <span class="recent-body">${body?.name || slug}</span>
        ${meetingTypeBadge(type)}
      </a>
    </li>`;
  }).join('');

  const content = `
    <section class="hero">
      <h1>Boulder Civics</h1>
      <p class="hero-tagline">Searchable transcripts and records from Boulder's governing bodies — so every resident can follow the decisions that shape our city.</p>
      <div class="hero-search" id="home-search"></div>
      <script>
        new PagefindUI({ element: "#home-search", showSubResults: false, showImages: false });
      </script>
    </section>

    <section class="bodies-grid" aria-label="Governing bodies">
      <h2>Governing Bodies</h2>
      <div class="body-cards">${bodySummaries}</div>
    </section>

    <section class="recent-meetings" aria-label="Recent meetings">
      <h2>Recent Meetings</h2>
      <ul class="recent-list">${recentItems}</ul>
    </section>

    <section class="about">
      <h2>About this site</h2>
      <p>Boulder Civics makes it easier to follow what's happening in city government. Every meeting from City Council, the Planning Board, the Housing Advisory Board, and the Human Relations Commission is indexed here — with YouTube recordings and searchable transcripts where available.</p>
      <p>Use the search bar above to find discussions on any topic: housing, transportation, equity, surveillance, the budget, and more.</p>
    </section>
  `;

  return baseHtml(
    { title: 'Home', description: 'Searchable meeting records from Boulder City Council, Planning Board, Housing Advisory Board, and Human Relations Commission.' },
    content
  );
}

function buildBodyPage(bodySlug, meetings) {
  const body = BODIES[bodySlug];
  if (!body) return null;

  const years = [...new Set(meetings.map(n => n.metadata?.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const types = [...new Set(meetings.map(n => n.metadata?.['meeting-type']).filter(Boolean))].sort();

  const filterControls = `
    <div class="filters" aria-label="Filter meetings">
      <div class="filter-group">
        <label>Year</label>
        <div class="filter-buttons">
          <button class="filter-btn active" data-filter-year="all">All</button>
          ${years.map(y => `<button class="filter-btn" data-filter-year="${y}">${y}</button>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label>Type</label>
        <div class="filter-buttons">
          <button class="filter-btn active" data-filter-type="all">All</button>
          ${types.map(t => `<button class="filter-btn" data-filter-type="${t}">${meetingTypeLabel(t)}</button>`).join('')}
        </div>
      </div>
    </div>
  `;

  const meetingList = meetings.map(note => meetingCard(note, bodySlug)).join('');

  const content = `
    <div class="body-page">
      <header class="page-header">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="${asset('')}">Boulder Civics</a> / <span>${body.name}</span>
        </nav>
        <h1>${body.name}</h1>
        <p class="body-description">${body.description}</p>
        <p class="body-meta">
          <a href="${body.url}" rel="noopener" class="external-link">City page ↗</a>
          <span class="separator">·</span>
          <span>${body.meetingSchedule}</span>
          <span class="separator">·</span>
          <strong>${meetings.length} meetings on record</strong>
        </p>
      </header>

      ${filterControls}

      <div class="meeting-list" id="meeting-list">
        ${meetingList}
      </div>
    </div>

    <script>
    (function() {
      const cards = document.querySelectorAll('.meeting-card');
      let activeYear = 'all', activeType = 'all';

      function applyFilters() {
        cards.forEach(card => {
          const yearMatch = activeYear === 'all' || card.dataset.year === activeYear;
          const typeMatch = activeType === 'all' || card.dataset.type === activeType;
          card.style.display = (yearMatch && typeMatch) ? '' : 'none';
        });
      }

      document.querySelectorAll('[data-filter-year]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-filter-year]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeYear = btn.dataset.filterYear;
          applyFilters();
        });
      });

      document.querySelectorAll('[data-filter-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-filter-type]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeType = btn.dataset.filterType;
          applyFilters();
        });
      });
    })();
    </script>
  `;

  return baseHtml(
    {
      title: body.name,
      description: `${meetings.length} meeting records from Boulder's ${body.name}, including transcripts and YouTube recordings.`,
      bodyClass: 'body-page-body',
    },
    content
  );
}

function buildMeetingPage(note, bodySlug, prevNote, nextNote) {
  const body = BODIES[bodySlug];
  const date = note.metadata?.date || '';
  const type = note.metadata?.['meeting-type'] || 'regular';
  const recordingUrl = note.metadata?.['recording-url'] || '';
  const hasTranscript = (note.tags || []).includes('meeting-transcript');
  const title = `${formatDate(date)} — ${body?.name} ${meetingTypeLabel(type)}`;

  const { header, transcript } = splitContent(note.content || '');
  const segCount = countTranscriptSegments(transcript);
  const headerHtml = marked.parse(stripTitle(header));

  const videoId = recordingUrl?.match(/[?&]v=([^&]+)/)?.[1];
  const recordingSection = recordingUrl
    ? `<div class="recording-links">
        <a href="${recordingUrl}" class="btn-youtube" target="_blank" rel="noopener">
          ▶ Watch on YouTube
        </a>
        ${videoId ? `<div class="video-embed-wrapper">
          <iframe
            src="https://www.youtube.com/embed/${videoId}"
            title="Recording: ${title}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>` : ''}
      </div>`
    : '';

  const transcriptSection = hasTranscript && transcript
    ? `<section class="transcript-section" aria-label="Meeting transcript">
        <details class="transcript-details">
          <summary class="transcript-summary">
            View transcript <span class="transcript-count">(${segCount.toLocaleString()} segments)</span>
          </summary>
          <div class="transcript-content" data-pagefind-body>
            ${marked.parse(transcript)}
          </div>
        </details>
      </section>`
    : hasTranscript
    ? '<p class="no-transcript">Transcript unavailable for this meeting.</p>'
    : '<p class="no-transcript">No transcript available. Watch the recording on YouTube.</p>';

  const prevLink = prevNote
    ? `<a href="${asset(`${bodySlug}/${meetingSlug(prevNote)}/`)}" class="nav-prev">
        ← ${formatDate(prevNote.metadata?.date)}
      </a>`
    : '<span></span>';
  const nextLink = nextNote
    ? `<a href="${asset(`${bodySlug}/${meetingSlug(nextNote)}/`)}" class="nav-next">
        ${formatDate(nextNote.metadata?.date)} →
      </a>`
    : '<span></span>';

  const topicTags = (note.tags || []).filter(t =>
    !['meeting-summary', 'meeting-transcript', 'city-council', 'planning-board',
      'housing-advisory-board', 'human-relations-commission'].includes(t)
  );

  const content = `
    <article class="meeting-page" data-pagefind-body>
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="${asset('')}">Boulder Civics</a> /
        <a href="${asset(bodySlug + '/')}">${body?.name}</a> /
        <span>${formatDate(date)}</span>
      </nav>

      <header class="meeting-header">
        <h1>${title}</h1>
        <div class="meeting-meta-row">
          ${meetingTypeBadge(type)}
          <span class="meta-date">${formatDate(date)}</span>
          ${topicTags.map(t => tagBadge(t)).join('')}
        </div>
      </header>

      ${recordingSection}

      <section class="meeting-notes" aria-label="Meeting notes">
        ${headerHtml}
      </section>

      ${transcriptSection}

      <nav class="meeting-nav" aria-label="Other meetings">
        ${prevLink}
        <a href="${asset(bodySlug + '/')}" class="nav-up">All ${body?.name} meetings</a>
        ${nextLink}
      </nav>
    </article>
  `;

  return baseHtml(
    {
      title,
      description: `${title}. Watch the recording and read the transcript.`,
      bodyClass: 'meeting-page-body',
    },
    content
  );
}

function buildSearchPage() {
  const content = `
    <div class="search-page">
      <h1>Search Boulder Civics</h1>
      <p>Search across all meetings, bodies, and transcripts.</p>
      <div id="search"></div>
    </div>
    <script>
      new PagefindUI({ element: "#search", showSubResults: true, showImages: false });
    </script>
  `;
  return baseHtml(
    { title: 'Search', description: 'Search all Boulder Civics meeting records and transcripts.' },
    content
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Boulder Civics Wiki — build starting\n');
  console.log(`Vault: ${VAULT_URL}`);
  console.log(`Output: ${OUT}\n`);

  mkdirSync(OUT, { recursive: true });

  // Copy static assets
  const staticSrc = join(__dirname, 'static');
  if (existsSync(staticSrc)) {
    cpSync(staticSrc, OUT, { recursive: true });
    console.log('Copied static assets');
  }

  // Fetch all meeting notes (index, no content) for listing pages
  console.log('Fetching meeting index...');
  const allMeetings = await fetchAllNotes({ tag: 'meeting-summary', includeContent: false });
  console.log(`  ${allMeetings.length} meetings total`);

  // Group by body
  const notesByBody = {};
  for (const note of allMeetings) {
    const slug = bodySlugFromNote(note);
    if (!slug) continue;
    if (!notesByBody[slug]) notesByBody[slug] = [];
    notesByBody[slug].push(note);
  }

  // Sort each body's meetings by date descending
  for (const slug of Object.keys(notesByBody)) {
    notesByBody[slug].sort((a, b) =>
      (b.metadata?.date || '').localeCompare(a.metadata?.date || '')
    );
  }

  // Recent meetings across all bodies (sorted by date)
  const recentMeetings = [...allMeetings]
    .sort((a, b) => (b.metadata?.date || '').localeCompare(a.metadata?.date || ''))
    .slice(0, 20);

  // Home page
  process.stdout.write('Building home page... ');
  out('index.html', buildHomePage(notesByBody, recentMeetings));
  console.log('done');

  // Per-body pages (listing only, no content needed)
  for (const [bodySlug, body] of Object.entries(BODIES)) {
    process.stdout.write(`Building ${body.name} listing... `);
    const meetings = notesByBody[bodySlug] || [];
    const html = buildBodyPage(bodySlug, meetings);
    if (html) out(`${bodySlug}/index.html`, html);
    console.log(`${meetings.length} meetings`);
  }

  // Per-meeting pages (need content — fetch per body in batches)
  for (const [bodySlug, body] of Object.entries(BODIES)) {
    const meetings = notesByBody[bodySlug] || [];
    if (meetings.length === 0) continue;

    console.log(`\nFetching ${body.name} meeting content (${meetings.length} meetings)...`);

    // Fetch all notes for this body with content in pages of 50
    process.stdout.write(`  Fetching content in batches`);
    const withContent = await fetchAllNotes({
      tags: [bodySlug, 'meeting-summary'],
      includeContent: true,
    });
    console.log(` — ${withContent.length} fetched`);

    // Index by id for lookup
    const contentById = {};
    for (const n of withContent) contentById[n.id] = n;

    // Build meeting pages
    process.stdout.write(`  Building pages...`);
    let built = 0;
    for (let i = 0; i < meetings.length; i++) {
      const indexNote = meetings[i];
      const fullNote = contentById[indexNote.id] || indexNote;
      const slug = meetingSlug(fullNote);
      const prev = meetings[i + 1] || null; // older
      const next = meetings[i - 1] || null; // newer
      const html = buildMeetingPage(fullNote, bodySlug, prev, next);
      out(`${bodySlug}/${slug}/index.html`, html);
      built++;
    }
    console.log(` ${built} pages built`);
  }

  // Search page
  process.stdout.write('\nBuilding search page... ');
  out('search/index.html', buildSearchPage());
  console.log('done');

  console.log(`\n✓ Build complete — ${OUT}`);
  console.log('\nNext step: run pagefind to build the search index:');
  console.log('  npx pagefind --site dist\n');
  console.log('Then deploy:');
  console.log('  npx gh-pages -d dist  (push to gh-pages branch)');
  console.log('  — or —');
  console.log('  npm run deploy         (build + search index + push)\n');
}

main().catch(err => {
  console.error('\n✗ Build failed:', err.message);
  process.exit(1);
});
