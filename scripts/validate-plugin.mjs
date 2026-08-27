import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(root, "plugins", "project-harness");

const NAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const plugin = JSON.parse(
  await readFile(join(pluginRoot, ".cursor-plugin", "plugin.json"), "utf8"),
);
const marketplace = JSON.parse(
  await readFile(join(root, ".cursor-plugin", "marketplace.json"), "utf8"),
);
const mcp = JSON.parse(await readFile(join(pluginRoot, "mcp.json"), "utf8"));

assert(typeof plugin.name === "string" && NAME_RE.test(plugin.name), "Cursor plugin name is invalid");
assert(typeof plugin.version === "string" && plugin.version.length > 0, "plugin.json version missing");
assert(typeof plugin.description === "string" && plugin.description.length > 0, "plugin.json description missing");
assert(plugin.mcpServers === "./mcp.json", "Cursor plugin must declare mcp.json");
assert(plugin.variables?.type === "object", "Cursor plugin variables must be an object schema");
assert(plugin.variables?.properties?.MCP_URL, "plugin.json must declare MCP_URL");
assert(plugin.variables?.properties?.MCP_TOKEN, "plugin.json must declare MCP_TOKEN");
assert(
  plugin.variables.properties.MCP_URL.default ===
    "https://project-harness.aris-41b.workers.dev/mcp",
  "MCP_URL must default to the deployed Worker",
);
assert(
  Array.isArray(plugin.variables.required) &&
    plugin.variables.required.includes("MCP_TOKEN"),
  "MCP_TOKEN must be required",
);

assert(marketplace.name === "project-harness", "marketplace name mismatch");
assert(marketplace.metadata?.pluginRoot === "plugins", "marketplace pluginRoot mismatch");
const entry = marketplace.plugins?.find((candidate) => candidate.name === plugin.name);
assert(entry?.source === "project-harness", "marketplace source mismatch");
assert(entry?.version === plugin.version, "marketplace and plugin versions must match");
await access(join(pluginRoot, plugin.logo));

const server = mcp.mcpServers?.["project-harness"];
assert(server?.url === "${MCP_URL}", "mcp.json url must be ${MCP_URL}");
assert(
  server?.headers?.Authorization === "Bearer ${MCP_TOKEN}",
  "mcp.json must send Bearer ${MCP_TOKEN}",
);
assert(mcp.$schema === undefined, "Cursor MCP config must not claim Agent Plugin schema");
assert(server?.type === undefined, "Cursor MCP transport must be inferred from url");

console.log("plugin manifests ok");
