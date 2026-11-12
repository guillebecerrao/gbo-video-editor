import { describe, expect, it } from "vitest";
import { formatShare } from "./open.js";

const k = "?r=x&key=K";
const ts = { url: `http://studio.example.ts.net:4747/${k}`, kind: "tailscale" as const };
const tsIp = { url: `http://100.64.1.2:4747/${k}`, kind: "tailscale" as const };
const lanName = { url: `http://studio.local:4747/${k}`, kind: "lan" as const };
const lanIp = { url: `http://192.168.1.20:4747/${k}`, kind: "lan" as const };

describe("share output", () => {
  it("recommends the Tailscale IP, not the MagicDNS name, and lists the rest as alternatives", () => {
    const out = formatShare([ts, tsIp, lanName, lanIp]);
    expect(out[2]).toContain("http://100.64.1.2:4747/");
    expect(out[2]).toContain("Tailscale · encrypted");
    const alt = out.slice(out.findIndex((l) => l.startsWith("Other addresses")));
    expect(alt.join("\n")).toContain("studio.example.ts.net");
    expect(alt.join("\n")).toContain("192.168.1.20");
    expect(alt.join("\n")).not.toContain("100.64.1.2");
  });
  it("without Tailscale it recommends the LAN IP", () => {
    expect(formatShare([lanName, lanIp])[2]).toContain("http://192.168.1.20:4747/");
  });
  it("a single link has no alternatives section", () => {
    expect(formatShare([lanIp]).join("\n")).not.toContain("Other addresses");
  });
});
