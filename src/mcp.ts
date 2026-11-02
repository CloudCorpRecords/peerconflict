/**
 * peerconflict MCP server. Tools: explain_peer_conflict.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The explanation is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { explainPeerConflict, formatPayload, VERSION } from "./peerconflict.js";

const TOOLS = [
  {
    name: "explain_peer_conflict",
    description:
      "Explain peer-dependency conflicts: every peer requirement checked against the installed tree as a graph, each conflict typed as missing or version, with the least-change resolution per peer.",
    inputSchema: {
      type: "object" as const,
      properties: {
        packages: {
          type: "array",
          description: "Packages in the resolved tree (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Package name (unique across the set)" },
              version: {
                type: "string",
                description: "Installed version, MAJOR.MINOR.PATCH",
              },
              peers: {
                type: "array",
                description: "Peer requirements of this package (optional, default [])",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Peer package name" },
                    range: {
                      type: "string",
                      description:
                        "Required range: \"*\", an exact version, \"^x.y.z\", \"~x.y.z\", or \">=x.y.z\"",
                    },
                  },
                  required: ["name", "range"],
                },
              },
            },
            required: ["name", "version"],
          },
        },
      },
      required: ["packages"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "peerconflict", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "explain_peer_conflict") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = explainPeerConflict(raw.packages);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
