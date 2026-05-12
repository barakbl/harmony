#!/usr/bin/env node
// Smoke tests for v3/index.html — run with: node v3/smoke-test.js
//
// Verifies (carried from v2):
//   1. Inline JS in index.html parses without syntax errors
//   2. v3/brushes.json is valid JSON
//   3. Each entry in BRUSH_SETTINGS_DEFS is referenced by its brush's stroke()
//      via brushSettingGet, and vice-versa (no orphan defs / no missing keys)
//   4. Settings registered for a brush actually live inside that brush's
//      function body (catch typos like brushSettingGet('sketcyh',...) etc)
//   5. Each tunable brush has its function defined exactly once
//
// Verifies (v3 new):
//   6. No raw Math.random() inside the brush block (must use seeded _r())
//   7. Seeded RNG (_rseed/_r) is deterministic and seed-sensitive
//   8. Brush rendering is deterministic: running a stroke with the same seed
//      gives the same canvas ops; with a different seed it diverges
//   9. .harmony payload (action log) round-trips through JSON unchanged
//  10. exportActionsPayload / importActionsPayload exist
//  11. The new record* / replay* surface exists
//  12. Download writes JSON, upload reads JSON

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.join(__dirname, 'index.html');
const BRUSHES_JSON = path.join(__dirname, 'brushes.json');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', RESET = '\x1b[0m';
let failures = 0;
function ok(msg)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`${RED}✗${RESET} ${msg}`); failures++; }
function info(msg) { console.log(`${YELLOW}ℹ${RESET} ${msg}`); }

const html = fs.readFileSync(INDEX, 'utf8');

// ── 1. Parse inline <script> blocks ─────────────────────────────────
{
	const scripts = [];
	const re = /<script(?![^>]*\stype\s*=\s*["'][^"']*json[^"']*["'])(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
	let m;
	while ((m = re.exec(html)) !== null) scripts.push(m[1]);
	if (scripts.length === 0) {
		fail('no inline <script> blocks found');
	} else {
		for (let i = 0; i < scripts.length; i++) {
			try {
				new vm.Script(scripts[i], { filename: `index.html:script[${i}]` });
				ok(`inline script #${i} parses (${scripts[i].length} chars)`);
			} catch (e) {
				fail(`inline script #${i} parse error: ${e.message}`);
			}
		}
	}
}

// ── 2. brushes.json is valid JSON ───────────────────────────────────
let brushesJson = null;
try {
	brushesJson = JSON.parse(fs.readFileSync(BRUSHES_JSON, 'utf8'));
	ok(`v3/brushes.json parses (${brushesJson.sets.length} sets)`);
} catch (e) {
	fail(`v3/brushes.json invalid: ${e.message}`);
}

// ── 3. Extract BRUSH_SETTINGS_DEFS literally (no eval) ──────────────
const defsMatch = html.match(/const\s+BRUSH_SETTINGS_DEFS\s*=\s*(\{[\s\S]*?\n\});/);
let defs = null;
if (!defsMatch) {
	fail('BRUSH_SETTINGS_DEFS object not found');
} else {
	try {
		defs = vm.runInNewContext('(' + defsMatch[1] + ')');
		ok(`BRUSH_SETTINGS_DEFS evaluates with ${Object.keys(defs).length} brushes`);
	} catch (e) {
		fail(`BRUSH_SETTINGS_DEFS eval error: ${e.message}`);
	}
}

// ── 4. For each brush in defs, verify its prototype uses brushSettingGet ─
function findBrushBody(brushName) {
	const protoRe = new RegExp(`\\n${brushName}\\.prototype\\s*=\\s*\\{`);
	const protoStart = html.search(protoRe);
	if (protoStart < 0) return null;
	let i = html.indexOf('{', protoStart);
	let depth = 0, end = -1;
	for (; i < html.length; i++) {
		const c = html[i];
		if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) { end = i; break; }
		}
	}
	if (end < 0) return null;
	return html.slice(protoStart, end + 1);
}

