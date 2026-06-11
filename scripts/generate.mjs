// Generates the README's SVG suite — a synthwave wireframe terrain built from
// the last 52 weeks of GitHub contributions, plus matching header, link-pill
// and stack-panel art. Pure SVG/CSS animation, no JS at render time.
//
// Usage: node scripts/generate.mjs [username] [theme]
// Themes live in the THEMES registry at the bottom; the default is set by
// DEFAULT_THEME — edit it and push, the workflow re-renders everything.

import { writeFileSync, mkdirSync } from "node:fs";

const USER = process.argv[2] ?? "Yok4ai";
const W = 880;
const H = 320;
const HORIZON = 200;
const WEEKS = 52;

// --- data -------------------------------------------------------------

const res = await fetch(
  `https://github-contributions-api.jogruber.de/v4/${USER}?y=last`
);
if (!res.ok) throw new Error(`contributions API ${res.status}`);
const data = await res.json();

const today = new Date().toISOString().slice(0, 10);
const days = data.contributions
  .filter((d) => d.date <= today)
  .sort((a, b) => (a.date < b.date ? -1 : 1))
  .slice(-WEEKS * 7);

const weeks = [];
for (let i = 0; i < days.length; i += 7) {
  weeks.push(days.slice(i, i + 7).reduce((s, d) => s + d.count, 0));
}
while (weeks.length < WEEKS) weeks.unshift(0);

const total = days.reduce((s, d) => s + d.count, 0);
// GitHub's profile shows a rolling 365-day total; our 364-day draw window
// undercounts it, so display the API's own last-year figure instead
const lastYear = data.total?.lastYear ?? total;
const maxWeek = Math.max(1, ...weeks);

// --- helpers ----------------------------------------------------------

// deterministic PRNG so re-renders only differ when the data does
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => n.toLocaleString("en-US");
const rotate = (arr, n) => [...arr.slice(n), ...arr.slice(0, n)];

// Ridge geometry spans 2×W so a translateX(-W) loop is seamless.
function ridge(values, maxH) {
  const step = W / values.length;
  const pts = [];
  for (let rep = 0; rep < 2; rep++) {
    values.forEach((v, i) => {
      const x = rep * W + i * step;
      const y = HORIZON - maxH * Math.sqrt(v / maxWeek);
      pts.push([r2(x), r2(y)]);
    });
  }
  pts.push([2 * W, pts[0][1]]); // wrap point: x=2W mirrors x=0

  const line = "M" + pts.map(([x, y]) => `${x},${y}`).join(" L");
  const fill = `M0,${HORIZON} L` + pts.map(([x, y]) => `${x},${y}`).join(" L") + ` L${2 * W},${HORIZON} Z`;
  const verts = pts
    .filter(([, y]) => HORIZON - y > 3)
    .map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${HORIZON}"/>`)
    .join("");
  return { line, fill, verts };
}

const near = ridge(weeks, 115);
const far = ridge(rotate(weeks, 26), 48);

// --- scene pieces -----------------------------------------------------

function stars(palette) {
  const rand = mulberry32(0x59c4a1);
  let out = "";
  for (let i = 0; i < 70; i++) {
    const x = r2(rand() * W);
    const y = r2(10 + rand() * (HORIZON - 60));
    const dx = x - 634;
    const dy = y - 188;
    if (dx * dx + dy * dy < 100 * 100) continue; // keep the sun clear
    const r = r2(0.5 + rand() * 0.9);
    const dur = r2(2.5 + rand() * 4);
    const delay = r2(-rand() * 6);
    out += `<circle class="star" cx="${x}" cy="${y}" r="${r}" style="animation-duration:${dur}s;animation-delay:${delay}s"/>`;
  }
  return `<g fill="${palette.star}">${out}</g>`;
}

function floorGrid(palette) {
  // verticals converge on the vanishing point
  let verts = "";
  for (let i = -12; i <= 12; i++) {
    verts += `<line x1="${r2(W / 2 + i * 7)}" y1="${HORIZON}" x2="${r2(W / 2 + i * 105)}" y2="${H}"/>`;
  }
  // horizontals stream from the horizon toward the viewer
  let horiz = "";
  const N = 8;
  for (let i = 0; i < N; i++) {
    horiz += `<line class="gh" x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}" style="animation-delay:${r2((-6 * i) / N)}s"/>`;
  }
  return `
  <g stroke="${palette.grid}" stroke-width="1" opacity="${palette.gridOpacity}">${verts}</g>
  <g stroke="${palette.grid}" stroke-width="1.2">${horiz}</g>
  <line x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}" stroke="${palette.gridBright}" stroke-width="1.4" opacity="${palette.horizonOpacity}"/>`;
}

