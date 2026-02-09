#!/usr/bin/env node

const PALETTE = {
  primary: '#2563EB',
  secondary: '#0EA5E9',
  tertiary: '#14B8A6',
  ink: '#0B1220',
  halo: '#FFFFFF'
};

const BACKGROUNDS = [
  '#FFFFFF', '#F3EAD3', '#FBF1C7',
  '#CBD5E1', '#829181', '#665C54',
  '#1A1B26', '#111827', '#2D353B'
];

const FILL_THRESHOLD = 2.2;
const EDGE_THRESHOLD = 3.0;

function srgbChannel(value) {
  const n = value / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrast(hexA, hexB) {
  const l1 = luminance(hexA);
  const l2 = luminance(hexB);
  const high = Math.max(l1, l2);
  const low = Math.min(l1, l2);
  return (high + 0.05) / (low + 0.05);
}

const rows = BACKGROUNDS.map((bg) => {
  const primary = contrast(PALETTE.primary, bg);
  const secondary = contrast(PALETTE.secondary, bg);
  const tertiary = contrast(PALETTE.tertiary, bg);
  const ink = contrast(PALETTE.ink, bg);
  const halo = contrast(PALETTE.halo, bg);

  const fillPass = Math.max(primary, secondary, tertiary) >= FILL_THRESHOLD;
  const edgePass = Math.max(ink, halo) >= EDGE_THRESHOLD;
  const pass = fillPass && edgePass;

  return {
    bg,
    primary,
    secondary,
    tertiary,
    ink,
    halo,
    fillPass,
    edgePass,
    pass
  };
});

console.log('Option 2 transparent contrast check');
console.log(`Fill threshold: ${FILL_THRESHOLD}`);
console.log(`Edge threshold: ${EDGE_THRESHOLD}`);
console.log('');

for (const row of rows) {
  const status = row.pass ? 'PASS' : 'FAIL';
  console.log(
    `${status} bg ${row.bg} | primary ${row.primary.toFixed(2)} | secondary ${row.secondary.toFixed(2)} | tertiary ${row.tertiary.toFixed(2)} | ink ${row.ink.toFixed(2)} | halo ${row.halo.toFixed(2)}`
  );
}

const failed = rows.filter((row) => !row.pass);
if (failed.length) {
  console.error(`\n${failed.length} background(s) failed contrast gate.`);
  process.exit(1);
}

const minPrimary = Math.min(...rows.map((r) => r.primary));
const minSecondary = Math.min(...rows.map((r) => r.secondary));
const minTertiary = Math.min(...rows.map((r) => r.tertiary));
const minInk = Math.min(...rows.map((r) => r.ink));
const minHalo = Math.min(...rows.map((r) => r.halo));

console.log('\nAll backgrounds passed.');
console.log(`Worst primary contrast: ${minPrimary.toFixed(2)}`);
console.log(`Worst secondary contrast: ${minSecondary.toFixed(2)}`);
console.log(`Worst tertiary contrast: ${minTertiary.toFixed(2)}`);
console.log(`Worst ink contrast: ${minInk.toFixed(2)}`);
console.log(`Worst halo contrast: ${minHalo.toFixed(2)}`);
