/**
 * `--share`: let another computer on a private network (Tailscale, home/office wifi) review, gated by a per-process key.
 *
 * Principle: whoever has the link can REVIEW (watch, comment, submit) and nothing else. Everything that receives a
 * path or changes the server stays with the trusted local client (see `isTrustedLocal`). See SECURITY.md.
 */
import { execFile } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import os from "node:os";

export const SHARE_COOKIE = "frameback_key";

/** `--share` publishes on every private network; `--share tailscale` only on Tailscale. */
export type ShareMode = "lan" | "tailscale";

export const DEFAULT_SHARE_TTL_HOURS = 12;
export const MAX_SHARE_TTL_HOURS = 24;
/** failed key attempts per remote IP and window before answering 429 */
export const RATE_LIMIT_FAILURES = 20;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface ShareConfig {
  /** random per process; 192 bits, base64url */
  key: string;
  /** lowercase hostnames / IPs (no port) this machine answers to, besides loopback */
  hosts: string[];
  /** local addresses (IPv4, no `::ffff:`) a request may arrive on; anything else is refused */
  listen: Set<string>;
  /** epoch ms after which the key stops working for remote peers */
  expiresAt: number;
  mode: ShareMode;
}

export interface ShareLink {
  url: string;
  kind: "tailscale" | "lan";
}

export function newShareKey(): string {
  return randomBytes(24).toString("base64url");
}

export function keyMatches(expected: string, given: unknown): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** `::ffff:10.0.0.2` -> `10.0.0.2` */
export function plainAddress(addr: string | undefined): string {
  return (addr ?? "").replace(/^::ffff:/i, "");
}

export function isLoopbackAddress(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

/** Hostname of a `Host` header value (port and IPv6 brackets handled), lowercased. */
export function hostnameOf(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.replace(/:\d+$/, "");
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A request that may skip the key: loopback socket AND loopback `Host` AND no proxy headers.
 * A local reverse proxy (`tailscale serve`, nginx…) also connects from loopback, but forwards a foreign Host
 * or adds forwarding headers: those requests are treated as remote.
 */
export function isTrustedLocal(req: IncomingMessage): boolean {
  if (!isLoopbackAddress(req.socket.remoteAddress)) return false;
  if (!LOOPBACK_HOSTNAMES.has(hostnameOf(req.headers.host ?? ""))) return false;
  const h = req.headers;
  return h["x-forwarded-for"] === undefined && h.forwarded === undefined && h["x-forwarded-host"] === undefined && h["x-real-ip"] === undefined;
}

function ipv4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** 100.64.0.0/10 (carrier-grade NAT; Tailscale addresses live here) */
export function isTailscaleRange(ip: string): boolean {
  const a = ipv4(ip);
  return !!a && a[0] === 100 && a[1] >= 64 && a[1] <= 127;
}

/** RFC 1918 (10/8, 172.16/12, 192.168/16) or 100.64/10. Public addresses are never listened on. */
export function isPrivateAddress(ip: string): boolean {
  const a = ipv4(ip);
  if (!a) return false;
  return a[0] === 10 || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) || (a[0] === 192 && a[1] === 168) || isTailscaleRange(ip);
}

/** Private IPv4 addresses of this machine's interfaces (no loopback, no link-local, no public). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && isPrivateAddress(i.address)) out.push(i.address);
    }
  }
  return out;
}

export interface TailscaleInfo {
  dnsName?: string;
  ips: string[];
}

const TAILSCALE_BINS = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];

function run(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(bin, ["status", "--json"], { timeout: 1500, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout));
    } catch {
      resolve(null);
    }
  });
}

/** Optional: never throws, returns null when Tailscale is absent, stopped or slow. */
export async function detectTailscale(): Promise<TailscaleInfo | null> {
  for (const bin of TAILSCALE_BINS) {
    const out = await run(bin);
    if (!out) continue;
    try {
      const status = JSON.parse(out) as { BackendState?: string; Self?: { DNSName?: string; TailscaleIPs?: string[] } };
      const self = status.Self;
      if (!self || (status.BackendState && status.BackendState !== "Running")) continue;
      const dnsName = self.DNSName?.replace(/\.$/, "").toLowerCase() || undefined;
      const ips = (self.TailscaleIPs ?? []).filter(isTailscaleRange);
      if (ips.length) return { dnsName, ips };
    } catch {
      /* not JSON: try the next binary */
    }
  }
  return null;
}

export interface ShareNetwork {
  /** links to print, Tailscale first */
  links: { host: string; kind: ShareLink["kind"] }[];
  /** everything the Host guard should accept */
  accepted: string[];
  /** addresses to listen on besides 127.0.0.1 */
  listen: string[];
}

export class NoTailscaleError extends Error {
  constructor() {
    super("--share tailscale: Tailscale is not running on this computer (start it and sign in, or use --share for your local network)");
  }
}

/** Pure: build what to print, accept and listen on from what was detected. */
export function planNetwork(mode: ShareMode, hostname: string, lan: string[], ts: TailscaleInfo | null): ShareNetwork {
  const name = hostname.toLowerCase().replace(/\.local$/, "");
  const tsHosts = ts ? [...(ts.dnsName ? [ts.dnsName] : []), ...ts.ips] : [];
  const lanOnly = lan.filter((ip) => !ts?.ips.includes(ip));
  const links: ShareNetwork["links"] = tsHosts.map((host) => ({ host, kind: "tailscale" as const }));
  let accepted = [...tsHosts];
  let listen = [...(ts?.ips ?? [])];
  if (mode === "lan") {
    links.push(...[`${name}.local`, ...lanOnly].map((host) => ({ host, kind: "lan" as const })));
    accepted = [...accepted, `${name}.local`, name, hostname.toLowerCase(), ...lanOnly];
    listen = [...listen, ...lanOnly];
  }
  const seen = new Set<string>();
  return {
    links: links.filter((l) => !seen.has(l.host) && seen.add(l.host)),
    accepted: [...new Set(accepted)],
    listen: [...new Set(listen)].filter(isPrivateAddress),
  };
}

export async function detectNetwork(mode: ShareMode): Promise<ShareNetwork> {
  const ts = await detectTailscale();
  if (mode === "tailscale" && !ts) throw new NoTailscaleError();
  return planNetwork(mode, os.hostname(), lanAddresses(), ts);
}

export function shareLinks(links: ShareNetwork["links"], port: number, key: string, rid?: string): ShareLink[] {
  const q = `${rid ? `r=${encodeURIComponent(rid)}&` : ""}key=${encodeURIComponent(key)}`;
  return links.map(({ host, kind }) => ({ url: `http://${host}:${port}/?${q}`, kind }));
}

export function parseShareTtl(value: string): number {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_SHARE_TTL_HOURS) {
    throw new Error(`--share-ttl must be a number of hours above 0 and at most ${MAX_SHARE_TTL_HOURS} (got '${value}')`);
  }
  return hours;
}

