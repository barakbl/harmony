#!/usr/bin/env node
// Smoke tests for v2/index.html — run with: node v2/smoke-test.js
//
// Verifies:
//   1. Inline JS in index.html parses without syntax errors
//   2. v2/brushes.json is valid JSON
//   3. Each entry in BRUSH_SETTINGS_DEFS is referenced by its brush's stroke()
//      via brushSettingGet, and vice-versa (no orphan defs / no missing keys)
//   4. Settings registered for a brush actually live inside that brush's
//      function body (catch typos like brushSettingGet('sketcyh',...) etc)
//   5. Each tunable brush has its function defined exactly once

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
	ok(`v2/brushes.json parses (${brushesJson.sets.length} sets)`);
} catch (e) {
	fail(`v2/brushes.json invalid: ${e.message}`);
}

// ── 3. Extract BRUSH_SETTINGS_DEFS literally (no eval) ──────────────
const defsMatch = html.match(/const\s+BRUSH_SETTINGS_DEFS\s*=\s*(\{[\s\S]*?\n\});/);
let defs = null;
if (!defsMatch) {
	fail('BRUSH_SETTINGS_DEFS object not found');
} else {
	// Wrap as expression and eval in sandbox (no DOM refs inside this literal)
	try {
		defs = vm.runInNewContext('(' + defsMatch[1] + ')');
		ok(`BRUSH_SETTINGS_DEFS evaluates with ${Object.keys(defs).length} brushes`);
	} catch (e) {
		fail(`BRUSH_SETTINGS_DEFS eval error: ${e.message}`);
	}
}

// ── 4. For each brush in defs, verify its function exists & its
//      stroke uses brushSettingGet for every param ─────────────────
function findBrushBody(brushName) {
	// Match `function brushName ( ... ) {  ... }` — balance braces manually
	const startRe = new RegExp(`\\nfunction\\s+${brushName}\\s*\\(`, 'g');
	const fnStart = startRe.exec(html);
	if (!fnStart) return null;
	// Find the start of the prototype object (much more relevant than the
	// constructor body which is always trivial). Prototype = `${name}.prototype = { ... }`
	const protoRe = new RegExp(`\\n${brushName}\\.prototype\\s*=\\s*\\{`);
	const protoStart = html.search(protoRe);
	if (protoStart < 0) return null;
	// Walk the braces
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

// ── 8. iOS save regression: STORAGE must not be force-disabled by
//      sniffing "safari" / "chrome" in the UA. iOS Chrome's UA is
//      "CriOS"-flavored — it contains "safari" but NOT the literal
//      "chrome", so the old check incidentally disabled autosave on
//      both iOS Safari AND iOS Chrome, leaving the pip stuck on
//      'unavailable'. ──────────────────────────────────────────────
{
	const re = /STORAGE\s*=\s*false/;
	const inits = [];
	let m;
	const all = /STORAGE\s*=\s*false/g;
	let r;
	while ((r = all.exec(html)) !== null) inits.push(r.index);
	if (inits.length === 0) {
		ok('STORAGE is never force-disabled at runtime (iOS Safari/Chrome get autosave)');
	} else {
		// Allow it only if it's not gated on a "safari"/"chrome" UA sniff.
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

console.log();
if (failures === 0) {
	console.log(`${GREEN}All smoke tests passed.${RESET}`);
	process.exit(0);
} else {
	console.log(`${RED}${failures} smoke test(s) failed.${RESET}`);
	process.exit(1);
}
