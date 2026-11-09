/** Frameback HTTP server: lifecycle, registry and web UI location. */
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { Registry } from "./registry.js";

export { Registry } from "./registry.js";
export type { RegistryEntry } from "./registry.js";
export { assertVideoFile, prepareReview, splitVersion, InvalidVideoError } from "./prepare.js";

export interface StartServerOptions {
  /** 0 = ephemeral */
  port?: number;
  /** serve the built web UI (disable when the Vite dev server fronts this one) */
  serveWeb?: boolean;
  dev?: boolean;
}

export interface RunningServer {
  port: number;
  url: string;
  registry: Registry;
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

/** Start listening on 127.0.0.1. Rejects with the listen error (e.g. EADDRINUSE). */
export function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  const registry = new Registry();
  const app = createApp({ registry, webDir: opts.serveWeb === false ? undefined : findWebDir(), dev: opts.dev });
  return new Promise((resolve, reject) => {
    const server = app.listen(opts.port ?? 0, HOST);
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        url: `http://${HOST}:${port}`,
        registry,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
