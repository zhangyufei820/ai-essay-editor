const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { callTool, generateImage, readConfig, safeApiError, saveConfig, toolDefinitions, workspaceFile } = require("../src/main");

test("exposes only the generation and edit tools", () => {
  assert.deepEqual(toolDefinitions().map((tool) => tool.name), ["xingren_generate_image", "xingren_edit_image"]);
});

test("uses the image endpoint without placing the key in the request body", async () => {
  let captured;
  const result = await generateImage({ prompt: "一只小猫", size: "1024x1024" }, {
    readConfig: async () => ({ apiKey: "sk-secret" }),
    imageRequest: async (endpoint, apiKey, body) => {
      captured = { endpoint, apiKey, body: JSON.parse(body) };
      return { data: [{ url: "https://cdn.example.com/image.png" }] };
    },
    formatResult: async (payload) => payload.data[0].url,
  });

  assert.equal(result, "https://cdn.example.com/image.png");
  assert.equal(captured.endpoint, "/images/generations");
  assert.equal(captured.apiKey, "sk-secret");
  assert.deepEqual(captured.body, { model: "gpt-image-2-4K", prompt: "一只小猫", size: "1024x1024", n: 1 });
  assert.equal(JSON.stringify(captured.body).includes("sk-secret"), false);
});

test("rejects image files outside the workspace", () => {
  assert.throws(() => workspaceFile("../secret.png", "/tmp/project"), /当前项目文件夹/);
});

test("stores the key in a user-only configuration file", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "xingren-image-mcp-"));
  await saveConfig("sk-test", home);
  assert.deepEqual(await readConfig(home), { apiKey: "sk-test" });
  const mode = (await fs.stat(path.join(home, ".xingren-image-mcp", "config.json"))).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("returns a normal MCP tool response", async () => {
  const response = await callTool("xingren_generate_image", { prompt: "海边日落" }, {
    readConfig: async () => ({ apiKey: "sk-test" }),
    imageRequest: async () => ({ data: [{ url: "https://cdn.example.com/image.png" }] }),
    formatResult: async () => "图片已生成：https://cdn.example.com/image.png",
  });
  assert.deepEqual(response, { content: [{ type: "text", text: "图片已生成：https://cdn.example.com/image.png" }] });
});

test("never includes an upstream error message in a user-visible error", () => {
  const secretEndpoint = "https://private.example.invalid/path";
  assert.equal(safeApiError(500, { error: { message: secretEndpoint } }), "图片服务暂时不可用，请稍后重试。");
  assert.equal(safeApiError(400, { error: { message: secretEndpoint } }), "图片请求暂时无法完成。请检查图片描述或稍后重试。");
});