if (defs) {
	for (const brush of Object.keys(defs)) {
		const body = findBrushBody(brush);
		if (!body) {
			fail(`brush function ${brush} prototype body not found`);
			continue;
		}
		ok(`brush ${brush} prototype found (${body.length} chars)`);
		const params = defs[brush].params || [];
		for (const p of params) {
			const re = new RegExp(`brushSettingGet\\(\\s*['"]${brush}['"]\\s*,\\s*['"]${p.key}['"]`);
			if (re.test(body)) {
				ok(`  ${brush}.${p.key} is read in stroke()`);
			} else {
				fail(`  ${brush}.${p.key} declared in defs but never read by ${brush}'s prototype`);
			}
		}
	}
}

// ── 5. Reverse direction: every brushSettingGet('X', 'Y') has a def ─
{
	const re = /brushSettingGet\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
	const seen = new Set();
	let m;
	while ((m = re.exec(html)) !== null) {
		const key = `${m[1]}.${m[2]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (!defs || !defs[m[1]]) {
			fail(`brushSettingGet('${m[1]}', '${m[2]}') — brush '${m[1]}' has no defs entry`);
			continue;
		}
		const params = defs[m[1]].params || [];
		if (!params.find(p => p.key === m[2])) {
			fail(`brushSettingGet('${m[1]}', '${m[2]}') — param '${m[2]}' missing from defs`);
		} else {
			ok(`brushSettingGet('${m[1]}', '${m[2]}') matches a def`);
		}
	}
}

// ── 6. Each tunable brush function is defined exactly once ──────────
if (defs) {
	for (const brush of Object.keys(defs)) {
		const re = new RegExp(`\\nfunction\\s+${brush}\\s*\\(`, 'g');
		const matches = html.match(re) || [];
		if (matches.length === 1) {
			ok(`brush function ${brush} defined exactly once`);
		} else {
			fail(`brush function ${brush} defined ${matches.length} time(s) — expected 1`);
		}
	}
}

// ── 7. Defaults are within min/max range ────────────────────────────
if (defs) {
	for (const brush of Object.keys(defs)) {
		for (const p of (defs[brush].params || [])) {
			if (p.default < p.min || p.default > p.max) {
				fail(`${brush}.${p.key} default ${p.default} outside [${p.min}, ${p.max}]`);
			} else {
				ok(`${brush}.${p.key} default ${p.default} ∈ [${p.min}, ${p.max}]`);
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────
// v3-specific tests
// ─────────────────────────────────────────────────────────────────────
console.log();
console.log('— v3 vector-format tests —');

// ── 8. No raw Math.random() inside brush region ─────────────────────
{
	const startMarker = html.indexOf('// brushes/circles.js');
	const endMarker   = html.indexOf('// colorutils.js');
	if (startMarker < 0 || endMarker < 0 || endMarker < startMarker) {
		fail('could not locate brush region (circles.js … colorutils.js)');
	} else {
		const region = html.slice(startMarker, endMarker);
		const matches = region.match(/Math\.random\(\)/g) || [];
		if (matches.length === 0) {
			ok('brush region has no Math.random() — replaced by seeded _r()');
		} else {
			fail(`brush region still uses Math.random() ${matches.length} time(s); replace with _r()`);
		}
		const rCalls = region.match(/\b_r\(\)/g) || [];
		if (rCalls.length > 30) {
			ok(`brush region uses seeded _r() (${rCalls.length} call sites)`);
		} else {
			fail(`brush region has surprisingly few _r() calls (${rCalls.length})`);
		}
	}
}

// ── 9. Seeded RNG: deterministic + seed-sensitive ───────────────────
const RNG_BLOCK = `
var _rs = 0;
function _rseed(s) {
	var t = (s | 0) || 1;
	t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B);
	t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35);
	t = (t ^ (t >>> 16)) | 0;
	_rs = t || 1;
}
function _r() {
	_rs = (_rs + 0x6D2B79F5) | 0;
	var t = _rs;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function _hashSeed() {
	var h = 0x9E3779B9 | 0;
	for (var i = 0; i < arguments.length; i++) {
		var v = arguments[i] | 0;
		h ^= v;
		h = Math.imul(h, 0x85EBCA6B);
		h ^= h >>> 13;
		h = Math.imul(h, 0xC2B2AE35);
		h ^= h >>> 16;
	}
	return h | 0;
}
`;

{
	if (/function\s+_rseed\s*\(/.test(html) && /function\s+_r\s*\(/.test(html) && /function\s+_hashSeed\s*\(/.test(html)) {
		ok('RNG helpers (_rseed/_r/_hashSeed) defined in index.html');
	} else {
		fail('RNG helpers missing from index.html');
	}
}

{
	const sandbox = {};
	vm.runInNewContext(RNG_BLOCK + `
		_rseed(12345);
		var a = []; for (var i = 0; i < 100; i++) a.push(_r());
		_rseed(12345);
		var b = []; for (var i = 0; i < 100; i++) b.push(_r());
		this.same = a.every(function(v, i) { return v === b[i]; });
		_rseed(12345);
		var x = _r();
		_rseed(12346);
		var y = _r();
		this.diverged = x !== y;
		this.inRange = a.every(function(v) { return v >= 0 && v < 1; });
		_rseed(777);
		var sum = 0; var n = 10000;
		for (var k = 0; k < n; k++) sum += _r();
		this.meanCloseTo0_5 = Math.abs(sum / n - 0.5) < 0.02;
	`, sandbox);

	if (sandbox.same)        ok('_r() with same seed yields the same 100-value sequence');
	else                     fail('_r() not deterministic for the same seed');
	if (sandbox.diverged)    ok('adjacent seeds (12345 vs 12346) diverge on first _r() call');
	else                     fail('adjacent seeds produced the same first value — bad mixer');
	if (sandbox.inRange)     ok('_r() values stay in [0, 1)');
	else                     fail('_r() produced an out-of-range value');
	if (sandbox.meanCloseTo0_5) ok('_r() mean over 10k samples ≈ 0.5 (uniformity sanity)');
	else                     fail('_r() mean drifts > 0.02 from 0.5 over 10k samples');
}

// ── 10. Brush determinism: render with mock canvas, hash ops ───────
{
	function extractBrush(name) {
		const fnRe = new RegExp(`\\nfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
		const fnIdx = html.search(fnRe);
		if (fnIdx < 0) return null;
		let i = html.indexOf('{', fnIdx);
		let depth = 0, fnEnd = -1;
		for (; i < html.length; i++) {
			const c = html[i];
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0) { fnEnd = i; break; } }
		}
		const protoRe = new RegExp(`\\n${name}\\.prototype\\s*=\\s*\\{`);
		const protoIdx = html.search(protoRe);
		if (protoIdx < 0) return null;
		let j = html.indexOf('{', protoIdx);
		depth = 0;
		let protoEnd = -1;
		for (; j < html.length; j++) {
			const c = html[j];
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0) { protoEnd = j; break; } }
		}
		return html.slice(fnIdx, fnEnd + 1) + '\n' + html.slice(protoIdx - 1, protoEnd + 1) + ';';
	}

	function makeMockCtx() {
		const ops = [];
		function rec(name) { return function() {
			var s = name + ':';
			for (var k = 0; k < arguments.length; k++) {
				var a = arguments[k];
				s += (typeof a === 'number' ? a.toFixed(3) : String(a)) + ',';
			}
			ops.push(s);
		}; }
		const ctx = {
			ops,
			save: rec('save'),
			restore: rec('restore'),
			beginPath: rec('beginPath'),
			closePath: rec('closePath'),
			moveTo: rec('moveTo'),
			lineTo: rec('lineTo'),
			arc: rec('arc'),
			arcTo: rec('arcTo'),
			quadraticCurveTo: rec('quadraticCurveTo'),
			bezierCurveTo: rec('bezierCurveTo'),
			rect: rec('rect'),
			fillRect: rec('fillRect'),
			strokeRect: rec('strokeRect'),
			clearRect: rec('clearRect'),
			fill: rec('fill'),
			stroke: rec('stroke'),
			translate: rec('translate'),
			rotate: rec('rotate'),
			scale: rec('scale'),
			setTransform: rec('setTransform'),
			fillText: rec('fillText'),
			strokeText: rec('strokeText'),
			drawImage: rec('drawImage'),
			createLinearGradient: function(){ return { addColorStop: rec('addColorStop'), _isGradient: true }; },
			createRadialGradient: function(){ return { addColorStop: rec('addColorStop'), _isGradient: true }; },
		};
		// String-valued props (track every set so determinism includes style)
		['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','globalAlpha','globalCompositeOperation','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY','font','textAlign','textBaseline','miterLimit'].forEach(function(prop){
			var v = '';
			Object.defineProperty(ctx, prop, {
				get: function(){ return v; },
				set: function(nv){ v = nv; ops.push('set ' + prop + '=' + nv); }
			});
		});
		return ctx;
	}

	function runStroke(brushName, seed, points) {
		const sandbox = {
			COLOR: [100, 50, 200],
			BACKGROUND_COLOR: [250, 250, 250],
			BRUSH_SIZE: 5,
			BRUSH_PRESSURE: 0.8,
			BRUSH_OPACITY: 1,
			BRUSH_TILT_X: 0,
			BRUSH_TILT_Y: 0,
			SCREEN_WIDTH: 800,
			SCREEN_HEIGHT: 600,
			Math,
			RegExp,
			console,
			navigator: { userAgent: 'node' },
			brushSettingGet: function(b, k) {
				const p = (defs && defs[b] && defs[b].params || []).find(p => p.key === k);
				return p ? p.default : 0;
			},
		};
		const mockCtx = makeMockCtx();
		const code = RNG_BLOCK + '\n' + extractBrush(brushName);
		vm.createContext(sandbox);
		vm.runInContext(code, sandbox);
		// instantiate (its init() may set globalCompositeOperation on the ctx)
		sandbox.___ctx___ = mockCtx;
		vm.runInContext(`var inst = new ${brushName}(___ctx___);`, sandbox);
		vm.runInContext(`_rseed(${seed});`, sandbox);
		const startPt = points[0];
		vm.runInContext(`inst.strokeStart(${startPt[0]}, ${startPt[1]});`, sandbox);
		for (let i = 1; i < points.length; i++) {
			const p = points[i];
			vm.runInContext(`inst.stroke(${p[0]}, ${p[1]});`, sandbox);
		}
		vm.runInContext(`if (typeof inst.strokeEnd === 'function') inst.strokeEnd();`, sandbox);
		return mockCtx.ops.join('|');
	}

	const pts = [[100, 100], [110, 105], [125, 112], [140, 120], [155, 130], [170, 138], [180, 142]];

	function hashStr(s) {
		let h = 5381;
		for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
		return (h >>> 0).toString(16);
	}

	const brushesToTest = ['splatter', 'sketchy', 'stipple', 'crayon', 'watercolor', 'chalk', 'circles'];
	for (const name of brushesToTest) {
		try {
			const a = runStroke(name, 0xABCDEF, pts);
			const b = runStroke(name, 0xABCDEF, pts);
			const c = runStroke(name, 0x123456, pts);

			if (a.length === 0) {
				info(`${name}: produced no canvas ops`);
				continue;
			}
			if (a === b) ok(`${name}: same seed → same ops (${a.length} chars, hash=${hashStr(a)})`);
			else         fail(`${name}: same seed produced DIFFERENT ops`);

			if (a !== c) ok(`${name}: different seed → different ops (RNG is reaching the brush)`);
			else         info(`${name}: different seeds produced the same ops (brush may not use _r())`);
		} catch (e) {
			fail(`${name}: stroke replay threw — ${e.message}`);
		}
	}
}

