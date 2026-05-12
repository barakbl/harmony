#!/usr/bin/env node
// Render v3/benchmark-5000.harmony to a PNG at repo-root benchmark-5000.png.
// Uses @napi-rs/canvas + the exact v3 brush prototypes (simple, sketchy,
// watercolor, stipple, calligraphy) so the output matches what v3 produces
// when the file is loaded in the browser.
//
// Run:  npm install --no-save @napi-rs/canvas && node v3/_render-benchmark-png.js

'use strict';

const fs   = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const IN  = path.join(__dirname, 'benchmark-5000.harmony');
const OUT = path.join(__dirname, '..', 'benchmark-5000.png');

// ── Seeded RNG (mulberry32) — identical to v3's _r() ──
let _rs = 0;
function _rseed(s) {
	let t = (s | 0) || 1;
	t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B);
	t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35);
	t = (t ^ (t >>> 16)) | 0;
	_rs = t || 1;
}
function _r() {
	_rs = (_rs + 0x6D2B79F5) | 0;
	let t = _rs;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── Globals that the v3 brushes read ──
let COLOR            = [0, 0, 0];
let BACKGROUND_COLOR = [250, 250, 250];
let BRUSH_SIZE       = 1;
let BRUSH_PRESSURE   = 1;
let BRUSH_OPACITY    = 1;
let BRUSH_TILT_X     = 0;
let BRUSH_TILT_Y     = 0;

function brushSettingGet(brushName, key) {
	const d = {
		sketchy:     { radius: 63, density: 1 },
		calligraphy: { nibAngle: 45 }
	};
	return (d[brushName] && d[brushName][key] != null) ? d[brushName][key] : 0;
}

// ── v3 brush prototypes (verbatim copies of what's in v3/index.html) ──
function simple(context) { this.init(context); }
simple.prototype = {
	init(context) { this.context = context; this.context.globalCompositeOperation = 'source-over'; },
	destroy() {},
	strokeStart(mouseX, mouseY) { this.prevMouseX = mouseX; this.prevMouseY = mouseY; },
	stroke(mouseX, mouseY) {
		this.context.lineWidth = BRUSH_SIZE;
		this.context.strokeStyle = 'rgba(' + COLOR[0] + ',' + COLOR[1] + ',' + COLOR[2] + ',' + (0.5 * BRUSH_PRESSURE * BRUSH_OPACITY) + ')';
		this.context.beginPath();
		this.context.moveTo(this.prevMouseX, this.prevMouseY);
		this.context.lineTo(mouseX, mouseY);
		this.context.stroke();
		this.prevMouseX = mouseX; this.prevMouseY = mouseY;
	},
	strokeEnd() {}
};

function sketchy(context) { this.init(context); }
sketchy.prototype = {
	init(context) {
		this.context = context;
		this.context.globalCompositeOperation = 'source-over';
		this.points = []; this.count = 0;
	},
	destroy() {},
	strokeStart(mouseX, mouseY) { this.prevMouseX = mouseX; this.prevMouseY = mouseY; },
	stroke(mouseX, mouseY) {
		const radiusPx = brushSettingGet('sketchy', 'radius');
		const radiusSq = radiusPx * radiusPx;
		const falloff  = radiusSq * 0.5 * brushSettingGet('sketchy', 'density');
		this.points.push([mouseX, mouseY]);
		this.context.lineWidth = BRUSH_SIZE;
		this.context.strokeStyle = 'rgba(' + COLOR[0] + ',' + COLOR[1] + ',' + COLOR[2] + ',' + (0.05 * BRUSH_PRESSURE * BRUSH_OPACITY) + ')';
		this.context.beginPath();
		this.context.moveTo(this.prevMouseX, this.prevMouseY);
		this.context.lineTo(mouseX, mouseY);
		this.context.stroke();
		for (let i = 0; i < this.points.length; i++) {
			const dx = this.points[i][0] - this.points[this.count][0];
			const dy = this.points[i][1] - this.points[this.count][1];
			const d  = dx * dx + dy * dy;
			if (d < radiusSq && _r() > (d / falloff)) {
				this.context.beginPath();
				this.context.moveTo(this.points[this.count][0] + (dx * 0.3), this.points[this.count][1] + (dy * 0.3));
				this.context.lineTo(this.points[i][0] - (dx * 0.3), this.points[i][1] - (dy * 0.3));
				this.context.stroke();
			}
		}
		this.prevMouseX = mouseX; this.prevMouseY = mouseY;
		this.count++;
	},
	strokeEnd() {}
};

function watercolor(context) { this.init(context); }
watercolor.prototype = {
	init(context) {
		this.context = context;
		this.context.globalCompositeOperation = 'source-over';
		this.points = [];
	},
	destroy() {},
	strokeStart(mouseX, mouseY) { this.prevMouseX = mouseX; this.prevMouseY = mouseY; },
	stroke(mouseX, mouseY) {
		const r = COLOR[0], g = COLOR[1], b = COLOR[2];
		const p = BRUSH_PRESSURE * BRUSH_OPACITY;
		this.points.push([mouseX, mouseY]);
		this.context.lineCap = 'round';
		const passes    = Math.round(5 + BRUSH_PRESSURE * 5);
		const bleedMult = 0.5 + BRUSH_PRESSURE * 0.5;
		for (let i = 0; i < passes; i++) {
			const ox = (_r() - 0.5) * BRUSH_SIZE * 1.5 * bleedMult;
			const oy = (_r() - 0.5) * BRUSH_SIZE * 1.5 * bleedMult;
			this.context.lineWidth = BRUSH_SIZE * (0.5 + _r() * 0.5);
			this.context.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.015 * p) + ')';
			this.context.beginPath();
			this.context.moveTo(this.prevMouseX + ox, this.prevMouseY + oy);
			this.context.lineTo(mouseX + ox, mouseY + oy);
			this.context.stroke();
		}
		if (this.points.length > 5 && _r() < 0.3) {
			const idx = Math.floor(_r() * this.points.length);
			const dx = this.points[idx][0] - mouseX;
			const dy = this.points[idx][1] - mouseY;
			if (dx * dx + dy * dy < BRUSH_SIZE * BRUSH_SIZE * 16 * bleedMult * bleedMult) {
				this.context.lineWidth = BRUSH_SIZE * 0.5;
				this.context.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.008 * p) + ')';
				this.context.beginPath();
				this.context.moveTo(mouseX, mouseY);
				this.context.lineTo(mouseX + dx * 0.5, mouseY + dy * 0.5);
				this.context.stroke();
			}
		}
		this.prevMouseX = mouseX; this.prevMouseY = mouseY;
	},
	strokeEnd() {}
};

