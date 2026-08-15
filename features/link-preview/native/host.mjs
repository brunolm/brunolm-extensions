import { execFile, spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const LOG_PATH = path.join(tmpdir(), 'brunolm-link-preview.log');

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    blurb: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
  },
  required: ['blurb', 'points'],
});

main().catch((err) => {
  log('host-crash', { error: err.message || String(err) });
  writeMessage({ ok: false, error: err.message || String(err), log: LOG_PATH });
  process.exit(1);
});

async function main() {
  const message = await readMessage();
  log('host-message', { type: message.type, fetch: Boolean(message.fetch), extra: message.extra ?? null });

  if (message.type === 'log') {
    log(message.event || 'ext', message.extra ?? { line: message.line });
    writeMessage({ ok: true, log: LOG_PATH });
    return;
  }
  if (message.type === 'ping') {
    writeMessage({ ok: true, grok: findGrok(), log: LOG_PATH });
    return;
  }
  if (message.type !== 'summarize' || !message.prompt) {
    writeMessage({ ok: false, error: 'expected { type: "summarize", prompt }', log: LOG_PATH });
    return;
  }

  const text = await runGrok(message.prompt, Boolean(message.fetch));
  writeMessage({ ok: true, text, log: LOG_PATH });
}

function findGrok() {
  if (process.env.GROK_BIN) return process.env.GROK_BIN;
  return path.join(homedir(), '.grok', 'bin', process.platform === 'win32' ? 'grok.exe' : 'grok');
}

async function runGrok(prompt, fetchPage) {
  const dir = await mkdtemp(path.join(tmpdir(), 'brunolm-lp-'));
  const promptFile = path.join(dir, 'prompt.txt');
  await writeFile(promptFile, prompt, 'utf8');
  await gitInit(dir);

  try {
    const started = Date.now();
    log('grok-spawn', { grok: findGrok(), fetchPage, cwd: dir, promptChars: prompt.length });
    const { code, stdout, stderr } = await spawnGrok(dir, promptFile, fetchPage);
    log('grok-exit', {
      code,
      ms: Date.now() - started,
      stdout: clip(stdout),
      stderr: clip(stderr),
    });
    if (code !== 0) {
      throw new Error(firstLine(stderr) || firstLine(stdout) || `grok exited ${code}`);
    }
    const data = JSON.parse(stdout);
    if (data.type === 'error') throw new Error(data.message || 'grok error');
    if (!data.text) throw new Error('grok returned no text');
    log('grok-text', { chars: data.text.length, preview: clip(data.text, 400) });
    return data.text;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function spawnGrok(cwd, promptFile, fetchPage) {
  const args = [
    '--prompt-file',
    promptFile,
    '--effort',
    'low',
    '--json-schema',
    SCHEMA,
    '--output-format',
    'json',
    '--yolo',
    '--max-turns',
    fetchPage ? '2' : '1',
    '--cwd',
    cwd,
    '--no-auto-update',
    '--no-plan',
    '--no-subagents',
    '--no-memory',
    '--verbatim',
  ];
  if (fetchPage) args.push('--tools', 'web_fetch');
  else args.push('--disallowed-tools', 'run_terminal_cmd,web_fetch,web_search', '--disable-web-search');

  return new Promise((resolve, reject) => {
    const child = spawn(findGrok(), args, {
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    const timer = setTimeout(() => {
      log('grok-timeout', { ms: 45_000 });
      child.kill();
      reject(new Error('grok timed out'));
    }, 45_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}

function readMessage() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.resume();
    const onData = (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length < 4) return;
      const size = buf.readUInt32LE(0);
      if (buf.length < 4 + size) return;
      process.stdin.off('data', onData);
      try {
        resolve(JSON.parse(buf.subarray(4, 4 + size).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    };
    process.stdin.on('data', onData);
    process.stdin.on('end', () => process.exit(0));
  });
}

function writeMessage(value) {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

function log(event, extra = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...extra });
  try {
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {}
}

function clip(text, max = 4000) {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}\n…[${s.length - max} more]`;
}

async function gitInit(dir) {
  await execFileAsync('git', ['init'], { cwd: dir, windowsHide: true }).catch(() => {});
}

function firstLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}