// ── 11. .harmony payload round-trips through JSON ───────────────────
{
	const payload = {
		format: 'harmony-v3',
		version: 1,
		createdAt: '2026-05-12T00:00:00.000Z',
		width: 1280,
		height: 720,
		pixelRatio: 2,
		background: [250, 250, 250],
		index: 2,
		actions: [
			{
				brush: 'sketchy',
				color: [0, 0, 0],
				bg: [250, 250, 250],
				size: 2, opacity: 1, symmetry: 1,
				seed: 12345,
				reset: true,
				settings: null,
				points: [
					{ x: 10, y: 10, p: 0.5, tx: 0, ty: 0 },
					{ x: 11.5, y: 12.25, p: 0.7, tx: 5, ty: -3 },
				],
			},
			{ type: 'clear', bg: [250, 250, 250] },
			{
				brush: 'splatter',
				color: [200, 60, 60],
				bg: [250, 250, 250],
				size: 5, opacity: 0.8, symmetry: 4,
				seed: -123,
				reset: false,
				settings: { splatter: { count: 1.0, spread: 1.0 } },
				points: [{ x: 100, y: 200, p: 1.0, tx: 0, ty: 0 }],
			},
		],
	};
	const json = JSON.stringify(payload);
	const back = JSON.parse(json);
	function deepEqual(a, b) {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (Array.isArray(a) !== Array.isArray(b)) return false;
		if (typeof a !== 'object' || a === null || b === null) return a === b;
		const ka = Object.keys(a), kb = Object.keys(b);
		if (ka.length !== kb.length) return false;
		for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
		return true;
	}
	if (deepEqual(payload, back)) ok('action-log payload JSON round-trip preserves all fields');
	else                          fail('action-log payload JSON round-trip lost data');
	if (json.length < 4096) ok(`small payload is ${json.length} bytes (well under raster size)`);
	else                    fail(`small payload bloated to ${json.length} bytes`);
}