function sun(palette) {
  // classic banded synthwave sun, sitting behind the ridges
  let slits = "";
  for (let k = 0; k < 6; k++) {
    const y = 168 + k * 13;
    slits += `<rect x="520" y="${y}" width="230" height="${3 + k * 1.6}" fill="#000"/>`;
  }
  return `
  <mask id="sunmask">
    <circle cx="634" cy="188" r="74" fill="#fff"/>
    ${slits}
  </mask>
  <circle cx="634" cy="188" r="74" fill="url(#sungrad)" mask="url(#sunmask)" opacity="${palette.sunOpacity}"/>`;
}

// --- svg --------------------------------------------------------------

function render(palette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Wireframe terrain generated from ${USER}'s GitHub contributions: ${fmt(lastYear)} in the last year">
<title>${fmt(lastYear)} contributions, rendered as terrain</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${palette.skyTop}"/>
    <stop offset="1" stop-color="${palette.skyBottom}"/>
  </linearGradient>
  <linearGradient id="sungrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${palette.sunTop}"/>
    <stop offset="1" stop-color="${palette.sunBottom}"/>
  </linearGradient>
  <linearGradient id="ridgefill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${palette.ridge}" stop-opacity="0.22"/>
    <stop offset="1" stop-color="${palette.ridge}" stop-opacity="0.02"/>
  </linearGradient>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="3.5"/>
  </filter>
  <clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
</defs>
<style>
  .star { animation: tw 4s ease-in-out infinite; }
  @keyframes tw { 0%,100% { opacity:.15 } 50% { opacity:.9 } }
  .farscroll { animation: scroll 96s linear infinite; }
  .nearscroll { animation: scroll 48s linear infinite; }
  @keyframes scroll { to { transform: translateX(-${W}px) } }
  .gh { animation: gline 6s cubic-bezier(.55,0,1,.45) infinite; opacity: 0; }
  @keyframes gline {
    0% { transform: translateY(0); opacity: 0 }
    12% { opacity: ${palette.ghOpacity} }
    100% { transform: translateY(${H - HORIZON}px); opacity: ${palette.ghOpacityEnd} }
  }
  .shoot { animation: shoot 13s linear infinite; opacity: 0; }
  @keyframes shoot {
    0%, 86% { transform: translate(0,0); opacity: 0 }
    88% { opacity: .8 }
    94%, 100% { transform: translate(-210px,72px); opacity: 0 }
  }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
</style>
<g clip-path="url(#frame)">
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars(palette)}
  <g class="shoot"><line x1="150" y1="44" x2="196" y2="29" stroke="${palette.star}" stroke-width="1.4" stroke-linecap="round"/></g>
  ${sun(palette)}
  <g class="farscroll" stroke="${palette.farRidge}" fill="none" opacity="${palette.farOpacity}" stroke-width="1">
    <path d="${far.line}"/>
  </g>
  <g class="nearscroll">
    <path d="${near.fill}" fill="url(#ridgefill)" stroke="none"/>
    <path d="${near.line}" fill="none" stroke="${palette.ridge}" stroke-width="2.4" filter="url(#glow)" opacity="${palette.glowOpacity}"/>
    <path d="${near.line}" fill="none" stroke="${palette.ridge}" stroke-width="1.5"/>
    <g stroke="${palette.ridge}" stroke-width="0.6" opacity="0.3">${near.verts}</g>
  </g>
  <rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="${palette.floor}"/>
  ${floorGrid(palette)}
  <text x="26" y="38" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="13" letter-spacing="5" fill="${palette.text}">${USER.toUpperCase()}</text>
  <text x="${W - 26}" y="38" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12" letter-spacing="1" fill="${palette.text}">${fmt(lastYear)} CONTRIBUTIONS / LAST YEAR</text>
  <rect width="${W}" height="${H}" rx="14" fill="none" stroke="${palette.border}" stroke-width="1"/>
