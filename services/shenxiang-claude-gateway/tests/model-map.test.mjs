import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { resolveModel } from "../src/anthropic-openai.mjs"
import { loadConfig } from "../src/config.mjs"

const modelMapFile = fileURLToPath(new URL("../config/model-map.json", import.meta.url))

test("routes entitled Claude model names without falling back to a mapped GPT model", () => {
  const previousModelMapFile = process.env.MODEL_MAP_FILE
  process.env.MODEL_MAP_FILE = modelMapFile

  try {
    const config = loadConfig()
    const entitledModels = [
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-sonnet-5",
    ]

    for (const model of entitledModels) {
      const route = resolveModel(config, model)
      assert.equal(route.id, model)
      assert.equal(route.routeType, "native-claude")
      assert.equal(route.targetModel, model)
    }
  } finally {
    if (previousModelMapFile === undefined) delete process.env.MODEL_MAP_FILE
    else process.env.MODEL_MAP_FILE = previousModelMapFile
  }
})
