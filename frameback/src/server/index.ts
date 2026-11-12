/** Frameback HTTP server: lifecycle, registry and web UI location. */
import { existsSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { Registry } from "./registry.js";
import {
  DEFAULT_SHARE_TTL_HOURS,
  MAX_SHARE_TTL_HOURS,
  detectNetwork,
  newShareKey,
  shareLinks,
  type ShareConfig,
  type ShareLink,
  type ShareMode,
  type ShareNetwork,
} from "./share.js";

export { Registry } from "./registry.js";
export type { RegistryEntry } from "./registry.js";
export { assertVideoFile, prepareReview, splitVersion, InvalidVideoError, VideoChangedError } from "./prepare.js";

export interface StartServerOptions {
  /** 0 = ephemeral */
  port?: number;
  /** serve the built web UI (disable when the Vite dev server fronts this one) */
  serveWeb?: boolean;
  dev?: boolean;
  /** also listen on private networks; untrusted peers need the key (see share.ts). `true` = "lan" */
  share?: boolean | ShareMode;
  /** hours the share key stays valid (default 12, max 24) */
  shareTtlHours?: number;
  /** tests: use this network plan instead of detecting interfaces and Tailscale */
  shareNetwork?: ShareNetwork;
}

export interface RunningServer {
  port: number;
  url: string;
  registry: Registry;
  /** set in share mode */
  share?: { key: string; mode: ShareMode; expiresAt: number; listening: string[]; links(rid?: string): ShareLink[] };
  close(): Promise<void>;
}

const HOST = "127.0.0.1";
const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the package: `dist/cli/` (built) and `src/server|cli/` (tsx) are both two levels below it. */
export const packageRoot = path.resolve(here, "..", "..");

/** `dist/web` of this package, or undefined when the UI has not been built. */
export function findWebDir(): string | undefined {
  const dir = path.join(packageRoot, "dist", "web");
  return existsSync(path.join(dir, "index.html")) ? dir : undefined;
}

function listen(server: http.Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/**
 * Listen on 127.0.0.1; in share mode also on each private address chosen by `detectNetwork` (never 0.0.0.0).
 * Rejects with the listen error of 127.0.0.1 (e.g. EADDRINUSE).
 */
export async function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  const registry = new Registry();
  let shareConfig: ShareConfig | undefined;
  let net: ShareNetwork | undefined;
  if (opts.share) {
    const mode: ShareMode = opts.share === true ? "lan" : opts.share;
    const ttl = Math.min(MAX_SHARE_TTL_HOURS, opts.shareTtlHours ?? DEFAULT_SHARE_TTL_HOURS);
    net = opts.shareNetwork ?? (await detectNetwork(mode));
    shareConfig = { key: newShareKey(), hosts: net.accepted, listen: new Set([HOST]), expiresAt: Date.now() + ttl * 3_600_000, mode };
  }
  let port = 0;
  const cfg = shareConfig;
  const app = createApp({
    registry,
    webDir: opts.serveWeb === false ? undefined : findWebDir(),
    dev: opts.dev,
    share: cfg,
    shareLinks: net && cfg ? (rid) => shareLinks(net!.links, port, cfg.key, rid) : undefined,
  });

  const servers: http.Server[] = [];
  const close = () =>
    Promise.all(
      servers.map(
        (s) =>
          new Promise<void>((done) => {
            s.close(() => done());
            s.closeAllConnections();
          }),
      ),
    ).then(() => undefined);

  const main = http.createServer(app);
  servers.push(main);
  port = await listen(main, opts.port ?? 0, HOST);

  let expiryTimer: NodeJS.Timeout | undefined;
  if (cfg && net) {
    for (const addr of net.listen) {
      const extra = http.createServer(app);
      try {
        await listen(extra, port, addr);
        // an interface that goes away later (wifi change) must not take the process down
        extra.on("error", (e) => process.stderr.write(`frameback: share listener on a network address failed: ${(e as Error).message}\n`));
        servers.push(extra);
        cfg.listen.add(addr);
      } catch (e) {
        process.stderr.write(`frameback: warning: could not share on one network address (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}); skipping it\n`);
      }
    }
    expiryTimer = setTimeout(() => {
      process.stderr.write("frameback: the share link expired: other computers now get 401. This computer keeps working; run `frameback open --share` again (after stopping this server) for a new link.\n");
    }, Math.max(0, cfg.expiresAt - Date.now()));
    expiryTimer.unref();
  }

  return {
    port,
    share: cfg && { key: cfg.key, mode: cfg.mode, expiresAt: cfg.expiresAt, listening: [...cfg.listen], links: (rid) => shareLinks(net!.links, port, cfg.key, rid) },
    url: `http://${HOST}:${port}`,
    registry,
    close: () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      return close();
    },
  };
}
