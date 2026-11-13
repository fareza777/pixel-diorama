// Generates the narrated voice-over files (public/vo/<id>.mp3) from the story text in src/game/story.js.
// Needs Python with edge-tts (pip install edge-tts) and a network connection; only the story lines are sent.
// Usage: node tools/make-vo.mjs [id ...]   (no ids: every line)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { VO_LINES, VOICES } from '../src/game/story.js';

const out = path.resolve('public/vo');
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
for (const line of VO_LINES) {
  if (only.length && !only.includes(line.id)) continue;
  const v = VOICES[line.who] || VOICES.narrator;
  const file = path.join(out, `${line.id}.mp3`);
  // aiodns cannot find the DNS servers on some Windows setups: hide it so aiohttp uses its threaded resolver
  const run = "import sys, runpy; sys.modules['aiodns'] = None; sys.argv = ['edge-tts'] + sys.argv[1:]; runpy.run_module('edge_tts', run_name='__main__')";
  if (!only.length && fs.existsSync(file) && fs.statSync(file).size > 1000) continue; // already made
  // the service sometimes drops a request: try a few times
  for (let k = 1; ; k++) {
    try {
      execFileSync('python', ['-c', run, '--voice', v.voice, `--rate=${v.rate}`, `--pitch=${v.pitch}`, '--text', line.text, '--write-media', file], { stdio: 'pipe' });
      break;
    } catch (e) {
      if (k >= 4) throw e;
      execFileSync('python', ['-c', 'import time; time.sleep(2)']);
    }
  }
  console.log(`${line.id}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