</g>
</svg>`;
}

// --- companion panels ---------------------------------------------------

const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
const REDUCED = `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }`;

const STACK = [
  ["languages", ["python", "typescript", "rust", "bash"]],
  ["frontend", ["next.js", "tailwind", "three.js"]],
  ["backend / infra", ["node.js", "fastapi", "aws sqs", "s3", "docker", "vercel", "railway"]],
  ["ai / ml", ["pytorch", "langchain", "langraph", "hugging face", "ultralytics"]],
  ["databases", ["postgresql", "supabase", "mongodb"]],
  ["mobile", ["flutter"]],
  ["daily", ["linux", "git", "tmux"]],
];

// banded synthwave sun, parameterized so panels can echo the hero's
function bandedSun(id, cx, cy, r, opacity) {
  let slits = "";
  const n = 6;
  for (let k = 0; k < n; k++) {
    const y = cy - r + (k + 2.2) * ((2 * r) / (n + 2.5));
    slits += `<rect x="${cx - r}" y="${r2(y)}" width="${2 * r}" height="${r2(2 + k * 1.4)}" fill="#000"/>`;
  }
  return `
  <mask id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>${slits}</mask>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sungrad)" mask="url(#${id})" opacity="${opacity}"/>`;
}

function renderHeader(p) {
  const HH = 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}" role="img" aria-label="Imroz Eshan — generative ai, computer vision">
<defs>
  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${p.ridge}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${p.ridge}" stop-opacity="0.9"/>
    <stop offset="1" stop-color="${p.ridge}" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="sweepgrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${p.sunTop}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${p.sunTop}" stop-opacity="0.9"/>
    <stop offset="1" stop-color="${p.sunTop}" stop-opacity="0"/>
  </linearGradient>
  <filter id="hglow" x="-40%" y="-400%" width="180%" height="900%"><feGaussianBlur stdDeviation="2.6"/></filter>
  <clipPath id="rulespan"><rect x="200" y="11" width="480" height="10"/></clipPath>
</defs>
<style>
  .sweep { animation: sweep 6s cubic-bezier(.4,0,.6,1) infinite; }
  @keyframes sweep { 0% { transform: translateX(0) } 45%, 100% { transform: translateX(640px) } }
  ${REDUCED}
</style>
<rect x="200" y="15.2" width="480" height="1.8" fill="url(#rule)" filter="url(#hglow)"/>
<rect x="200" y="15.4" width="480" height="1.2" fill="url(#rule)"/>
<g clip-path="url(#rulespan)"><rect class="sweep" x="120" y="15" width="80" height="2" fill="url(#sweepgrad)"/></g>
<rect x="${W / 2 - 3}" y="13" width="6" height="6" transform="rotate(45 ${W / 2} 16)" fill="${p.ridge}"/>
<text x="${W / 2 - 10}" y="50" text-anchor="end" font-family="${MONO}" font-size="11.5" letter-spacing="4" fill="${p.text}">GENERATIVE AI</text>
<circle cx="${W / 2}" cy="46" r="2" fill="${p.ridge}"/>
<text x="${W / 2 + 14}" y="50" text-anchor="start" font-family="${MONO}" font-size="11.5" letter-spacing="4" fill="${p.text}">COMPUTER VISION</text>
</svg>`;
}

// 16×16 icon fragments, drawn in the accent color
const ICONS = {
  globe: (c) => `<g fill="none" stroke="${c}" stroke-width="1.3"><circle cx="8" cy="8" r="6.2"/><ellipse cx="8" cy="8" rx="2.7" ry="6.2"/><line x1="1.8" y1="8" x2="14.2" y2="8"/></g>`,
  linkedin: (c) => `<path fill="${c}" transform="scale(0.667)" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/>`,
};

function renderLink(label, width, p, delay = 0, icon = null) {
  const LH = 26;
  const textW = label.length * 8; // mono ~6px/char at 10 + 2 letter-spacing
  const startX = r2((width - (11 + 7 + textW)) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${LH}" width="${width}" height="${LH}" role="img" aria-label="${label.toLowerCase()}">
<defs>
  <linearGradient id="lsweep" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${p.sunTop}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${p.sunTop}" stop-opacity="${p.sweepOpacity}"/>
    <stop offset="1" stop-color="${p.sunTop}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="lclip"><rect x="1" y="1" width="${width - 2}" height="${LH - 2}" rx="5"/></clipPath>
  ${p.glow ? `<filter id="bglow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="1.7"/></filter>` : ""}
</defs>
<style>
  .ls { animation: ls 6s cubic-bezier(.4,0,.6,1) ${delay}s infinite; }
  @keyframes ls { 0% { transform: translateX(-50px) } 45%, 100% { transform: translateX(${width + 50}px) } }
  ${REDUCED}
