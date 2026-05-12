#!/usr/bin/env node
// Generate v3/web-spirals.harmony — a deterministic 100-stroke
// composition for the v3 `web` brush. Five logarithmic spirals at
// varying scales/colors, sliced into short stroke segments so the
// web brush's points accumulator picks up cross-stroke connections
// inside and between them, plus 45 short "dot" strokes scattered
// near each spiral so they get woven into the web.
//
// Run: node v3/_gen-web-spirals.js
//   → writes v3/web-spirals.harmony (open in v3 via File → Open)

'use strict';

const fs   = require('fs');
const path = require('path');

const W = 1200, H = 800;

// Deterministic dot-position RNG (independent from per-stroke render seeds).
let _ps = 0xBEEFCAFE;
function progRand() {
	_ps = (_ps + 0x6D2B79F5) | 0;
	let t = _ps;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const prog = [];
let seedSrc = 0x20000;
function action(brush, color, size, opacity, points) {
	prog.push({ brush, color, size, opacity, seed: seedSrc++, points });
}

// ── Spiral generator ────────────────────────────────────────────────
// Emits `strokeCount` short web strokes along a logarithmic spiral.
// Each stroke is `ptsPerStroke` arc-points. Subsequent strokes build
// up the web accumulator; the brush's stochastic connection logic
// (50 px radius, 10% per pair) does the rest.
function emitSpiral(cx, cy, opts) {
	const baseRadius   = opts.baseRadius;
	const growth       = opts.growth;        // exponential growth factor per radian
	const turns        = opts.turns;
	const strokeCount  = opts.strokeCount;
	const ptsPerStroke = opts.ptsPerStroke;
	const color        = opts.color;
	const size         = opts.size;
	const opacity      = opts.opacity;
	const dir          = opts.cw ? 1 : -1;
	const phase        = opts.phase || 0;

	const totalTheta   = turns * Math.PI * 2;
	const dThetaStroke = totalTheta / strokeCount;
	for (let i = 0; i < strokeCount; i++) {
		const pts = [];
		for (let j = 0; j <= ptsPerStroke; j++) {
			const tStroke = i + j / ptsPerStroke;
			const theta   = tStroke * dThetaStroke + phase;
			const r       = baseRadius * Math.pow(growth, theta);
			pts.push({
				x: cx + Math.cos(theta * dir) * r,
				y: cy + Math.sin(theta * dir) * r
			});
		}
		action('web', color, size, opacity, pts);
	}
	return strokeCount;
}

// ── Connecting dot ──────────────────────────────────────────────────
// A two-point stroke with both points nearly identical. strokeStart
// fires on the first, stroke() on the second, which (a) pushes the
// point into web.points and (b) runs the connection-probability pass
// against everything already in the accumulator. So the dot lands as
// a visible node AND becomes a connection target for later strokes.
function emitDot(x, y, color, size) {
	action('web', color, size, 0.85, [
		{ x: x,         y: y         },
		{ x: x + 0.6,   y: y + 0.4   }
	]);
}

function jitter(amp) { return (progRand() - 0.5) * 2 * amp; }

// ── Composition ─────────────────────────────────────────────────────
// Five spirals at different scales / colors / rotations, asymmetrically
// placed so the visual weight is off-centre (more interesting than a
// symmetric grid). Colors run cool → warm → cool around the canvas.

const SPIRALS = [
	{
		// Centre: large slow cobalt-blue spiral
		cx: W * 0.52, cy: H * 0.50,
		baseRadius: 3.5, growth: 1.20, turns: 4.0,
		strokeCount: 14, ptsPerStroke: 5,
		color: [55, 120, 220], size: 1.6, opacity: 0.78,
		cw: true, phase: 0.4
	},
	{
		// Upper-left: tight magenta swirl
		cx: W * 0.20, cy: H * 0.30,
		baseRadius: 2.5, growth: 1.18, turns: 3.0,
		strokeCount: 11, ptsPerStroke: 4,
		color: [210, 60, 150], size: 1.5, opacity: 0.75,
		cw: false, phase: 1.1
	},
	{
		// Upper-right: warm amber spiral, slower expansion
		cx: W * 0.79, cy: H * 0.27,
		baseRadius: 2.8, growth: 1.13, turns: 3.6,
		strokeCount: 11, ptsPerStroke: 4,
		color: [250, 145, 50], size: 1.5, opacity: 0.78,
		cw: true, phase: 0.0
	},
	{
		// Lower-left: small fast cyan spiral
		cx: W * 0.28, cy: H * 0.75,
		baseRadius: 2.2, growth: 1.24, turns: 2.6,
		strokeCount: 9, ptsPerStroke: 5,
		color: [50, 190, 215], size: 1.3, opacity: 0.72,
		cw: true, phase: 2.0
	},
	{
		// Lower-right: medium lime spiral
		cx: W * 0.76, cy: H * 0.74,
		baseRadius: 2.8, growth: 1.17, turns: 2.9,
		strokeCount: 10, ptsPerStroke: 4,
		color: [180, 220, 70], size: 1.4, opacity: 0.74,
		cw: false, phase: 0.7
	}
];
// 14 + 11 + 11 + 9 + 10 = 55 spiral strokes

let spiralStrokeTotal = 0;
for (const s of SPIRALS) {
	spiralStrokeTotal += emitSpiral(s.cx, s.cy, s);
}

// ── Dots — 45 across the five clusters ──────────────────────────────
// Each spiral gets 9 dots placed at random radii within 80 px of its
// centre so the web brush's 50 px connection radius reaches both
// dots-to-spiral and dot-to-dot.
const DOTS_PER_CLUSTER = 9;
for (const s of SPIRALS) {
	for (let i = 0; i < DOTS_PER_CLUSTER; i++) {
		const a  = progRand() * Math.PI * 2;
		const r  = 12 + progRand() * 68;
		const dx = Math.cos(a) * r + jitter(6);
		const dy = Math.sin(a) * r + jitter(6);
		// dot tint = spiral colour with a tiny lift/cool wobble so the
		// composition reads as a coherent palette
		const tint = [
			Math.max(0, Math.min(255, s.color[0] + (progRand() * 50 - 25))),
			Math.max(0, Math.min(255, s.color[1] + (progRand() * 50 - 25))),
			Math.max(0, Math.min(255, s.color[2] + (progRand() * 50 - 25)))
		].map(Math.round);
		emitDot(s.cx + dx, s.cy + dy, tint, 1.6 + progRand() * 1.2);
	}
}

// ── Final payload ───────────────────────────────────────────────────
const payload = {
	format: 'harmony-v3',
	version: 1,
	createdAt: new Date().toISOString(),
	width: W,
	height: H,
	pixelRatio: 1,
	background: [250, 250, 250],
	index: prog.length - 1,
	actions: prog
};

const out  = path.join(__dirname, 'web-spirals.harmony');
const json = JSON.stringify(payload);
fs.writeFileSync(out, json);

const stats = fs.statSync(out);
const pointCount = prog.reduce((n, a) => n + (a.points ? a.points.length : 0), 0);
console.log(`Wrote ${out}`);
console.log(`  ${prog.length.toLocaleString()} strokes  ` +
	`(${spiralStrokeTotal} spiral + ${prog.length - spiralStrokeTotal} dots)`);
console.log(`  ${pointCount.toLocaleString()} points total`);
console.log(`  ${stats.size.toLocaleString()} bytes  (${(stats.size / 1024).toFixed(1)} KB)`);

// And a gzipped copy for the size comparison.
const zlib = require('zlib');
const gz = zlib.gzipSync(json);
const outGz = path.join(__dirname, 'web-spirals.harmony.gz');
fs.writeFileSync(outGz, gz);
console.log(`\nWrote ${outGz}`);
console.log(`  ${gz.length.toLocaleString()} bytes  (${(gz.length / 1024).toFixed(1)} KB, ${((gz.length / stats.size) * 100).toFixed(1)}% of raw)`);
