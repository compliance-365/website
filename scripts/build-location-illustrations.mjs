// Generates the six /locations/ hero illustrations into public/assets/.
//
// These are committed static assets like the rest of the illus-* family, but
// they are generated rather than hand-drawn so the six stay visually
// consistent: same 720x470 frame, same gradient backdrop, same card treatment
// and gold accent as illus-essential-eight.svg et al. Only the skyline and the
// framework chips differ per city.
//
// Re-run with:  node scripts/build-location-illustrations.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

const INK = '#0B0B0C';
const GOLD = '#A9812E';
const GOLD_LIGHT = '#D8BA78';
const CARD = '#ffffff';
const CARD_STROKE = '#F5F0E8';
const MUTED = '#6B6860';

const BASE = 396; // skyline baseline

/** A plain rectangular tower. */
const tower = (x, w, h, fill = INK, op = 1) =>
  `<rect x="${x}" y="${BASE - h}" width="${w}" height="${h}" rx="3" fill="${fill}" opacity="${op}"/>`;

/** Rows of lit windows on a tower. */
function windows(x, w, h, cols = 3, rows = 4) {
  const pad = 7, cw = 5, ch = 5;
  const gapX = (w - pad * 2 - cw * cols) / Math.max(cols - 1, 1);
  const gapY = 13;
  let out = '';
  for (let r = 0; r < rows; r++) {
    const y = BASE - h + 16 + r * gapY;
    if (y > BASE - 12) break;
    for (let c = 0; c < cols; c++) {
      if ((r * cols + c) % 3 === 1) continue; // irregular lighting
      out += `<rect x="${(x + pad + c * (cw + gapX)).toFixed(1)}" y="${y}" width="${cw}" height="${ch}" rx="1" fill="${GOLD_LIGHT}" opacity=".55"/>`;
    }
  }
  return out;
}

/**
 * A real arch bridge: quadratic arch springing from the deck, with vertical
 * hangers dropped onto points sampled from the curve. Drawing the arch with
 * straight segments reads as a tent, not a bridge, so the control point is
 * solved from the desired apex: apex = (deck + control) / 2.
 */
function archBridge({ x0, x1, deckY, apexY, pylonW = 0, pylonH = 0 }) {
  const mx = (x0 + x1) / 2;
  const cy = 2 * apexY - deckY; // control point that puts the apex where we want it
  const at = (t) => {
    const u = 1 - t;
    return {
      x: u * u * x0 + 2 * u * t * mx + t * t * x1,
      y: u * u * deckY + 2 * u * t * cy + t * t * deckY,
    };
  };
  const hangers = [0.18, 0.34, 0.5, 0.66, 0.82]
    .map(at)
    .map((p) => `M${p.x.toFixed(1)} ${p.y.toFixed(1)} V${deckY}`)
    .join(' ');
  const pylons = pylonW
    ? `<rect x="${x0 - pylonW / 2}" y="${deckY - pylonH}" width="${pylonW}" height="${pylonH + (BASE - deckY)}" rx="2" fill="${INK}"/>
       <rect x="${x1 - pylonW / 2}" y="${deckY - pylonH}" width="${pylonW}" height="${pylonH + (BASE - deckY)}" rx="2" fill="${INK}"/>`
    : '';
  return `
    <path d="M${x0} ${deckY} Q${mx} ${cy} ${x1} ${deckY}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="${hangers}" stroke="${GOLD}" stroke-width="3" opacity=".85"/>
    <rect x="${x0 - 10}" y="${deckY}" width="${x1 - x0 + 20}" height="6" rx="3" fill="${INK}"/>
    ${pylons}`;
}

/** A slender lattice needle (Arts Centre / Bell Tower spires). */
function needle(cx, baseY, height, halfWidth) {
  const tipY = baseY - height;
  const struts = [0.3, 0.5, 0.7]
    .map((t) => {
      const y = baseY - height * t;
      const w = halfWidth * (1 - t);
      return `M${(cx - w).toFixed(1)} ${y.toFixed(1)} H${(cx + w).toFixed(1)}`;
    })
    .join(' ');
  return `
    <path d="M${cx - halfWidth} ${baseY} L${cx} ${tipY} L${cx + halfWidth} ${baseY} Z" fill="${INK}"/>
    <path d="${struts}" stroke="${GOLD}" stroke-width="2" opacity=".8"/>
    <path d="M${cx} ${tipY} V${tipY - 26}" stroke="${INK}" stroke-width="3.5"/>
    <circle cx="${cx}" cy="${tipY - 30}" r="4.5" fill="${GOLD}"/>`;
}

