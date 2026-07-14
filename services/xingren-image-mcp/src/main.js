const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const API_BASE_URL = "https://api.aiphui.top/v1";
const DEFAULT_MODEL = "gpt-image-2-4K";
const PACKAGE_NAME = "xingren-codex-image-mcp";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function configPath(homeDirectory = process.env.HOME || process.env.USERPROFILE) {
  return path.join(homeDirectory, ".xingren-image-mcp", "config.json");
}

async function readConfig(homeDirectory) {
  if (process.env.XINGREN_IMAGE_KEY) {
    return { apiKey: process.env.XINGREN_IMAGE_KEY };
  }

  try {
    const source = await fs.readFile(configPath(homeDirectory), "utf8");
    const config = JSON.parse(source);
    if (typeof config.apiKey === "string" && config.apiKey.trim()) {
      return { apiKey: config.apiKey.trim() };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error("无法读取本机图像令牌配置，请重新运行安装命令。");
    }
  }

  throw new Error("还没有配置星人图像生成令牌。请运行：npx -y xingren-codex-image-mcp install");
}

async function saveConfig(apiKey, homeDirectory) {
  const target = configPath(homeDirectory);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, `${JSON.stringify({ apiKey }, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(target, 0o600);
}

async function promptForApiKey() {
  if (!stdin.isTTY) {
    throw new Error("请在本机终端中运行安装命令，再粘贴图像生成令牌。");
  }

  const prompt = "请粘贴“星人图像生成令牌”，然后按回车：";
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      const character = chunk.toString("utf8");
      if (character === "\r" || character === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value.trim());
      } else if (character === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        reject(new Error("已取消安装。"));
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function setup(homeDirectory) {
  const apiKey = await promptForApiKey();
  if (!apiKey.startsWith("sk-")) {
    throw new Error("令牌格式不正确：请从“第三方接入”复制完整的星人图像生成令牌（以 sk- 开头）。");
  }
  await saveConfig(apiKey, homeDirectory);
  console.log("图像令牌已安全保存到本机。它不会发送给 Codex 对话，也不会写入项目文件。");
}

async function install() {
  await setup();
  const existing = spawnSync("codex", ["mcp", "remove", "xingren-image"], { encoding: "utf8" });
  if (existing.error) {
    throw new Error("令牌已保存，但没有找到 Codex 命令。请先安装 Codex CLI，或在 Codex 桌面端“设置 → MCP servers”中添加：npx -y xingren-codex-image-mcp");
  }
  const result = spawnSync("codex", ["mcp", "add", "xingren-image", "--", "npx", "-y", PACKAGE_NAME], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`令牌已保存，但 Codex 未能添加图像工具：${result.stderr.trim() || "请在 Codex 中打开 设置 → MCP servers 后重试。"}`);
  }

  console.log("安装完成。请完全退出并重新打开 Codex，然后输入：帮我生成一张课程封面图。");
}

function toolDefinitions() {
  return [
    {
      name: "xingren_generate_image",
      description: "使用用户自己的星人图像生成令牌创建图片。用户明确要求生成图片、海报、插画、封面或配图时调用。会消耗用户的图像额度。",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "图片描述，包含主体、风格、构图和文字限制。" },
          size: { type: "string", enum: ["960x960", "1024x1024", "1536x1024", "1024x1536"], description: "图片尺寸，默认 960x960。" },
          model: { type: "string", enum: ["gpt-image-2-4K", "grok-imagine-image"], description: "模型，默认 gpt-image-2-4K。" },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    {
      name: "xingren_edit_image",
      description: "使用用户自己的星人图像生成令牌编辑当前项目中的 PNG 图片。可选 mask 的透明区域会被重新绘制。会消耗用户的图像额度。",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "要修改的内容，以及必须保持不变的内容。" },
          image_path: { type: "string", description: "当前项目中的 PNG 原图路径。" },
          mask_path: { type: "string", description: "可选：当前项目中的 PNG mask 路径。" },
          size: { type: "string", enum: ["960x960", "1024x1024", "1536x1024", "1024x1536"], description: "图片尺寸，默认 960x960。" },
          model: { type: "string", enum: ["gpt-image-2-4K", "grok-imagine-image"], description: "模型，默认 gpt-image-2-4K。" },
        },
        required: ["prompt", "image_path"],
        additionalProperties: false,
      },
    },
  ];
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空。`);
  }
  return value.trim();
}

function permittedModel(model) {
  return model === "grok-imagine-image" ? model : DEFAULT_MODEL;
}

function permittedSize(size) {
  return ["960x960", "1024x1024", "1536x1024", "1024x1536"].includes(size) ? size : "960x960";
}

function workspaceFile(filePath, workingDirectory) {
  const resolved = path.resolve(workingDirectory, requireString(filePath, "图片路径"));
  const root = `${path.resolve(workingDirectory)}${path.sep}`;
  if (!resolved.startsWith(root)) {
    throw new Error("图片必须位于当前项目文件夹内。请先把图片放进项目后再试。");
  }
  if (path.extname(resolved).toLowerCase() !== ".png") {
    throw new Error("目前只支持 PNG 图片。请先将图片另存为 PNG 后再试。");
  }
  return resolved;
}

async function fileBlob(filePath, workingDirectory) {
  const resolved = workspaceFile(filePath, workingDirectory);
  const content = await fs.readFile(resolved);
  if (content.length > MAX_IMAGE_BYTES) {
    throw new Error("图片超过 4MB。请压缩后再试。");
  }
  return { blob: new Blob([content], { type: "image/png" }), filename: path.basename(resolved) };
}

