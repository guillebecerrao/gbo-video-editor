import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { createApp, redactPaths } from "./app.js";
import { startServer, type RunningServer } from "./index.js";
import { Registry } from "./registry.js";
import {
  FailureLimiter,
  isPrivateAddress,
  lanAddresses,
  newShareKey,
  parseShareTtl,
  planNetwork,
  remoteAllowed,
  type ShareNetwork,
} from "./share.js";

// Generic, made-up names only (this repository is public).
const TS_NAME = "review-mac.example.ts.net";
const NET: ShareNetwork = {
  links: [
    { host: TS_NAME, kind: "tailscale" },
    { host: "review-mac.local", kind: "lan" },
  ],
  accepted: [TS_NAME, "review-mac.local"],
  listen: [],
};
const lan = lanAddresses()[0];

let tmp: string;
let video: string;
const servers: RunningServer[] = [];
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

interface Raw {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Raw request so we control Host/Origin/Cookie/forwarding headers and the socket's peer address. */
function raw(port: number, p: string, headers: Record<string, string>, opts: { via?: string; method?: string; body?: Buffer | string } = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: opts.via ?? "127.0.0.1", port, path: p, method: opts.method ?? "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function start(extra: Parameters<typeof startServer>[0] = {}): Promise<RunningServer> {
  const s = await startServer({ port: 0, serveWeb: false, share: true, shareNetwork: NET, ...extra });
  servers.push(s);
  return s;
}

const local = (s: RunningServer) => ({ Host: `127.0.0.1:${s.port}` });

/** A peer coming through a local proxy (`tailscale serve` style): loopback socket, foreign Host, with the key cookie. */
function proxied(s: RunningServer) {
  const cookie = `frameback_key=${s.share!.key}`;
  return (p: string, o: { method?: string; json?: unknown; headers?: Record<string, string> } = {}) =>
    raw(
      s.port,
      p,
      { Host: TS_NAME, Cookie: cookie, ...(o.json !== undefined ? { "Content-Type": "application/json" } : {}), ...o.headers },
      { method: o.method, body: o.json !== undefined ? JSON.stringify(o.json) : undefined },
    );
}

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-share-"));
  video = path.join(tmp, "clip.mp4");
  await fs.writeFile(video, Buffer.alloc(5000, 3));
  await fs.writeFile(path.join(tmp, "other.mp4"), Buffer.alloc(5000, 4));
});
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("S1 · remote allowlist (peer with a valid key)", () => {
  let s: RunningServer;
  let rid: string;
  let send: ReturnType<typeof proxied>;
  beforeAll(async () => {
    s = await start();
    rid = (await s.registry.register(video, {})).entry.rid;
    send = proxied(s);
  });

  it("cannot register a path, even a real video, even with the key: 403", async () => {
    expect((await send("/api/reviews", { method: "POST", json: { video: "/etc/hosts" } })).status).toBe(403);
    expect((await send("/api/reviews", { method: "POST", json: { video: path.join(tmp, "other.mp4") } })).status).toBe(403);
    expect(s.registry.list()).toHaveLength(1);
  });
  it("cannot call admin routes: video-info, share links, health, unknown routes", async () => {
    expect((await send(`/api/reviews/${rid}/video-info`, { method: "POST", json: { duration: 3 } })).status).toBe(403);
    expect((await send(`/api/share?rid=${rid}`)).status).toBe(403);
    expect((await send("/api/health")).status).toBe(403);
    expect((await send("/api/anything-new")).status).toBe(403);
    expect((await send(`/media/${rid}/whatever`)).status).toBe(403);
  });
  it("can do the whole review: bundle, video, comment, thread, snapshot, status, submit, reopen", async () => {
    expect((await send(`/api/reviews/${rid}`)).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/timeline`)).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/video-status`)).status).toBe(200);
    const range = await send(`/media/${rid}/video`, { headers: { Range: "bytes=0-99" } });
    expect(range.status).toBe(206);
    expect(range.body.length).toBe(100);
    const created = await send(`/api/reviews/${rid}/comments`, { method: "POST", json: { comment: { anchor: { time: { start: 0 } }, category: "cut", body: "tighten" } } });
    expect(created.status).toBe(200);
    const id = (JSON.parse(created.body) as { id: string }).id;
    expect((await send(`/api/reviews/${rid}/comments/${id}`, { method: "PATCH", json: { body: "tighter" } })).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/comments/${id}/thread`, { method: "POST", json: { text: "and here" } })).status).toBe(200);
    const snap = await raw(s.port, `/api/reviews/${rid}/comments/${id}/snapshot`, { Host: TS_NAME, Cookie: `frameback_key=${s.share!.key}`, "Content-Type": "image/jpeg" }, { method: "PUT", body: JPEG });
    expect(snap.status).toBe(200);
    expect((await send(`/media/${rid}/snapshots/${id}.jpg`)).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/comments`)).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/submit`, { method: "POST" })).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/reopen`, { method: "POST" })).status).toBe(200);
    expect((await send(`/api/reviews/${rid}/comments/${id}`, { method: "DELETE" })).status).toBe(200);
  });
  it("the allowlist itself", () => {
    expect(remoteAllowed("POST", "/api/reviews")).toBe(false);
    expect(remoteAllowed("GET", "/api/reviews")).toBe(true);
    expect(remoteAllowed("POST", "/api/reviews/x/video-info")).toBe(false);
    expect(remoteAllowed("GET", "/api/share")).toBe(false);
    expect(remoteAllowed("HEAD", "/media/x/video")).toBe(true);
    expect(remoteAllowed("POST", "/media/x/video")).toBe(false);
    expect(remoteAllowed("GET", "/assets/index.js")).toBe(true);
    expect(remoteAllowed("POST", "/")).toBe(false);
  });
});