function stipple(context) { this.init(context); }
stipple.prototype = {
	init(context) { this.context = context; this.context.globalCompositeOperation = 'source-over'; },
	destroy() {},
	strokeStart(mouseX, mouseY) { this.prevMouseX = mouseX; this.prevMouseY = mouseY; },
	stroke(mouseX, mouseY) {
		const r = COLOR[0], g = COLOR[1], b = COLOR[2];
		const p = BRUSH_PRESSURE * BRUSH_OPACITY;
		const pressureScale = 0.5 + BRUSH_PRESSURE * 0.5;
		const count = Math.max(1, Math.round((Math.floor(BRUSH_SIZE * 0.8) + 3) * pressureScale));
		const spread = BRUSH_SIZE * 0.8;
		for (let i = 0; i < count; i++) {
			const x = mouseX + (_r() - 0.5) * spread * 2;
			const y = mouseY + (_r() - 0.5) * spread * 2;
			const dr = Math.min(255, Math.max(0, r + Math.floor((_r() - 0.5) * 30)));
			const dg = Math.min(255, Math.max(0, g + Math.floor((_r() - 0.5) * 30)));
			const db = Math.min(255, Math.max(0, b + Math.floor((_r() - 0.5) * 30)));
			const dotR = Math.max(0.3, (_r() * 1.5 + 0.5) * pressureScale);
			this.context.beginPath();
			this.context.arc(x, y, dotR, 0, Math.PI * 2, false);
			this.context.fillStyle = 'rgba(' + dr + ',' + dg + ',' + db + ',' + (0.6 * p * _r()) + ')';
			this.context.fill();
		}
		this.prevMouseX = mouseX; this.prevMouseY = mouseY;
	},
	strokeEnd() {}
};