function safeApiError(status, responseBody) {
  if (status === 401) return "图像令牌无效。请重新运行安装命令并粘贴正确的图像生成令牌。";
  if (status === 403) return "此图像令牌没有该模型权限，或图像额度不足。请到星人 API 控制台检查。";
  if (status === 429) return "请求过于频繁，请稍等一分钟后再试。";
  if (status >= 500) return "图片服务暂时不可用，请稍后重试。";
  return "图片请求暂时无法完成。请检查图片描述或稍后重试。";
}

async function imageRequest(endpoint, apiKey, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(safeApiError(response.status, payload));
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("图片生成等待超过 2 分钟，请稍后重试。");
    if (typeof error.message === "string" && error.message.startsWith("图片")) throw error;
    throw new Error("图片服务暂时不可用，请稍后重试。");
  } finally {
    clearTimeout(timeout);
  }
}

async function saveImageBuffer(buffer, workingDirectory) {
  if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) {
    throw new Error("图片结果无效，请稍后重试。");
  }
  const outputDirectory = path.join(workingDirectory, "generated-images");
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `xingren-image-${Date.now()}.png`);
  await fs.writeFile(outputPath, buffer);
  return `图片已生成并保存到：${outputPath}`;
}

async function downloadGeneratedImage(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("图片结果无效，请稍后重试。");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("图片结果无效，请稍后重试。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(parsedUrl, { signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (!response.ok || !contentType.startsWith("image/") || contentLength > 20 * 1024 * 1024) {
      throw new Error("图片结果无效，请稍后重试。");
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error.name === "AbortError") throw new Error("图片结果下载超时，请稍后重试。");
    if (error.message === "图片结果无效，请稍后重试。") throw error;
    throw new Error("图片结果下载失败，请稍后重试。");
  } finally {
    clearTimeout(timeout);
  }
}

async function formatResult(payload, workingDirectory) {
  const image = payload?.data?.[0];
  if (typeof image?.url === "string") {
    return saveImageBuffer(await downloadGeneratedImage(image.url), workingDirectory);
  }
  if (typeof image?.b64_json === "string") {
    return saveImageBuffer(Buffer.from(image.b64_json, "base64"), workingDirectory);
  }
  throw new Error("图像服务没有返回可用图片，请稍后重试。");
}

async function generateImage(args, dependencies = {}) {
  const workingDirectory = dependencies.workingDirectory || process.cwd();
  const { apiKey } = await (dependencies.readConfig || readConfig)();
  const prompt = requireString(args.prompt, "图片描述");
  const payload = await (dependencies.imageRequest || imageRequest)("/images/generations", apiKey, JSON.stringify({
    model: permittedModel(args.model), prompt, size: permittedSize(args.size), n: 1,
  }));
  return (dependencies.formatResult || formatResult)(payload, workingDirectory);
}

async function editImage(args, dependencies = {}) {
  const workingDirectory = dependencies.workingDirectory || process.cwd();
  const { apiKey } = await (dependencies.readConfig || readConfig)();
  const image = await (dependencies.fileBlob || fileBlob)(args.image_path, workingDirectory);
  const form = new FormData();
  form.set("model", permittedModel(args.model));
  form.set("prompt", requireString(args.prompt, "修改说明"));
  form.set("size", permittedSize(args.size));
  form.set("image", image.blob, image.filename);
  if (args.mask_path) {
    const mask = await (dependencies.fileBlob || fileBlob)(args.mask_path, workingDirectory);
    form.set("mask", mask.blob, mask.filename);
  }
  const payload = await (dependencies.imageRequest || imageRequest)("/images/edits", apiKey, form);
  return (dependencies.formatResult || formatResult)(payload, workingDirectory);
}

async function callTool(name, args, dependencies) {
  const handler = name === "xingren_generate_image" ? generateImage : name === "xingren_edit_image" ? editImage : null;
  if (!handler) throw new Error("未找到该图像工具。");
  const result = await handler(args || {}, dependencies);
  return { content: [{ type: "text", text: result }] };
}

function send(response) {
  stdout.write(`${JSON.stringify(response)}\n`);
}

function runServer() {
  const input = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  input.on("line", async (line) => {
    let request;
    try {
      request = JSON.parse(line);
      if (request.method === "notifications/initialized") return;
      if (request.method === "initialize") {
        send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: request.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "xingren-image", version: "0.1.0" }, instructions: "Use Xingren image tools only when the user asks to generate or edit an image. Each call consumes the user's Xingren image credits. Never ask for or reveal the image token." } });
      } else if (request.method === "tools/list") {
        send({ jsonrpc: "2.0", id: request.id, result: { tools: toolDefinitions() } });
      } else if (request.method === "tools/call") {
        const result = await callTool(request.params?.name, request.params?.arguments);
        send({ jsonrpc: "2.0", id: request.id, result });
      } else if (request.id !== undefined) {
        send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
      }
    } catch (error) {
      if (request?.id !== undefined) {
        send({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: error.message } });
      }
    }
  });
}

module.exports = { callTool, configPath, downloadGeneratedImage, editImage, formatResult, generateImage, imageRequest, install, readConfig, runServer, safeApiError, saveConfig, saveImageBuffer, setup, toolDefinitions, workspaceFile };