</style>
<rect x="0.5" y="0.5" width="${width - 1}" height="${LH - 1}" rx="6" fill="${p.ridge}" fill-opacity="0.06"/>
${p.glow ? `<g filter="url(#bglow)" opacity="0.75">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${LH - 1}" rx="6" fill="none" stroke="${p.sunTop}"/>
  <g transform="translate(${startX},7.5) scale(0.7)">${ICONS[icon](p.sunTop)}</g>
  <text x="${r2(startX + 18)}" y="17" font-family="${MONO}" font-size="10" letter-spacing="2" fill="${p.sunTop}">${label}</text>
</g>` : ""}
<rect x="0.5" y="0.5" width="${width - 1}" height="${LH - 1}" rx="6" fill="none" stroke="${p.ridge}" stroke-opacity="${p.glow ? 0.85 : 0.4}"/>
<g clip-path="url(#lclip)"><rect class="ls" width="40" height="${LH}" fill="url(#lsweep)"/></g>
<g transform="translate(${startX},7.5) scale(0.7)">${ICONS[icon](p.ridge)}</g>
<text x="${r2(startX + 18)}" y="17" font-family="${MONO}" font-size="10" letter-spacing="2" fill="${p.heading}">${label}</text>
</svg>`;
}

function renderStack(p) {
  const SH = 336;
  const SHZ = 296; // panel horizon
  const tools = STACK.reduce((s, [, items]) => s + items.length, 0);
  const charW = 7.25;
  const chipH = 22;
  const padX = 11;
  const gap = 10;
  const top = 64;
  const step = 32;

  // category labels + tool chips, neon-flickering on with a stagger
  let body = "";
  let ci = 0;
  STACK.forEach(([cat, items], r) => {
    const y = top + r * step;
    body += `
  <rect x="24" y="${y + 5}" width="3" height="12" rx="1.5" fill="${p.ridge}" opacity="0.85"/>
  <text x="36" y="${y + 15}" font-family="${MONO}" font-size="11" letter-spacing="2" fill="${p.ridge}">${cat.toUpperCase()}</text>`;
    let x = 184;
    items.forEach((it) => {
      const w = r2(it.length * charW + 2 * padX);
      body += `
  <g class="chip" style="animation-delay:${r2(0.1 + ci * 0.07)}s">
    <rect x="${r2(x)}" y="${y}" width="${w}" height="${chipH}" rx="6" fill="${p.ridge}" fill-opacity="0.07" stroke="${p.ridge}" stroke-opacity="0.45"/>
    <text x="${r2(x + w / 2)}" y="${y + 15}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${p.body}">${it}</text>
  </g>`;
      x += w + gap;
      ci++;
    });
  });

  // stars, kept clear of the sun
  const rand = mulberry32(0x7e57ac);
  let st = "";
  for (let i = 0; i < 26; i++) {
    const x = r2(rand() * W);
    const y = r2(8 + rand() * (SHZ - 80));
    const dx = x - 780;
    const dy = y - SHZ;
    if (dx * dx + dy * dy < 120 * 120) continue;
    st += `<circle class="star" cx="${x}" cy="${y}" r="${r2(0.5 + rand() * 0.8)}" style="animation-duration:${r2(2.5 + rand() * 4)}s;animation-delay:${r2(-rand() * 6)}s"/>`;
  }

  // mini perspective floor, same construction as the hero's
  let verts = "";
  for (let i = -12; i <= 12; i++) {
    verts += `<line x1="${r2(W / 2 + i * 7)}" y1="${SHZ}" x2="${r2(W / 2 + i * 105)}" y2="${SH}"/>`;
  }
  let horiz = "";
  for (let i = 0; i < 5; i++) {
    horiz += `<line class="gh" x1="0" y1="${SHZ}" x2="${W}" y2="${SHZ}" style="animation-delay:${r2((-6 * i) / 5)}s"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${SH}" width="${W}" height="${SH}" role="img" aria-label="Tech stack: ${STACK.map(([c, i]) => `${c}: ${i.join(", ")}`).join("; ")}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.skyTop}"/>
    <stop offset="1" stop-color="${p.skyBottom}"/>
  </linearGradient>
  <linearGradient id="sungrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.sunTop}"/>
    <stop offset="1" stop-color="${p.sunBottom}"/>
  </linearGradient>
  <linearGradient id="scangrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.ridge}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${p.ridge}" stop-opacity="1"/>
    <stop offset="1" stop-color="${p.ridge}" stop-opacity="0"/>
  </linearGradient>
  <filter id="bigglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18"/></filter>
  <clipPath id="frame"><rect width="${W}" height="${SH}" rx="14"/></clipPath>