export function shareWarning(ttlHours: number): string[] {
  const ttl = ttlHours >= 1 ? `${+ttlHours.toFixed(2)} h` : ttlHours * 60 >= 1 ? `${Math.round(ttlHours * 60)} min` : `${Math.max(1, Math.round(ttlHours * 3600))} s`;
  return [
    "frameback: SHARE MODE — whoever has this link can watch the video, comment and submit the review (nothing else).",
    `frameback: the link expires in ${ttl} or when this process exits (Ctrl+C); a new run makes a new link.`,
  ];
}

// ----------------------------------------------------------- remote allowlist --

const RID = "[^/]+";
const CID = "c-\\d{4,}";
const ALLOWED: [methods: string[], path: RegExp][] = [
  [["GET"], new RegExp(`^/api/reviews/?$`)],
  [["GET"], new RegExp(`^/api/reviews/${RID}/?$`)],
  [["GET"], new RegExp(`^/api/reviews/${RID}/(video-status|timeline|waveform|events|comments)/?$`)],
  [["GET", "PATCH", "DELETE"], new RegExp(`^/api/reviews/${RID}/comments/${CID}/?$`)],
  [["POST"], new RegExp(`^/api/reviews/${RID}/comments/?$`)],
  [["POST"], new RegExp(`^/api/reviews/${RID}/comments/${CID}/(status|thread)/?$`)],
  [["PUT"], new RegExp(`^/api/reviews/${RID}/comments/${CID}/snapshot/?$`)],
  [["POST"], new RegExp(`^/api/reviews/${RID}/(submit|reopen)/?$`)],
  // `next` registers review.nextVideo, a path written by the local agent in review.json, never one sent by the peer
  [["GET"], new RegExp(`^/media/${RID}/(video|next)/?$`)],
  [["GET"], new RegExp(`^/media/${RID}/snapshots/[^/]+$`)],
];

/** What a peer with the key may call. Everything else (registering videos, `/api/share`, `video-info`, health…) is 403. */
export function remoteAllowed(method: string, path: string): boolean {
  const m = method === "HEAD" ? "GET" : method;
  if (path === "/api" || path.startsWith("/api/") || path === "/media" || path.startsWith("/media/")) {
    return ALLOWED.some(([methods, re]) => methods.includes(m) && re.test(path));
  }
  return m === "GET"; // the web UI: static assets and index.html
}

// --------------------------------------------------------------- rate limit --

/** Failed key attempts per remote address, fixed window, in memory. */
export class FailureLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max = RATE_LIMIT_FAILURES, private windowMs = RATE_LIMIT_WINDOW_MS, private now = () => Date.now()) {}

  blocked(ip: string): boolean {
    const h = this.hits.get(ip);
    if (!h) return false;
    if (h.resetAt <= this.now()) {
      this.hits.delete(ip);
      return false;
    }
    return h.count >= this.max;
  }

  fail(ip: string): void {
    const t = this.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    const h = this.hits.get(ip);
    if (!h || h.resetAt <= t) this.hits.set(ip, { count: 1, resetAt: t + this.windowMs });
    else h.count++;
  }
}

// ------------------------------------------------------------------- pages --

const page = (body: string) =>
  "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><title>Frameback</title>" +
  `<body style="font:16px system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Frameback</h1>${body}`;

export const UNAUTHORIZED_PAGE = page(
  "<p>This review is private. Ask whoever sent it for the full link (it ends in <code>?key=…</code>) and open that link here.</p>",
);
export const EXPIRED_PAGE = page("<p>This review link has expired. Ask whoever sent it for a new link.</p>");
export const TOO_MANY_PAGE = page("<p>Too many attempts with a wrong link. Wait a minute and open the full link again.</p>");
