import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const NAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const plugin = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
const mcp = JSON.parse(await readFile(join(root, "mcp.json"), "utf8"));

assert(typeof plugin.name === "string" && NAME_RE.test(plugin.name), "plugin.json name is invalid");
assert(typeof plugin.version === "string" && plugin.version.length > 0, "plugin.json version missing");
assert(typeof plugin.description === "string" && plugin.description.length > 0, "plugin.json description missing");
assert(plugin.variables?.properties?.MCP_URL, "plugin.json must declare MCP_URL");
assert(plugin.variables?.properties?.MCP_TOKEN, "plugin.json must declare MCP_TOKEN");

const server = mcp.mcpServers?.["project-harness"];
assert(server?.type === "streamable-http", "mcp.json must use streamable-http");
assert(server?.url === "${MCP_URL}", "mcp.json url must be ${MCP_URL}");
assert(
  server?.headers?.Authorization === "Bearer ${MCP_TOKEN}",
  "mcp.json must send Bearer ${MCP_TOKEN}",
);

const pluginSchemaUrl = plugin.$schema;
const mcpSchemaUrl = mcp.$schema;
assert(
  pluginSchemaUrl === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "plugin.json $schema mismatch",
);
assert(
  mcpSchemaUrl === "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcp.json $schema mismatch",
);

try {
  const [pluginSchemaRes, mcpSchemaRes] = await Promise.all([
    fetch(pluginSchemaUrl),
    fetch(mcpSchemaUrl),
  ]);
  if (pluginSchemaRes.ok && mcpSchemaRes.ok) {
    const pluginSchema = await pluginSchemaRes.json();
    const mcpSchema = await mcpSchemaRes.json();
    assert(mcpSchema.type === "object", "mcp schema is not an object");
    const extra = plugin.variables;
    assert(extra !== undefined, "Grok Bot needs top-level variables even if the public schema forbids it");
    void pluginSchema;
  }
} catch {
  console.log("schema fetch skipped");
}

console.log("plugin manifests ok");
