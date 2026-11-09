/** Frameback MCP stdio server (owned by lane L3). The CLI (`frameback mcp`) calls startMcpServer(). */
export interface McpServerOptions {
  /** default root directory to search for reviews */
  root?: string;
}
export async function startMcpServer(_opts: McpServerOptions = {}): Promise<void> {
  throw new Error("not implemented (L3)");
}