</defs>
<style>
  .star { animation: tw 4s ease-in-out infinite; }
  @keyframes tw { 0%,100% { opacity:.15 } 50% { opacity:.9 } }
  .chip { opacity: 0; animation: chipon 0.9s cubic-bezier(.22,.61,.36,1) both; }
  @keyframes chipon {
    0% { opacity: 0; transform: translateY(5px) }
    100% { opacity: 1; transform: translateY(0) }
  }
  .gh { animation: gline 6s cubic-bezier(.55,0,1,.45) infinite; opacity: 0; }
  @keyframes gline {
    0% { transform: translateY(0); opacity: 0 }
    12% { opacity: ${p.ghOpacity} }
    100% { transform: translateY(${SH - SHZ}px); opacity: ${p.ghOpacityEnd} }
  }
  .scan { animation: scan 9s linear infinite; }
  @keyframes scan { from { transform: translateY(-70px) } to { transform: translateY(${SH}px) } }
  .cursor { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 0%, 49% { opacity: 0.8 } 50%, 100% { opacity: 0 } }
  ${REDUCED}
</style>
<g clip-path="url(#frame)">
  <rect width="${W}" height="${SH}" fill="url(#sky)"/>
  <g fill="${p.star}">${st}</g>
  <circle cx="780" cy="${SHZ - 24}" r="104" fill="${p.sunBottom}" opacity="${p.sunHaloOpacity}" filter="url(#bigglow)"/>
  ${bandedSun("stacksun", 780, SHZ, 92, p.stackSunOpacity)}
  <rect y="${SHZ}" width="${W}" height="${SH - SHZ}" fill="${p.floor}"/>
  <g stroke="${p.grid}" stroke-width="1" opacity="${p.gridOpacity}">${verts}</g>
  <g stroke="${p.grid}" stroke-width="1.2">${horiz}</g>
  <line x1="0" y1="${SHZ}" x2="${W}" y2="${SHZ}" stroke="${p.gridBright}" stroke-width="1.4" opacity="${p.horizonOpacity}"/>
  <text x="26" y="38" font-family="${MONO}" font-size="13" letter-spacing="5" fill="${p.text}">S T A C K</text>
  <text x="${W - 26}" y="38" text-anchor="end" font-family="${MONO}" font-size="12" letter-spacing="1" fill="${p.text}">${tools} TECHNOLOGIES</text>
  ${body}
  <text x="36" y="${SH - 14}" font-family="${MONO}" font-size="12.5" fill="${p.text}">❯</text>
  <rect class="cursor" x="52" y="${SH - 25}" width="7" height="13" fill="${p.ridge}"/>
  <rect class="scan" width="${W}" height="60" fill="url(#scangrad)" opacity="${p.scanOpacity}"/>
  <rect width="${W}" height="${SH}" rx="14" fill="none" stroke="${p.border}" stroke-width="1"/>