function calligraphy(context) { this.init(context); }
calligraphy.prototype = {
	init(context) { this.context = context; this.context.globalCompositeOperation = 'source-over'; },
	destroy() {},
	strokeStart(mouseX, mouseY) { this.prevMouseX = mouseX; this.prevMouseY = mouseY; },
	stroke(mouseX, mouseY) {
		const r = COLOR[0], g = COLOR[1], b = COLOR[2];
		const p = BRUSH_PRESSURE * BRUSH_OPACITY;
		const dx = mouseX - this.prevMouseX;
		const dy = mouseY - this.prevMouseY;
		const angle = Math.atan2(dy, dx);
		const nibAngle = (BRUSH_TILT_X === 0 && BRUSH_TILT_Y === 0)
			? brushSettingGet('calligraphy', 'nibAngle') * Math.PI / 180
			: Math.atan2(BRUSH_TILT_Y, BRUSH_TILT_X);
		const width = (Math.abs(Math.cos(angle - nibAngle)) * BRUSH_SIZE + 1) * (0.5 + BRUSH_PRESSURE * 0.5);
		this.context.lineWidth = width;
		this.context.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.9 * p) + ')';
		this.context.lineCap = 'butt';
		this.context.beginPath();
		this.context.moveTo(this.prevMouseX, this.prevMouseY);
		this.context.lineTo(mouseX, mouseY);
		this.context.stroke();
		this.prevMouseX = mouseX; this.prevMouseY = mouseY;
	},
	strokeEnd() {}
};

const CTORS = { simple, sketchy, watercolor, stipple, calligraphy };

// ── Load + render ──
console.log(`Loading ${IN}…`);
const payload = JSON.parse(fs.readFileSync(IN, 'utf8'));
const W = payload.width  || 1200;
const H = payload.height || 800;
const bg = payload.background || [250, 250, 250];
console.log(`  ${payload.actions.length} actions, canvas ${W}×${H}`);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
ctx.fillRect(0, 0, W, H);

let mgrName = null;
let mgrInst = null;

const t0 = Date.now();
for (let i = 0; i < payload.actions.length; i++) {
	const a = payload.actions[i];
	if (a.type === 'clear') {
		if (mgrInst && mgrInst.destroy) mgrInst.destroy();
		mgrInst = null; mgrName = null;
		ctx.fillStyle = `rgb(${BACKGROUND_COLOR[0]},${BACKGROUND_COLOR[1]},${BACKGROUND_COLOR[2]})`;
		ctx.fillRect(0, 0, W, H);
		continue;
	}
	if (a.color) { COLOR = [a.color[0], a.color[1], a.color[2]]; }
	if (a.bg)    { BACKGROUND_COLOR = [a.bg[0], a.bg[1], a.bg[2]]; }
	BRUSH_SIZE    = a.size    != null ? a.size    : 1;
	BRUSH_OPACITY = a.opacity != null ? a.opacity : 1;
	BRUSH_PRESSURE = 1; BRUSH_TILT_X = 0; BRUSH_TILT_Y = 0;

	const needReset = a.reset || mgrName !== a.brush;
	if (needReset) {
		if (mgrInst && mgrInst.destroy) mgrInst.destroy();
		const Ctor = CTORS[a.brush];
		if (!Ctor) { console.warn(`unknown brush "${a.brush}" — skipping`); continue; }
		mgrName = a.brush;
		mgrInst = new Ctor(ctx);
	}
	_rseed(a.seed | 0);
	const pts = a.points;
	if (!pts || pts.length === 0) continue;
	BRUSH_PRESSURE = (pts[0].p  != null) ? pts[0].p  : 1;
	BRUSH_TILT_X   = (pts[0].tx != null) ? pts[0].tx : 0;
	BRUSH_TILT_Y   = (pts[0].ty != null) ? pts[0].ty : 0;
	mgrInst.strokeStart(pts[0].x, pts[0].y);
	for (let j = 1; j < pts.length; j++) {
		const pp = pts[j];
		BRUSH_PRESSURE = (pp.p  != null) ? pp.p  : 1;
		BRUSH_TILT_X   = (pp.tx != null) ? pp.tx : 0;
		BRUSH_TILT_Y   = (pp.ty != null) ? pp.ty : 0;
		mgrInst.stroke(pp.x, pp.y);
	}
	mgrInst.strokeEnd();

	if ((i + 1) % 1000 === 0) {
		const pct = ((i + 1) / payload.actions.length * 100).toFixed(0);
		process.stdout.write(`\r  rendering… ${i + 1}/${payload.actions.length} (${pct}%)`);
	}
}
if (mgrInst && mgrInst.destroy) mgrInst.destroy();
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\r  rendered ${payload.actions.length} actions in ${dt}s`);

const buf = canvas.toBuffer('image/png');
fs.writeFileSync(OUT, buf);
console.log(`Wrote ${OUT}  (${(buf.length / 1024).toFixed(0)} KB)`);