// ── Per-city landmark groups ────────────────────────────────────────────────
const SKYLINES = {
  brisbane: () => `
    ${tower(84, 44, 112)}${windows(84, 44, 112, 3, 5)}
    ${tower(136, 32, 162)}${windows(136, 32, 162, 2, 7)}
    ${tower(176, 50, 210)}${windows(176, 50, 210, 3, 10)}
    ${tower(234, 36, 144)}${windows(234, 36, 144, 2, 6)}
    <!-- Story Bridge: cantilever truss with a raised centre span -->
    <g opacity=".95">
      <rect x="284" y="${BASE - 66}" width="24" height="66" rx="2" fill="${INK}"/>
      <rect x="468" y="${BASE - 66}" width="24" height="66" rx="2" fill="${INK}"/>
      <path d="M282 ${BASE - 66} L346 ${BASE - 96} L430 ${BASE - 96} L494 ${BASE - 66}"
            fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <rect x="276" y="${BASE - 62}" width="224" height="7" rx="3" fill="${INK}"/>
      <path d="M296 ${BASE - 62} L346 ${BASE - 96} M346 ${BASE - 96} L388 ${BASE - 62}
               M388 ${BASE - 62} L430 ${BASE - 96} M430 ${BASE - 96} L480 ${BASE - 62}"
            stroke="${GOLD}" stroke-width="3" opacity=".9"/>
      <path d="M346 ${BASE - 96} V${BASE - 62} M430 ${BASE - 96} V${BASE - 62}"
            stroke="${INK}" stroke-width="3"/>
    </g>
    ${tower(508, 40, 170)}${windows(508, 40, 170, 3, 8)}
    ${tower(556, 30, 122)}${windows(556, 30, 122, 2, 5)}
    <!-- Wheel of Brisbane -->
    <g transform="translate(626,${BASE - 62})" opacity=".92">
      <path d="M-17 62 L0 22 L17 62" fill="none" stroke="${INK}" stroke-width="5"/>
      <circle r="36" fill="none" stroke="${INK}" stroke-width="5"/>
      <path d="M0 -36 V36 M-36 0 H36 M-25 -25 L25 25 M25 -25 L-25 25" stroke="${INK}" stroke-width="2" opacity=".55"/>
      <circle r="5.5" fill="${GOLD}"/>
    </g>`,

  sydney: () => `
    ${tower(64, 38, 126)}${windows(64, 38, 126, 3, 6)}
    ${tower(110, 30, 176)}${windows(110, 30, 176, 2, 8)}
    <g opacity=".95">
      ${archBridge({ x0: 168, x1: 372, deckY: BASE - 60, apexY: BASE - 126, pylonW: 20, pylonH: 88 })}
    </g>
    <!-- Opera House: overlapping shells on a podium -->
    <g transform="translate(398,${BASE})" opacity=".96">
      <path d="M6 0 Q6 -52 52 -76 Q30 -40 36 0 Z" fill="${INK}"/>
      <path d="M40 0 Q40 -70 100 -98 Q72 -46 78 0 Z" fill="${INK}"/>
      <path d="M82 0 Q82 -54 134 -78 Q110 -38 116 0 Z" fill="${GOLD}" opacity=".9"/>
      <rect x="-4" y="-2" width="148" height="9" rx="4" fill="${INK}"/>
    </g>
    ${tower(566, 42, 190)}${windows(566, 42, 190, 3, 9)}
    ${tower(616, 32, 140)}${windows(616, 32, 140, 2, 6)}`,

  melbourne: () => `
    ${tower(72, 40, 118)}${windows(72, 40, 118, 3, 5)}
    <!-- Flinders Street Station: dome and clock -->
    <g opacity=".96">
      ${tower(124, 46, 138)}
      <path d="M124 ${BASE - 138} Q147 ${BASE - 176} 170 ${BASE - 138} Z" fill="${GOLD}" opacity=".92"/>
      <circle cx="147" cy="${BASE - 116}" r="13" fill="${CARD}" stroke="${INK}" stroke-width="3"/>
      <path d="M147 ${BASE - 116} V${BASE - 125} M147 ${BASE - 116} L153 ${BASE - 112}" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    </g>
    ${tower(184, 34, 172)}${windows(184, 34, 172, 2, 8)}
    <!-- Arts Centre spire -->
    <g opacity=".94">${needle(252, BASE, 176, 15)}</g>
    ${tower(288, 44, 152)}${windows(288, 44, 152, 3, 7)}
    <!-- Eureka Tower and its gold crown -->
    <g>
      ${tower(346, 52, 244)}${windows(346, 52, 244, 3, 11)}
      <rect x="346" y="${BASE - 244}" width="52" height="30" rx="3" fill="${GOLD}"/>
    </g>
    ${tower(410, 38, 164)}${windows(410, 38, 164, 2, 7)}
    ${tower(456, 44, 200)}${windows(456, 44, 200, 3, 9)}
    ${tower(510, 32, 136)}${windows(510, 32, 136, 2, 6)}
    ${tower(550, 48, 178)}${windows(550, 48, 178, 3, 8)}
    ${tower(608, 34, 124)}${windows(608, 34, 124, 2, 5)}`,

  canberra: () => `
    ${tower(74, 34, 92)}${windows(74, 34, 92, 2, 4)}
    <!-- Black Mountain and Telstra Tower -->
    <g opacity=".9">
      <path d="M104 ${BASE} Q158 ${BASE - 46} 212 ${BASE} Z" fill="${INK}" opacity=".22"/>
      <path d="M158 ${BASE - 34} V${BASE - 158}" stroke="${INK}" stroke-width="7"/>
      <rect x="139" y="${BASE - 132}" width="38" height="11" rx="5" fill="${GOLD}"/>
      <rect x="145" y="${BASE - 118}" width="26" height="9" rx="4" fill="${INK}"/>
      <path d="M158 ${BASE - 158} V${BASE - 186}" stroke="${INK}" stroke-width="3"/>
      <circle cx="158" cy="${BASE - 190}" r="4" fill="${GOLD}"/>
    </g>
    <!-- Parliament House: low wings, colonnade, flagpole -->
    <g opacity=".96">
      <rect x="248" y="${BASE - 52}" width="244" height="52" rx="4" fill="${INK}"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${266 + i * 27}" y="${BASE - 42}" width="8" height="32" rx="2" fill="${GOLD_LIGHT}" opacity=".38"/>`).join('')}
      <rect x="304" y="${BASE - 74}" width="132" height="22" rx="3" fill="${INK}" opacity=".88"/>
      <path d="M336 ${BASE - 74} L370 ${BASE - 152} M404 ${BASE - 74} L370 ${BASE - 152}
               M352 ${BASE - 74} L370 ${BASE - 152} M388 ${BASE - 74} L370 ${BASE - 152}"
            stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M370 ${BASE - 152} V${BASE - 178}" stroke="${INK}" stroke-width="4"/>
      <path d="M370 ${BASE - 178} L408 ${BASE - 168} L370 ${BASE - 158} Z" fill="${GOLD}"/>
    </g>
    ${tower(516, 38, 112)}${windows(516, 38, 112, 3, 5)}
    ${tower(564, 32, 146)}${windows(564, 32, 146, 2, 6)}
    ${tower(606, 40, 98)}${windows(606, 40, 98, 3, 4)}`,

  perth: () => `
    ${tower(70, 38, 122)}${windows(70, 38, 122, 3, 5)}
    ${tower(116, 32, 178)}${windows(116, 32, 178, 2, 8)}
    ${tower(156, 48, 224)}${windows(156, 48, 224, 3, 10)}
    ${tower(212, 34, 152)}${windows(212, 34, 152, 2, 7)}
    ${tower(254, 42, 192)}${windows(254, 42, 192, 3, 9)}
    <!-- Swan Bell Tower: tapered shaft, copper spire, glass sails -->
    <g opacity=".95">
      <path d="M338 ${BASE - 46} Q356 ${BASE - 116} 352 ${BASE - 4}" fill="${GOLD}" opacity=".3"/>
      <path d="M410 ${BASE - 46} Q392 ${BASE - 116} 396 ${BASE - 4}" fill="${GOLD}" opacity=".3"/>
      <path d="M356 ${BASE} L361 ${BASE - 118} L387 ${BASE - 118} L392 ${BASE} Z" fill="${INK}"/>
      <rect x="357" y="${BASE - 26}" width="34" height="26" rx="2" fill="${INK}"/>
      <rect x="359" y="${BASE - 128}" width="30" height="12" rx="3" fill="${INK}"/>
      <path d="M366 ${BASE - 128} L374 ${BASE - 206} L382 ${BASE - 128} Z" fill="${GOLD}" opacity=".95"/>
      <path d="M374 ${BASE - 206} V${BASE - 224}" stroke="${INK}" stroke-width="2.5"/>
      <path d="M364 ${BASE - 96} H384 M366 ${BASE - 74} H382" stroke="${GOLD_LIGHT}" stroke-width="2.5" opacity=".7"/>
    </g>
    ${tower(428, 44, 206)}${windows(428, 44, 206, 3, 9)}
    ${tower(482, 32, 142)}${windows(482, 32, 142, 2, 6)}
    ${tower(524, 46, 172)}${windows(524, 46, 172, 3, 8)}
    ${tower(580, 34, 130)}${windows(580, 34, 130, 2, 6)}
    ${tower(622, 30, 100)}${windows(622, 30, 100, 2, 4)}`,

  adelaide: () => `
    ${tower(78, 36, 98)}${windows(78, 36, 98, 3, 4)}
    <!-- St Peter's Cathedral: twin spires over a nave -->
    <g opacity=".96">
      <rect x="132" y="${BASE - 84}" width="92" height="84" rx="3" fill="${INK}"/>
      <path d="M138 ${BASE - 84} L150 ${BASE - 166} L162 ${BASE - 84} Z" fill="${INK}"/>
      <path d="M194 ${BASE - 84} L206 ${BASE - 166} L218 ${BASE - 84} Z" fill="${INK}"/>
      <circle cx="150" cy="${BASE - 172}" r="4" fill="${GOLD}"/>
      <circle cx="206" cy="${BASE - 172}" r="4" fill="${GOLD}"/>
      <path d="M170 ${BASE - 62} h16 v16 h-16 Z" fill="${GOLD}" opacity=".8"/>
      <rect x="146" y="${BASE - 34} " width="10" height="34" rx="5" fill="${GOLD_LIGHT}" opacity=".35"/>
      <rect x="200" y="${BASE - 34}" width="10" height="34" rx="5" fill="${GOLD_LIGHT}" opacity=".35"/>
    </g>
    ${tower(240, 40, 154)}${windows(240, 40, 154, 3, 7)}
    ${tower(290, 32, 122)}${windows(290, 32, 122, 2, 5)}
    <!-- Adelaide Oval: translucent canopy roof on ribs -->
    <g opacity=".95">
      <path d="M336 ${BASE} L336 ${BASE - 40} Q412 ${BASE - 112} 488 ${BASE - 40} L488 ${BASE} Z" fill="${INK}" opacity=".16"/>
      <path d="M336 ${BASE - 40} Q412 ${BASE - 112} 488 ${BASE - 40}" fill="none" stroke="${INK}" stroke-width="5"/>
      <path d="M360 ${BASE - 62} V${BASE} M388 ${BASE - 74} V${BASE} M412 ${BASE - 77} V${BASE}
               M436 ${BASE - 74} V${BASE} M464 ${BASE - 62} V${BASE}"
            stroke="${INK}" stroke-width="2.5" opacity=".45"/>
      <rect x="336" y="${BASE - 14}" width="152" height="14" rx="3" fill="${INK}"/>
      <path d="M336 ${BASE - 40} Q412 ${BASE - 112} 488 ${BASE - 40}" fill="none" stroke="${GOLD}" stroke-width="2.5" opacity=".8" transform="translate(0,6)"/>
    </g>
    ${tower(504, 44, 182)}${windows(504, 44, 182, 3, 8)}
    ${tower(558, 32, 136)}${windows(558, 32, 136, 2, 6)}
    ${tower(598, 42, 160)}${windows(598, 42, 160, 3, 7)}`,
};

const CITIES = [
  { slug: 'brisbane', city: 'Brisbane', region: 'Queensland',
    chips: ['ISO 27001', 'Essential 8 ML2', 'IS18 (QGEA)'] },
  { slug: 'sydney', city: 'Sydney', region: 'New South Wales',
    chips: ['ISO 27001', 'SOC 2 Type II', 'ISO 42001'] },
  { slug: 'melbourne', city: 'Melbourne', region: 'Victoria',
    chips: ['ISO 27001', 'ISO 27701', 'Essential 8'] },
  { slug: 'canberra', city: 'Canberra', region: 'ACT',
    chips: ['IRAP', 'DISP', 'Essential 8 ML2'] },
  { slug: 'perth', city: 'Perth', region: 'Western Australia',
    chips: ['ISO 27001', 'Essential 8 ML2', 'DISP'] },
  { slug: 'adelaide', city: 'Adelaide', region: 'South Australia',
    chips: ['DISP', 'Essential 8 ML2', 'ISO 27001'] },
];

function chipRow(chips) {
  let x = 0;
  return chips.map((label) => {
    const w = 16 + label.length * 6.6;
    const g = `<g transform="translate(${x.toFixed(1)},0)">
        <rect width="${w.toFixed(1)}" height="26" rx="13" fill="${GOLD}" opacity=".12"/>
        <text x="${(w / 2).toFixed(1)}" y="17" text-anchor="middle" font-size="11.5" font-weight="700" fill="${GOLD}">${label}</text>
      </g>`;
    x += w + 8;
    return g;
  }).join('');
}

function svgFor({ slug, city, region, chips }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 470" role="img" aria-labelledby="t-${slug} d-${slug}">
  <title id="t-${slug}">Compliance365 in ${city}</title>
  <desc id="d-${slug}">A stylised ${city} skyline beneath a card listing the compliance frameworks most requested by ${region} organisations: ${chips.join(', ')}.</desc>
  <defs>
    <linearGradient id="bg-${slug}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD}" stop-opacity=".16"/>
      <stop offset="1" stop-color="${INK}" stop-opacity=".16"/>
    </linearGradient>
    <linearGradient id="glow-${slug}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}" stop-opacity=".38"/>
      <stop offset="1" stop-color="${GOLD_LIGHT}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="frame-${slug}"><rect width="720" height="470" rx="26"/></clipPath>
  </defs>

  <rect width="720" height="470" rx="26" fill="url(#bg-${slug})"/>

  <g clip-path="url(#frame-${slug})">
    <!-- horizon glow behind the skyline -->
    <ellipse cx="360" cy="${BASE}" rx="330" ry="150" fill="url(#glow-${slug})"/>

    <!-- skyline -->
    <g font-family="Inter, system-ui, Segoe UI, Roboto, sans-serif">
      ${SKYLINES[slug]().trim()}
    </g>

    <!-- ground band -->
    <rect x="0" y="${BASE}" width="720" height="${470 - BASE}" fill="${INK}" opacity=".06"/>
    <rect x="0" y="${BASE}" width="720" height="3" fill="${GOLD}" opacity=".55"/>
  </g>

  <!-- framework card -->
  <g font-family="Inter, system-ui, Segoe UI, Roboto, sans-serif">
    <rect x="40" y="36" width="416" height="112" rx="16" fill="${CARD}" stroke="${CARD_STROKE}"/>
    <text x="64" y="70" font-size="19" font-weight="800" fill="${INK}">${city}</text>
    <text x="64" y="92" font-size="12.5" fill="${MUTED}">Most requested in ${region}</text>
    <g transform="translate(64,106)">${chipRow(chips)}</g>
  </g>

  <!-- fixed-price badge -->
  <g font-family="Inter, system-ui, Segoe UI, Roboto, sans-serif">
    <rect x="512" y="36" width="168" height="60" rx="14" fill="${INK}"/>
    <text x="596" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="${GOLD_LIGHT}" letter-spacing="1.4">FIXED-PRICE</text>
    <text x="596" y="81" text-anchor="middle" font-size="12" fill="#FAF7F1" opacity=".72">10–14 weeks</text>
  </g>
</svg>
`;
}

for (const c of CITIES) {
  const file = join(OUT, `illus-location-${c.slug}.svg`);
  writeFileSync(file, svgFor(c));
  console.log('wrote', file);
}
