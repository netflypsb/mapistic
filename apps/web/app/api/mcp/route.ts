import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { executeMapisticMcpTool, MCP_TOOL_DEFINITIONS } from "@/lib/mcp-tools";

export async function GET() {
  return NextResponse.json({
    ok: true,
    protocol: "Model Context Protocol (MCP) JSON-RPC 2.0",
    server: "mapistic-mcp",
    version: "1.0.0",
    pricing: "Free (self-hosted) · or per-call credits via hosted MYmap",
    tools: MCP_TOOL_DEFINITIONS,
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = await checkRateLimit(`mcp:${ip}`, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limit exceeded" } },
      { status: 429, headers: { "x-ratelimit-backend": rl.backend } }
    );
  }

  const rpc = (await req.json().catch(() => ({}))) as {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };

  const id = rpc.id ?? 1;

  if (rpc.method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mapistic-mcp", version: "1.0.0" },
      },
    });
  }

  if (rpc.method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { tools: MCP_TOOL_DEFINITIONS },
    });
  }

  if (rpc.method === "tools/call") {
    const toolName = rpc.params?.name || "";
    const toolArgs = rpc.params?.arguments || {};
    try {
      const outcome = await executeMapisticMcpTool(toolName, toolArgs);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
          isError: false,
        },
      });
    } catch (err) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message: err instanceof Error ? err.message : "Tool execution failed",
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unsupported method: ${rpc.method}` },
  });
}