</g>
</svg>`;
}

// --- themes -------------------------------------------------------------
// each theme: { dark, light, badge } — dark/light feed the <picture> pair,
// badge is a single theme-proof palette that must read on both backgrounds

const DEFAULT_THEME = "mono";

const synthwaveDark = {
  skyTop: "#03080a",
  skyBottom: "#0c1417",
  floor: "#05090b",
  star: "#d8e3e6",
  grid: "#ff2056",
  gridBright: "#ff4d7a",
  gridOpacity: 0.3,
  ghOpacity: 0.6,
  ghOpacityEnd: 0.35,
  ridge: "#ff2d6f",
  farRidge: "#ff6e8e",
  farOpacity: 0.35,
  sunTop: "#ff5c8a",
  sunBottom: "#ff1744",
  sunOpacity: 0.9,
  text: "#8a98a0",
  border: "#26121b",
  heading: "#dbe4e9",
  body: "#aab6bf",
  stackSunOpacity: 0.62,
  sunHaloOpacity: 0.1,
  scanOpacity: 0.045,
  glowOpacity: 0.65,
  horizonOpacity: 0.8,
  sweepOpacity: 0.35,
};

const synthwaveLight = {
  skyTop: "#fbfaf7",
  skyBottom: "#f6eef2",
  floor: "#f8f4f4",
  star: "#94a3b8",
  grid: "#ff2056",
  gridBright: "#ff7da0",
  gridOpacity: 0.12,
  ghOpacity: 0.25,
  ghOpacityEnd: 0.1,
  ridge: "#f01a62",
  farRidge: "#ff8aa8",
  farOpacity: 0.35,
  sunTop: "#ff5c8a",
  sunBottom: "#ff1744",
  sunOpacity: 0.6,
  text: "#64748b",
  border: "#eadfe5",
  heading: "#334155",
  body: "#52606d",
  stackSunOpacity: 0.4,
  sunHaloOpacity: 0.05,
  scanOpacity: 0.025,
  glowOpacity: 0.25,
  horizonOpacity: 0.5,
  sweepOpacity: 0.45,
};

const monoDark = {
  skyTop: "#040404",
  skyBottom: "#0f0f0f",
  floor: "#070707",
  star: "#e6e6e6",
  grid: "#d4d4d4",
  gridBright: "#ffffff",
  gridOpacity: 0.22,
  ghOpacity: 0.5,
  ghOpacityEnd: 0.28,
  ridge: "#ffffff",
  farRidge: "#9a9a9a",
  farOpacity: 0.35,
  sunTop: "#ffffff",
  sunBottom: "#b9b9b9",
  sunOpacity: 0.85,
  text: "#8f8f8f",
  border: "#262626",
  heading: "#ededed",
  body: "#bdbdbd",
  stackSunOpacity: 0.5,
  sunHaloOpacity: 0.08,
  scanOpacity: 0.04,
  glowOpacity: 0.5,
  horizonOpacity: 0.8,
  sweepOpacity: 0.3,
};

const monoLight = {
  skyTop: "#fcfcfc",
  skyBottom: "#f1f1f1",
  floor: "#f6f6f6",
  star: "#9a9a9a",
  grid: "#111111",
  gridBright: "#444444",
  gridOpacity: 0.12,
  ghOpacity: 0.22,
  ghOpacityEnd: 0.08,
  ridge: "#111111",
  farRidge: "#8a8a8a",
  farOpacity: 0.35,
  sunTop: "#555555",
  sunBottom: "#111111",
  sunOpacity: 0.5,
  text: "#6e6e6e",
  border: "#e4e4e4",
  heading: "#1a1a1a",
  body: "#3d3d3d",
  stackSunOpacity: 0.35,
  sunHaloOpacity: 0.04,
  scanOpacity: 0.025,
  glowOpacity: 0.2,
  horizonOpacity: 0.5,
  sweepOpacity: 0.35,
};

const THEMES = {
  synthwave: {
    dark: synthwaveDark,
    light: synthwaveLight,
    badge: { ridge: "#ff2d6f", sunTop: "#ff5c8a", heading: "#f02864", sweepOpacity: 0.4 },
  },
  mono: {
    dark: monoDark,
    light: monoLight,
    badge: { ridge: "#e0e0e0", sunTop: "#ffffff", heading: "#f2f2f2", sweepOpacity: 0.5, glow: true },
  },
};

// --- output ---------------------------------------------------------------

const themeName = process.argv[3] ?? process.env.THEME ?? DEFAULT_THEME;
const theme = THEMES[themeName];
if (!theme) throw new Error(`unknown theme "${themeName}" — pick one of: ${Object.keys(THEMES).join(", ")}`);

mkdirSync("assets", { recursive: true });
for (const [mode, p] of [["dark", theme.dark], ["light", theme.light]]) {
  writeFileSync(`assets/contrib-${mode}.svg`, render(p));
  writeFileSync(`assets/header-${mode}.svg`, renderHeader(p));
  writeFileSync(`assets/stack-${mode}.svg`, renderStack(p));
}

// badges are single theme-proof files — GitHub's <picture> dark/light
// switching proved unreliable through the camo cache
writeFileSync("assets/badge-portfolio.svg", renderLink("PORTFOLIO", 118, theme.badge, 0, "globe"));
writeFileSync("assets/badge-linkedin.svg", renderLink("LINKEDIN", 110, theme.badge, 0.7, "linkedin"));
console.log(`rendered ${fmt(total)} contributions across ${weeks.length} weeks (peak week: ${maxWeek}) — theme: ${themeName}`);