describe("S2 · only a direct localhost client skips the key", () => {
  let s: RunningServer;
  beforeAll(async () => {
    s = await start();
  });
  it("loopback + loopback Host: no key needed, full access", async () => {
    expect((await raw(s.port, "/api/health", local(s))).status).toBe(200);
    expect((await raw(s.port, "/api/health", { Host: `localhost:${s.port}` })).status).toBe(200);
  });
  it("loopback with a foreign (accepted) Host, as a local proxy forwards it: 401", async () => {
    expect((await raw(s.port, "/api/health", { Host: TS_NAME })).status).toBe(401);
  });
  it("loopback Host but X-Forwarded-For / Forwarded: 401", async () => {
    expect((await raw(s.port, "/api/health", { ...local(s), "X-Forwarded-For": "203.0.113.7" })).status).toBe(401);
    expect((await raw(s.port, "/api/health", { ...local(s), Forwarded: "for=203.0.113.7" })).status).toBe(401);
  });
  it("the share links are for trusted local clients only, Tailscale first, never in health", async () => {
    const body = JSON.parse((await raw(s.port, "/api/share?rid=clip", local(s))).body) as { links: { url: string; kind: string }[]; mode: string };
    expect(body.mode).toBe("lan");
    expect(body.links.map((l) => l.kind)).toEqual(["tailscale", "lan"]);
    expect(body.links.every((l) => l.url.includes(`key=${s.share!.key}`) && l.url.includes("r=clip"))).toBe(true);
    expect((await raw(s.port, "/api/health", local(s))).body).not.toContain(s.share!.key);
  });
  it("a foreign Host or Origin is still rejected", async () => {
    expect((await raw(s.port, "/api/health", { Host: "evil.example.com" })).status).toBe(403);
    expect((await raw(s.port, "/api/health", { ...local(s), Origin: "http://evil.example.com" })).status).toBe(403);
  });
});

