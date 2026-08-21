#!/usr/bin/env node
/**
 * imagegen — one CLI for image generation and editing across two backends.
 *
 * Backend order: the user's ChatGPT subscription (chatgpt-oauth, gpt-image-2 on the
 * codex backend) first, OPENAI_API_KEY against api.openai.com second. Subscription
 * requests are covered by the plan; API requests bill per image.
 *
 * Stdout is the interface: every line an agent should act on is a directive
 * (WROTE, BACKEND, NEEDS_LOGIN, ERROR). Follow what it prints.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STORE_DIR = join(homedir(), ".config", "chatgpt-oauth", "imagegen");
const SUBJECT = "imagegen-cli";
const API_KEY_FILE = join(homedir(), ".config", "openai", "api_key");
const TIMEOUT_MS = 240_000;

function ensureDeps() {
  if (existsSync(join(SCRIPT_DIR, "node_modules", "chatgpt-oauth"))) return;
  console.error("installing dependencies (first run)...");
  const r = spawnSync("npm", ["install", "--no-fund", "--no-audit", "--silent"], {
    cwd: SCRIPT_DIR,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    console.log("ERROR dependency install failed. Run manually: cd " + SCRIPT_DIR + " && npm install");
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = { _: [], ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const key = a.slice(2);
    if (key === "ref") { args.ref.push(argv[++i]); continue; }
    const flagOnly = ["help"].includes(key);
    args[key] = flagOnly ? true : argv[++i];
  }
  return args;
}

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (existsSync(API_KEY_FILE)) {
    const raw = readFileSync(API_KEY_FILE, "utf8").trim();
    if (raw !== "") return raw;
  }
  return null;
}

async function subscriptionAuth() {
  const { createAuthSession } = await import("chatgpt-oauth");
  const { createFileStore } = await import("chatgpt-oauth/node");
  const store = await createFileStore({ directory: STORE_DIR });
  return createAuthSession({ store });
}

async function subscriptionStatus(auth) {
  try {
    return await auth.status(SUBJECT);
  } catch {
    return null;
  }
}

function outPaths(out, count) {
  const base = out ?? `imagegen-${Date.now()}.png`;
  if (count <= 1) return [resolve(base)];
  const ext = extname(base) || ".png";
  const stem = base.slice(0, base.length - ext.length);
  return Array.from({ length: count }, (_, i) => resolve(`${stem}-${i + 1}${ext}`));
}

function writeImages(images, out, meta) {
  const paths = outPaths(out, images.length);
  images.forEach((img, i) => {
    mkdirSync(dirname(paths[i]), { recursive: true });
    writeFileSync(paths[i], img.bytes);
    console.log(`WROTE ${paths[i]}`);
  });
  const parts = [];
  if (meta.size) parts.push(`size=${meta.size}`);
  if (meta.quality) parts.push(`quality=${meta.quality}`);
  if (meta.usage?.total_tokens) parts.push(`tokens=${meta.usage.total_tokens}`);
  if (parts.length > 0) console.log(`RESULT ${parts.join(" ")}`);
}

function requestOptions(args, signal) {
  return {
    ...(args.n === undefined ? {} : { n: Number(args.n) }),
    ...(args.size === undefined ? {} : { size: args.size }),
    ...(args.quality === undefined ? {} : { quality: args.quality }),
    ...(args.background === undefined ? {} : { background: args.background }),
    signal,
  };
}

function readPrompt(args) {
  if (args["prompt-file"] !== undefined) return readFileSync(args["prompt-file"], "utf8").trim();
  if (args.prompt !== undefined) return args.prompt;
  console.log("ERROR missing --prompt or --prompt-file");
  process.exit(1);
}

function mediaTypeFor(path) {
  const ext = extname(path).toLowerCase();
  return { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext] ?? "image/png";
}

async function viaSubscription(kind, prompt, args, refs) {
  const auth = await subscriptionAuth();
  const session = await subscriptionStatus(auth);
  if (session === null) return { unavailable: "not signed in" };
  if (session.status === "quarantined") {
    return { unavailable: `credentials quarantined (${session.reason ?? "reauth required"})` };
  }
  const { generateImage, editImage, imageReference } = await import("chatgpt-oauth/images");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const tick = setInterval(() => process.stderr.write("."), 5000);
  try {
    const options = requestOptions(args, controller.signal);
    const result =
      kind === "edit"
        ? await editImage(
            auth,
            SUBJECT,
            refs.map((p) => imageReference(new Uint8Array(readFileSync(p)), mediaTypeFor(p))),
            prompt,
            options,
          )
        : await generateImage(auth, SUBJECT, prompt, options);
    return { result };
  } catch (error) {
    if (error?.constructor?.name === "AuthError") return { unavailable: String(error.message ?? error) };
    throw error;
  } finally {
    clearTimeout(timer);
    clearInterval(tick);
    process.stderr.write("\n");
  }
}

async function viaApi(kind, prompt, args, refs) {
  const key = apiKey();
  if (key === null) return { unavailable: "no OPENAI_API_KEY in env and no " + API_KEY_FILE };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const tick = setInterval(() => process.stderr.write("."), 5000);
  try {
    let response;
    if (kind === "edit") {
      const form = new FormData();
      form.set("model", "gpt-image-2");
      form.set("prompt", prompt);
      if (args.n !== undefined) form.set("n", String(args.n));
      if (args.size !== undefined) form.set("size", args.size);
      if (args.quality !== undefined) form.set("quality", args.quality);
      if (args.background !== undefined) form.set("background", args.background);
      for (const p of refs) {
        form.append("image[]", new Blob([readFileSync(p)], { type: mediaTypeFor(p) }), p.split("/").pop());
      }
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt,
          ...(args.n === undefined ? {} : { n: Number(args.n) }),
          ...(args.size === undefined ? {} : { size: args.size }),
          ...(args.quality === undefined ? {} : { quality: args.quality }),
          ...(args.background === undefined ? {} : { background: args.background }),
        }),
        signal: controller.signal,
      });
    }
    if (!response.ok) {
      const snippet = (await response.text()).slice(0, 300);
      throw new Error(`API request failed (${response.status}): ${snippet}`);
    }
    const parsed = await response.json();
    return {
      result: {
        images: (parsed.data ?? []).map((e) => ({ bytes: Buffer.from(e.b64_json, "base64") })),
        size: parsed.size,
        quality: parsed.quality,
        usage: parsed.usage,
      },
    };
  } finally {
    clearTimeout(timer);
    clearInterval(tick);
    process.stderr.write("\n");
  }
}

async function run(kind, args) {
  const prompt = readPrompt(args);
  const refs = args.ref.map((p) => resolve(p));
  if (kind === "edit" && refs.length === 0) {
    console.log("ERROR edit requires at least one --ref image");
    process.exit(1);
  }
  for (const p of refs) {
    if (!existsSync(p)) { console.log(`ERROR reference image not found: ${p}`); process.exit(1); }
  }
  const backend = args.backend ?? "auto";
  const tried = [];
  if (backend === "auto" || backend === "subscription") {
    const attempt = await viaSubscription(kind, prompt, args, refs);
    if (attempt.result) {
      console.log("BACKEND subscription");
      writeImages(attempt.result.images, args.out, attempt.result);
      return;
    }
    tried.push(`subscription: ${attempt.unavailable}`);
    if (backend === "subscription") {
      console.log(`ERROR subscription backend unavailable (${attempt.unavailable})`);
      console.log(`NEEDS_LOGIN run: node ${join(SCRIPT_DIR, "imagegen.mjs")} login`);
      process.exit(1);
    }
  }
  if (backend === "auto" || backend === "api") {
    const attempt = await viaApi(kind, prompt, args, refs);
    if (attempt.result) {
      console.log(`BACKEND api${tried.length > 0 ? ` (${tried[0]})` : ""}`);
      writeImages(attempt.result.images, args.out, attempt.result);
      return;
    }
    tried.push(`api: ${attempt.unavailable}`);
  }
  console.log(`ERROR no backend available. ${tried.join("; ")}`);
  console.log(`NEEDS_LOGIN run: node ${join(SCRIPT_DIR, "imagegen.mjs")} login`);
  process.exit(1);
}

async function login() {
  const auth = await subscriptionAuth();
  const existing = await subscriptionStatus(auth);
  if (existing !== null) {
    console.log(`ALREADY_SIGNED_IN plan=${existing.planType ?? "unknown"} email=${existing.email ?? "unknown"}`);
    return;
  }
  const device = await auth.startDeviceLogin(SUBJECT);
  console.log(`LOGIN_URL ${device.verificationUrl}`);
  console.log(`LOGIN_CODE ${device.userCode}`);
  console.log("WAITING approve in the browser; this command blocks until then");
  await device.wait();
  const status = await subscriptionStatus(auth);
  console.log(`SIGNED_IN plan=${status?.planType ?? "unknown"} email=${status?.email ?? "unknown"}`);
}

async function status() {
  const auth = await subscriptionAuth();
  const sub = await subscriptionStatus(auth);
  if (sub === null) {
    console.log("SUBSCRIPTION not signed in");
  } else if (sub.status === "quarantined") {
    console.log(`SUBSCRIPTION quarantined (${sub.reason ?? "reauth required"}); run login again`);
  } else {
    console.log(`SUBSCRIPTION signed-in plan=${sub.planType ?? "unknown"} email=${sub.email ?? "unknown"}`);
  }
  console.log(apiKey() !== null ? "API key available" : `API no key (set OPENAI_API_KEY or ${API_KEY_FILE})`);
}

function usage() {
  console.log(`usage:
  imagegen.mjs status
  imagegen.mjs login | logout
  imagegen.mjs generate --prompt "..." | --prompt-file f.txt
                [--out path.png] [--n 1] [--size 1536x1024]
                [--quality low|medium|high|auto] [--background transparent|opaque|auto]
                [--backend auto|subscription|api]
  imagegen.mjs edit --ref a.png [--ref b.png ...] --prompt "..." [same flags]`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (command === undefined || args.help) { usage(); process.exit(command === undefined ? 1 : 0); }
ensureDeps();
try {
  if (command === "login") await login();
  else if (command === "logout") { rmSync(STORE_DIR, { recursive: true, force: true }); console.log("SIGNED_OUT"); }
  else if (command === "status") await status();
  else if (command === "generate") await run("generate", args);
  else if (command === "edit") await run("edit", args);
  else { usage(); process.exit(1); }
} catch (error) {
  console.log(`ERROR ${error?.message ?? error}`);
  process.exit(1);
}