// ── 12. exportActionsPayload / importActionsPayload sources exist ──
{
	if (/function\s+exportActionsPayload\s*\(/.test(html) && /function\s+importActionsPayload\s*\(/.test(html)) {
		ok('exportActionsPayload / importActionsPayload defined');
	} else {
		fail('exportActionsPayload / importActionsPayload missing');
	}
}

// ── 13. Recording/replay surface ────────────────────────────────────
{
	const expected = ['recordStrokeStart', 'recordPoint', 'recordStrokeEnd', 'recordClear', 'replayStroke', 'replayAll'];
	for (const fn of expected) {
		if (new RegExp(`function\\s+${fn}\\s*\\(`).test(html)) ok(`${fn}() defined`);
		else fail(`${fn}() not defined`);
	}
}

// ── 14. Eraser composite-op doesn't leak into the next brush ────────
//      Recreate the replayStroke needReset path manually: instantiate
//      eraser, run a stroke, then "switch" to simple (calling destroy
//      first like replayStroke does), and confirm composite is reset.
{
	function extractFnAndProto(name) {
		const fnRe = new RegExp(`\\nfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
		const fnIdx = html.search(fnRe);
		if (fnIdx < 0) return null;
		let i = html.indexOf('{', fnIdx);
		let depth = 0, fnEnd = -1;
		for (; i < html.length; i++) {
			const c = html[i];
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0) { fnEnd = i; break; } }
		}
		const protoRe = new RegExp(`\\n${name}\\.prototype\\s*=\\s*\\{`);
		const protoIdx = html.search(protoRe);
		if (protoIdx < 0) return null;
		let j = html.indexOf('{', protoIdx);
		depth = 0;
		let protoEnd = -1;
		for (; j < html.length; j++) {
			const c = html[j];
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0) { protoEnd = j; break; } }
		}
		return html.slice(fnIdx, fnEnd + 1) + '\n' + html.slice(protoIdx - 1, protoEnd + 1) + ';';
	}

	function makeCompositeMockCtx() {
		const compositeLog = [];
		let composite = 'source-over';
		const ctx = {
			compositeLog,
			get globalCompositeOperation() { return composite; },
			set globalCompositeOperation(v) { composite = v; compositeLog.push(v); },
			save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
			arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, fillRect() {}, strokeRect() {}, clearRect() {},
			fill() {}, stroke() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
			fillText() {}, strokeText() {}, drawImage() {},
			createLinearGradient() { return { addColorStop() {} }; },
			createRadialGradient() { return { addColorStop() {} }; },
		};
		['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','globalAlpha','shadowBlur','shadowColor','font'].forEach(function(p){
			let v = ''; Object.defineProperty(ctx, p, { get() { return v; }, set(nv) { v = nv; } });
		});
		return ctx;
	}

	try {
		const sandbox = {
			COLOR: [10, 20, 30], BACKGROUND_COLOR: [250, 250, 250],
			BRUSH_SIZE: 4, BRUSH_PRESSURE: 1, BRUSH_OPACITY: 1, BRUSH_TILT_X: 0, BRUSH_TILT_Y: 0,
			SCREEN_WIDTH: 800, SCREEN_HEIGHT: 600,
			Math, RegExp, console,
			navigator: { userAgent: 'node' },
			brushSettingGet: function(b, k) {
				const p = (defs && defs[b] && defs[b].params || []).find(p => p.key === k);
				return p ? p.default : 0;
			},
		};
		const code = RNG_BLOCK + extractFnAndProto('eraser') + '\n' + extractFnAndProto('simple');
		vm.createContext(sandbox);
		vm.runInContext(code, sandbox);
		const ctx = makeCompositeMockCtx();
		sandbox.___ctx___ = ctx;
		vm.runInContext('var e = new eraser(___ctx___); _rseed(1); e.strokeStart(10,10); e.stroke(20,20);', sandbox);
		if (ctx.globalCompositeOperation === 'destination-out') {
			ok('eraser sets globalCompositeOperation to destination-out');
		} else {
			fail(`eraser did not set destination-out (got: ${ctx.globalCompositeOperation})`);
		}
		// Mimic replayStroke's needReset path: destroy outgoing, instantiate new.
		vm.runInContext('e.destroy(); var s = new simple(___ctx___); _rseed(2); s.strokeStart(40,40); s.stroke(50,50);', sandbox);
		if (ctx.globalCompositeOperation === 'source-over') {
			ok('after eraser.destroy() + new simple(), composite is back to source-over');
		} else {
			fail(`composite leaked through brush switch (got: ${ctx.globalCompositeOperation})`);
		}
	} catch (e) {
		fail(`eraser→simple composite test threw: ${e.message}`);
	}
}

// ── iOS save regression: STORAGE must not be force-disabled by
//      sniffing "safari" / "chrome" in the UA. iOS Chrome's UA is
//      "CriOS"-flavored — it contains "safari" but NOT the literal
//      "chrome", so the old check incidentally disabled autosave on
//      both iOS Safari AND iOS Chrome.
{
	const inits = [];
	const all = /STORAGE\s*=\s*false/g;
	let r;
	while ((r = all.exec(html)) !== null) inits.push(r.index);
	if (inits.length === 0) {
		ok('STORAGE is never force-disabled at runtime (iOS Safari/Chrome get autosave)');
	} else {
		let badSniff = false;
		for (const idx of inits) {
			const window = html.slice(Math.max(0, idx - 200), idx + 80);
			if (/USER_AGENT\.search\(\s*["']safari["']/i.test(window)) {
				badSniff = true; break;
			}
		}
		if (badSniff) fail('STORAGE = false gated on Safari UA sniff — disables autosave on iOS Chrome (CriOS) too');
		else          ok('STORAGE = false present but not gated on a Safari UA sniff');
	}
}

// ── 15. loadActionsFromStorage doesn't depend on a const declared
//       below init() (TDZ would silently fail the restore on refresh)
{
	const initIdx  = html.indexOf('\ninit();');
	const loadFnRe = /function\s+loadActionsFromStorage\s*\(/;
	const loadIdx  = html.search(loadFnRe);
	if (initIdx < 0 || loadIdx < 0) {
		fail('could not locate init() call or loadActionsFromStorage');
	} else {
		// Extract the body of loadActionsFromStorage
		const bodyStart = html.indexOf('{', loadIdx);
		let depth = 0, bodyEnd = -1;
		for (let i = bodyStart; i < html.length; i++) {
			if (html[i] === '{') depth++;
			else if (html[i] === '}') { depth--; if (depth === 0) { bodyEnd = i; break; } }
		}
		const body = html.slice(bodyStart, bodyEnd + 1);
		// Find every IDENTIFIER reference in the body and check that any
		// `const NAME = ...` for that name appears before init() in the
		// source (otherwise calling loadActionsFromStorage from init() hits TDZ).
		const idents = new Set(body.match(/\b[A-Z_][A-Z0-9_]{2,}\b/g) || []);
		// Built-ins to ignore
		['JSON','STORAGE','NaN','Promise','Infinity'].forEach(x => idents.delete(x));
		let leaked = [];
		for (const id of idents) {
			const declRe = new RegExp(`\\bconst\\s+${id}\\s*=`);
			const declIdx = html.search(declRe);
			if (declIdx >= 0 && declIdx > initIdx) {
				leaked.push(`${id} (const at ${declIdx}, init() at ${initIdx})`);
			}
		}
		if (leaked.length === 0) {
			ok('loadActionsFromStorage has no TDZ-trapped const refs declared after init()');
		} else {
			fail('loadActionsFromStorage references consts declared after init(): ' + leaked.join('; '));
		}
	}
}

// ── 16. Download writes JSON; upload reads JSON ─────────────────────
{
	const onMenuDownloadMatch = html.match(/function\s+onMenuDownload\s*\([^)]*\)\s*\{([\s\S]*?)\n\}\n/);
	if (!onMenuDownloadMatch) {
		fail('onMenuDownload not found');
	} else {
		const body = onMenuDownloadMatch[1];
		if (/exportActionsPayload\(\)/.test(body) && !/<svg/i.test(body) && !/toDataURL/.test(body)) {
			ok('onMenuDownload writes the action log (no SVG/PNG embedding)');
		} else {
			fail('onMenuDownload still embeds raster image or SVG wrapping');
		}
	}
}
{
	const onMenuUploadMatch = html.match(/function\s+onMenuUpload\s*\([^)]*\)\s*\{([\s\S]*?)\n\}\n/);
	if (!onMenuUploadMatch) {
		fail('onMenuUpload not found');
	} else {
		const body = onMenuUploadMatch[1];
		if (/JSON\.parse/.test(body) && /importActionsPayload/.test(body) && /harmony-v3/.test(body)) {
			ok('onMenuUpload parses JSON and calls importActionsPayload');
		} else {
			fail('onMenuUpload does not consume the v3 JSON format');
		}
	}
}

console.log();
if (failures === 0) {
	console.log(`${GREEN}All smoke tests passed.${RESET}`);
	process.exit(0);
} else {
	console.log(`${RED}${failures} smoke test(s) failed.${RESET}`);
	process.exit(1);
}