describe("S3 · listens only on loopback and the planned private addresses", () => {
  it("not on 0.0.0.0: an address outside the plan is not even reachable", async () => {
    const s = await start();
    expect(s.share!.listening).toEqual(["127.0.0.1"]);
    if (lan) await expect(raw(s.port, "/", { Host: `${lan}:${s.port}` }, { via: lan })).rejects.toThrow();
  });
  it("refuses a request that arrived on an interface outside the set", async () => {
    const app = createApp({ registry: new Registry(), share: { key: newShareKey(), hosts: [], listen: new Set(["10.0.0.9"]), expiresAt: Date.now() + 60_000, mode: "lan" } });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    try {
      const port = (server.address() as AddressInfo).port;
      expect((await raw(port, "/api/health", { Host: `127.0.0.1:${port}` })).status).toBe(403);
    } finally {
      server.close();
    }
  });
  it("an address that is not on this machine is skipped; the server still starts", async () => {
    const s = await start({ shareNetwork: { ...NET, listen: ["10.255.255.254"] } });
    expect(s.share!.listening).toEqual(["127.0.0.1"]);
    expect((await raw(s.port, "/api/health", local(s))).status).toBe(200);
  });
  it("private ranges", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.0.10", "100.64.0.1", "100.127.1.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "169.254.1.1", "127.0.0.1", "::1"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("S4 · links: Tailscale first, `--share tailscale` only Tailscale", () => {
  const ts = { dnsName: TS_NAME, ips: ["100.100.1.2"] };
  it("lan mode: Tailscale links first, then .local and LAN IPs; public IPs never listened on", () => {
    const n = planNetwork("lan", "Review-Mac", ["192.168.1.20", "100.100.1.2"], ts);
    expect(n.links).toEqual([
      { host: TS_NAME, kind: "tailscale" },
      { host: "100.100.1.2", kind: "tailscale" },
      { host: "review-mac.local", kind: "lan" },
      { host: "192.168.1.20", kind: "lan" },
    ]);
    expect(n.listen).toEqual(["100.100.1.2", "192.168.1.20"]);
    expect(planNetwork("lan", "review-mac", ["203.0.113.5"], null).listen).toEqual([]);
  });
  it("tailscale mode: no LAN links, accepted hosts or listeners", () => {
    const n = planNetwork("tailscale", "review-mac", ["192.168.1.20"], ts);
    expect(n.links.every((l) => l.kind === "tailscale")).toBe(true);
    expect(n.accepted).not.toContain("192.168.1.20");
    expect(n.accepted).not.toContain("review-mac.local");
    expect(n.listen).toEqual(["100.100.1.2"]);
  });
});

describe("S5 · the key expires", () => {
  it("after the TTL a remote peer gets 401 even with the cookie; localhost keeps working", async () => {
    const s = await start({ shareTtlHours: 0.3 / 3600 });
    const ok = await raw(s.port, `/?key=${s.share!.key}`, { Host: TS_NAME });
    expect(ok.status).toBe(302);
    await new Promise((r) => setTimeout(r, 400));
    const res = await proxied(s)("/api/reviews");
    expect(res.status).toBe(401);
    expect(res.body).toContain("expired");
    expect((await raw(s.port, `/?key=${s.share!.key}`, { Host: TS_NAME })).status).toBe(401);
    expect((await raw(s.port, "/api/health", local(s))).status).toBe(200);
  });
  it("the cookie lives as long as the key (12 h by default); TTL is bounded", async () => {
    const s = await start();
    const res = await raw(s.port, `/?key=${s.share!.key}`, { Host: TS_NAME });
    const cookie = String(res.headers["set-cookie"]);
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(12 * 3600 - 10);
    expect(maxAge).toBeLessThanOrEqual(12 * 3600);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(res.headers.location).toBe("/");
    expect(parseShareTtl("0.5")).toBe(0.5);
    expect(parseShareTtl("24")).toBe(24);
    for (const bad of ["25", "0", "-1", "abc"]) expect(() => parseShareTtl(bad)).toThrow();
  });
});

describe("S5b · link opened from another site", () => {
  it("cross-site click: redirect with a Lax cookie, then the follow-up request gets 200; cross-site writes stay 403", async () => {
    const s = await start();
    const hdr = { Host: TS_NAME, "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate" };
    const first = await raw(s.port, `/?key=${s.share!.key}`, hdr);
    expect(first.status).toBe(302);
    const cookie = String(first.headers["set-cookie"]);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/Strict/);
    const next = await raw(s.port, String(first.headers.location), { Host: TS_NAME, Cookie: cookie.split(";")[0], "Sec-Fetch-Site": "cross-site" });
    expect(next.status).toBe(200);
    const write = await raw(s.port, "/api/reviews/x/submit", { Host: TS_NAME, Cookie: cookie.split(";")[0], Origin: "http://evil.example.com" }, { method: "POST" });
    expect(write.status).toBe(403);
  });
});

describe("S6 · failed attempts are rate limited", () => {
  it("20 wrong keys get 401, the 21st (and a right key right after) get 429", async () => {
    const s = await start();
    for (let i = 0; i < 20; i++) expect((await raw(s.port, "/?key=wrong", { Host: TS_NAME })).status).toBe(401);
    expect((await raw(s.port, "/?key=wrong", { Host: TS_NAME })).status).toBe(429);
    expect((await raw(s.port, `/?key=${s.share!.key}`, { Host: TS_NAME })).status).toBe(429);
    expect((await raw(s.port, "/api/health", local(s))).status).toBe(200); // the trusted local client is never limited
  });
  it("the window resets", () => {
    let t = 0;
    const l = new FailureLimiter(2, 1000, () => t);
    l.fail("a");
    l.fail("a");
    expect(l.blocked("a")).toBe(true);
    expect(l.blocked("b")).toBe(false);
    t = 1001;
    expect(l.blocked("a")).toBe(false);
  });
});

describe("S7 · no absolute paths or key leaks to remote peers", () => {
  let s: RunningServer;
  let rid: string;
  beforeAll(async () => {
    s = await start();
    rid = (await s.registry.register(video, {})).entry.rid;
  });
  it("review list and bundle carry no absolute path; responses are no-store", async () => {
    const send = proxied(s);
    const list = await send("/api/reviews");
    expect(list.status).toBe(200);
    expect(list.headers["cache-control"]).toBe("no-store");
    const bundle = await send(`/api/reviews/${rid}`);
    for (const body of [list.body, bundle.body]) {
      expect(body).not.toContain(tmp);
      expect(body).not.toContain(os.homedir());
    }
    expect(JSON.parse(list.body)[0]).not.toHaveProperty("reviewDir");
    expect((await send(`/media/${rid}/video`, { headers: { Range: "bytes=0-9" } })).headers["cache-control"]).toBe("no-store");
  });
  it("localhost keeps the absolute reviewDir (nothing changes for the local agent)", async () => {
    const res = await raw(s.port, "/api/reviews", local(s));
    expect(JSON.parse(res.body)[0].reviewDir).toBe(path.join(tmp, "review", rid));
  });
  it("the key is never written into the review folder", async () => {
    await raw(s.port, `/?key=${s.share!.key}`, { Host: TS_NAME });
    const dir = path.join(tmp, "review", rid);
    for (const f of await fs.readdir(dir, { recursive: true })) {
      const file = path.join(dir, String(f));
      if ((await fs.stat(file)).isFile()) expect(await fs.readFile(file, "utf8")).not.toContain(s.share!.key);
    }
  });
  it("error messages lose absolute paths", () => {
    expect(redactPaths("file not found: /home/someone/videos/a.mp4")).toBe("file not found: <path>");
    expect(redactPaths("snapshotDataUrl must be a data:image/jpeg;base64 URL")).toBe("snapshotDataUrl must be a data:image/jpeg;base64 URL");
  });
});

describe.skipIf(!lan)("S8 · a real peer on this machine's LAN address", () => {
  let s: RunningServer;
  let rid: string;
  beforeAll(async () => {
    s = await start({ shareNetwork: { links: [{ host: lan, kind: "lan" }], accepted: [lan], listen: [lan] } });
    rid = (await s.registry.register(video, {})).entry.rid;
  });
  it("needs the key, then reviews; cannot register paths", async () => {
    const host = { Host: `${lan}:${s.port}` };
    expect(s.share!.listening).toEqual(["127.0.0.1", lan]);
    expect((await raw(s.port, "/api/reviews", host, { via: lan })).status).toBe(401);
    expect((await raw(s.port, `/?r=${rid}&key=${s.share!.key}`, host, { via: lan })).status).toBe(302);
    const Cookie = `frameback_key=${s.share!.key}`;
    expect((await raw(s.port, `/api/reviews/${rid}`, { ...host, Cookie }, { via: lan })).status).toBe(200);
    expect((await raw(s.port, `/media/${rid}/video`, { ...host, Cookie, Range: "bytes=0-9" }, { via: lan })).status).toBe(206);
    const post = await raw(s.port, "/api/reviews", { ...host, Cookie, "Content-Type": "application/json" }, { via: lan, method: "POST", body: JSON.stringify({ video: "/etc/hosts" }) });
    expect(post.status).toBe(403);
    expect((await raw(s.port, `/api/reviews/${rid}`, { ...host, Cookie, Origin: "http://evil.example.com" }, { via: lan })).status).toBe(403);
  });
});

describe("without --share nothing changes", () => {
  let plain: RunningServer;
  beforeAll(async () => {
    plain = await startServer({ port: 0, serveWeb: false });
    servers.push(plain);
  });
  it("no share field, no /api/share, foreign Host still 403, no no-store", async () => {
    const health = await fetch(`${plain.url}/api/health`);
    expect(await health.json()).not.toHaveProperty("share");
    expect(health.headers.get("cache-control")).toBeNull();
    expect((await fetch(`${plain.url}/api/share`)).status).toBe(404);
    expect((await raw(plain.port, "/api/health", { Host: "studio-mac.local" })).status).toBe(403);
    expect((await raw(plain.port, "/api/health", { Host: "192.168.1.20" })).status).toBe(403);
  });
  it("a proxy header does not lock out localhost (there is no key without --share)", async () => {
    expect((await raw(plain.port, "/api/health", { Host: `127.0.0.1:${plain.port}`, "X-Forwarded-For": "203.0.113.7" })).status).toBe(200);
  });
  it("the key is at least 128 bits", () => {
    expect(Buffer.from(newShareKey(), "base64url").length).toBeGreaterThanOrEqual(16);
  });
});
