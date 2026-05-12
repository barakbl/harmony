#!/usr/bin/env node
// Generate v3/benchmark-5000.harmony — the same 5000-stroke deterministic
// cityscape the benchmark runs in-browser, saved as the v3 vector format
// (plain JSON; can be opened from the v3 "Open" menu).
//
// Run: node v3/_gen-benchmark-5000.js
//
// Mirrors v3/benchmark.html exactly: progReset(0xC0DEFACE) → progRand() →
// buildProgramCity(5000). If that file's generator changes, this one
// should be kept in sync.

'use strict';

const fs   = require('fs');
const path = require('path');

const W = 1200, H = 800;

// ── Deterministic program-time RNG (independent from per-stroke _r()) ──
let _ps = 0xC0DEFACE;
function progRand() {
	_ps = (_ps + 0x6D2B79F5) | 0;
	let t = _ps;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function progReset(seed) { _ps = seed | 0; }

function buildProgramCity(targetCount) {
	progReset(0xC0DEFACE);
	const prog = [];
	let seedSrc = 0x10000;
	function action(brush, color, size, opacity, points) {
		prog.push({ brush, color, size, opacity, seed: seedSrc++, points });
	}
	function rng(lo, hi) { return lo + progRand() * (hi - lo); }
	function lineStrokePts(x1, y1, x2, y2, n) {
		const pts = [];
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
		}
		return pts;
	}
	const perPhase = Math.max(1, Math.round(targetCount / 10));
	const phaseEnds = [];
	for (let pi = 1; pi <= 10; pi++) phaseEnds.push(pi * perPhase);
	phaseEnds[9] = targetCount;

	// 1. Sky watercolor wisps
	while (prog.length < phaseEnds[0]) {
		const topMix = progRand();
		const y = 20 + topMix * (H * 0.45);
		const x = rng(-80, W + 80);
		const n = 5 + ((progRand() * 8) | 0);
		const step = rng(8, 18);
		const pts = [];
		for (let j = 0; j < n; j++) pts.push({ x: x + j * step, y: y + (progRand() - 0.5) * 8 });
		const r = Math.round(60 + topMix * 200);
		const g = Math.round(80 + topMix * 140);
		const b = Math.round(160 - topMix * 60);
		action('watercolor', [r, g, b], rng(22, 36), 0.10, pts);
	}

	// 2. Sun + radial sketchy
	const sunX = W * 0.74, sunY = H * 0.22;
	while (prog.length < phaseEnds[1]) {
		const a = progRand() * Math.PI * 2;
		const r0 = rng(15, 90);
		const r1 = r0 + rng(20, 100);
		const n2 = 4 + ((progRand() * 4) | 0);
		const pts2 = [];
		for (let j = 0; j <= n2; j++) {
			const t = j / n2;
			const rr = r0 + (r1 - r0) * t;
			pts2.push({ x: sunX + Math.cos(a) * rr, y: sunY + Math.sin(a) * rr });
		}
		action('simple', [255, 200 + ((progRand()*40)|0), 90 + ((progRand()*60)|0)], rng(1, 2.5), 0.35, pts2);
	}

	// 3. Distant mountains
	while (prog.length < phaseEnds[2]) {
		const cx = rng(-100, W + 100);
		const baseY = H * 0.55 + (progRand() - 0.5) * 10;
		const peakH = rng(60, 220);
		const span = rng(140, 360);
		const n3 = 10 + ((progRand() * 4) | 0);
		const pts3 = [];
		for (let j = 0; j <= n3; j++) {
			const t = j / n3;
			const bell = Math.sin(t * Math.PI);
			pts3.push({ x: cx + (t - 0.5) * span, y: baseY - peakH * bell + (progRand() - 0.5) * 5 });
		}
		action('simple', [60 + ((progRand()*30)|0), 70 + ((progRand()*25)|0), 95 + ((progRand()*30)|0)], rng(0.7, 1.4), 0.5, pts3);
	}

	// 4. Distant city silhouette
	while (prog.length < phaseEnds[3]) {
		const bw4 = rng(28, 90);
		const bh4 = rng(80, 280);
		const bx4 = rng(0, W);
		const baseY4 = H * 0.72;
		action('simple', [30, 36, 52], 1.4, 0.92, lineStrokePts(bx4, baseY4, bx4, baseY4 - bh4, 6));
		if (prog.length >= phaseEnds[3]) break;
		action('simple', [30, 36, 52], 1.4, 0.92, lineStrokePts(bx4 + bw4, baseY4, bx4 + bw4, baseY4 - bh4, 6));
		if (prog.length >= phaseEnds[3]) break;
		action('simple', [30, 36, 52], 1.4, 0.92, lineStrokePts(bx4, baseY4 - bh4, bx4 + bw4, baseY4 - bh4, 6));
		if (prog.length >= phaseEnds[3]) break;
		const sn = 1 + ((progRand() * 3) | 0);
		for (let k = 0; k < sn && prog.length < phaseEnds[3]; k++) {
			const sy = baseY4 - bh4 + (k + 1) * (bh4 / (sn + 1));
			action('simple', [60, 72, 95], 0.6, 0.4, lineStrokePts(bx4, sy, bx4 + bw4, sy, 5));
		}
	}

	// 5. Mid-distance buildings
	while (prog.length < phaseEnds[4]) {
		const bw5 = rng(60, 140);
		const bh5 = rng(120, 360);
		const bx5 = rng(0, W);
		const baseY5 = H * 0.80;
		const tint = [40 + ((progRand() * 30) | 0), 50 + ((progRand() * 30) | 0), 80 + ((progRand() * 40) | 0)];
		action('simple', tint, 2.0, 0.95, lineStrokePts(bx5, baseY5, bx5, baseY5 - bh5, 8));
		if (prog.length >= phaseEnds[4]) break;
		action('simple', tint, 2.0, 0.95, lineStrokePts(bx5 + bw5, baseY5, bx5 + bw5, baseY5 - bh5, 8));
		if (prog.length >= phaseEnds[4]) break;
		action('simple', tint, 2.0, 0.95, lineStrokePts(bx5, baseY5 - bh5, bx5 + bw5, baseY5 - bh5, 8));
		if (prog.length >= phaseEnds[4]) break;
		const washPts = [];
		for (let j = 0; j <= 5; j++) {
			const t = j / 5;
			washPts.push({ x: bx5 + bw5 * t, y: baseY5 - bh5 * 0.5 + (progRand() - 0.5) * 4 });
		}
		action('watercolor', tint, rng(28, 50), 0.10, washPts);
	}

	// 6. Windows
	while (prog.length < phaseEnds[5]) {
		const cx6 = rng(40, W - 40);
		const cy6 = rng(H * 0.30, H * 0.78);
		const warm = (progRand() < 0.65);
		const rgb = warm ? [255, 220, 130] : [180, 200, 240];
		action('stipple', rgb, rng(2.5, 4.5), rng(0.55, 0.85), [{ x: cx6, y: cy6 }]);
	}

	// 7. Road
	while (prog.length < phaseEnds[6]) {
		const startX = rng(-50, W);
		const y7 = H * 0.85 + (progRand() - 0.5) * 30;
		const dx = rng(60, 180);
		const pts7 = lineStrokePts(startX, y7, startX + dx, y7 + (progRand() - 0.5) * 8, 8);
		action('calligraphy', [25, 28, 40], rng(2, 5), rng(0.5, 0.9), pts7);
	}

	// 8. Foliage
	while (prog.length < phaseEnds[7]) {
		const tx = rng(0, W);
		const ty = rng(H * 0.72, H * 0.86);
		const sp = rng(6, 16);
		const pts8 = [
			{ x: tx,             y: ty },
			{ x: tx + sp,        y: ty - sp * 0.6 },
			{ x: tx + sp * 0.5,  y: ty - sp * 1.2 },
			{ x: tx,             y: ty - sp * 0.8 },
			{ x: tx - sp * 0.5,  y: ty - sp * 0.4 }
		];
		action('simple', [40 + ((progRand()*40)|0), 90 + ((progRand()*50)|0), 50 + ((progRand()*30)|0)], rng(1, 2.2), 0.55, pts8);
	}

	// 9. Crowd / birds
	while (prog.length < phaseEnds[8]) {
		if (progRand() < 0.5) {
			const bx9 = rng(50, W - 50);
			const by9 = rng(80, H * 0.35);
			const w9  = rng(8, 18);
			action('simple', [40, 44, 60], 1.0, 0.7, [
				{ x: bx9 - w9,        y: by9 },
				{ x: bx9 - w9 * 0.4,  y: by9 - w9 * 0.5 },
				{ x: bx9,             y: by9 - w9 * 0.15 },
				{ x: bx9 + w9 * 0.4,  y: by9 - w9 * 0.5 },
				{ x: bx9 + w9,        y: by9 }
			]);
		} else {
			const px = rng(20, W - 20);
			const py = H * 0.86 + (progRand() - 0.5) * 8;
			const sh = rng(10, 22);
			action('simple', [20, 22, 28], rng(0.9, 1.6), 0.85, lineStrokePts(px, py, px, py - sh, 4));
		}
	}

	// 10. Stars + sparkle
	while (prog.length < phaseEnds[9]) {
		action('stipple', [255, 252, 230], rng(1.2, 2.8), rng(0.4, 0.9),
			[{ x: rng(0, W), y: rng(0, H * 0.40) }]);
	}

	return prog;
}

const prog = buildProgramCity(5000);

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

const out = path.join(__dirname, 'benchmark-5000.harmony');
const json = JSON.stringify(payload);
fs.writeFileSync(out, json);

const stats = fs.statSync(out);
console.log(`Wrote ${out}`);
console.log(`  ${prog.length.toLocaleString()} strokes`);
console.log(`  ${(stats.size).toLocaleString()} bytes  (${(stats.size / 1024).toFixed(1)} KB)`);
const pointCount = prog.reduce((n, a) => n + (a.points ? a.points.length : 0), 0);
console.log(`  ${pointCount.toLocaleString()} total points`);

// Also write a gzipped variant for size comparison.
const zlib = require('zlib');
const gz = zlib.gzipSync(json);
const outGz = path.join(__dirname, 'benchmark-5000.harmony.gz');
fs.writeFileSync(outGz, gz);
console.log(`\nWrote ${outGz}`);
console.log(`  ${gz.length.toLocaleString()} bytes  (${(gz.length / 1024).toFixed(1)} KB, ${((gz.length / stats.size) * 100).toFixed(1)}% of raw)`);
