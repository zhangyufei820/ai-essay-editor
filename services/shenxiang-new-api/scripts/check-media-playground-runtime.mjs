#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3120'
const DEFAULT_TIMEOUT_MS = 15000

const requiredBundleMarkers = [
  'banana-2',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'generationConfig',
  'responseModalities',
  'imageConfig',
  'responseFormat',
  '/pg/images/tasks/generations',
  '/pg/images/tasks/edits',
  'imageTaskTerminal',
  'seedance-2.0-dj-fast',
  'seedance-2.0-cl-mini',
  'seedance-nsfw',
  'public_reference',
  'reverse_prompt_upstream_url',
  'upstream_url',
]

const expectedChannels = [
  {
    label: 'Banana 2 MoonApiX channel',
    model: 'banana-2',
    upstream: 'gemini-3.1-flash-image-preview',
  },
  {
    label: 'Gemini 3 Pro Image MoonApiX channel',
    model: 'gemini-3-pro-image-preview',
    upstream: 'gemini-3-pro-image-preview',
  },
]

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    mysqlContainer: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    skipDb: false,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base-url' && argv[index + 1]) {
      options.baseUrl = argv[index + 1]
      index += 1
    } else if (arg === '--mysql-container' && argv[index + 1]) {
      options.mysqlContainer = argv[index + 1]
      index += 1
    } else if (arg === '--timeout-ms' && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1])
      index += 1
    } else if (arg === '--skip-db') {
      options.skipDb = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      fail([`unknown argument: ${arg}`])
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, '')
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    fail(['--timeout-ms must be a positive number'])
  }
  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-media-playground-runtime.mjs [--base-url URL] [--mysql-container NAME]

Checks the deployed New API media playground runtime:
  - /api/status reports the classic theme
  - /console/media-playground serves a business index bundle
  - the served bundle still contains Gemini/Banana image markers and task endpoints
  - optional MySQL channel config still maps MoonApiX Gemini image models correctly`)
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  return response.text()
}

async function checkStatus(baseUrl, timeoutMs) {
  const text = await fetchText(`${baseUrl}/api/status`, timeoutMs)
  if (!text.includes('"theme":"classic"')) {
    return ['api status does not report theme classic']
  }
  return []
}

async function checkBundle(baseUrl, timeoutMs) {
  const page = await fetchText(`${baseUrl}/console/media-playground`, timeoutMs)
  const scripts = [...new Set([...page.matchAll(/static\/js\/[^"'<>\s]+\.js/g)].map((match) => match[0]))]
  const indexScripts = scripts.filter((script) => /static\/js\/index\.[^/]+\.js$/.test(script))
  const errors = []

  if (scripts.length === 0) {
    return ['media playground page did not reference any static JS bundle']
  }
  if (indexScripts.length === 0) {
    errors.push('media playground page did not reference static/js/index.*.js')
  }

  const bundleParts = []
  for (const script of scripts) {
    bundleParts.push(await fetchText(`${baseUrl}/${script}`, timeoutMs))
  }
  const bundle = bundleParts.join('\n')

  for (const marker of requiredBundleMarkers) {
    if (!bundle.includes(marker)) {
      errors.push(`served bundle missing marker: ${marker}`)
    }
  }

  return errors
}

function runMysqlQuery(container, sql) {
  const mysqlCommand =
    'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" --batch --raw --skip-column-names'
  const result = spawnSync('docker', ['exec', '-i', container, 'sh', '-lc', mysqlCommand], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })

  if (result.status !== 0) {
    const stderr = result.stderr.trim()
    throw new Error(stderr || `docker exec mysql exited with ${result.status}`)
  }
  return result.stdout
}

function parseRows(output) {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, status, baseUrl, models, modelMapping] = line.split('\t')
      let mapping = {}
      try {
        mapping = JSON.parse(modelMapping || '{}')
      } catch {
        mapping = {}
      }
      return {
        id,
        status,
        baseUrl: baseUrl || '',
        models: models || '',
        mapping,
      }
    })
}

function checkChannelRows(rows) {
  const errors = []
  for (const expected of expectedChannels) {
    const matchingRows = rows.filter((row) => row.models.split(',').map((item) => item.trim()).includes(expected.model))
    if (matchingRows.length === 0) {
      errors.push(`${expected.label}: missing channel model ${expected.model}`)
      continue
    }

    const healthy = matchingRows.some((row) => {
      const upstream = row.mapping[expected.model] || expected.model
      return (
        row.status === '1' &&
        /moonapix\.com/i.test(row.baseUrl) &&
        upstream === expected.upstream
      )
    })

    if (!healthy) {
      errors.push(
        `${expected.label}: no enabled moonapix.com channel maps ${expected.model} to ${expected.upstream}`,
      )
    }
  }
  return errors
}

function checkDatabase(container) {
  const modelPatterns = expectedChannels
    .map((expected) => `models LIKE '%${expected.model}%' OR model_mapping LIKE '%${expected.model}%'`)
    .join(' OR ')
  const sql = `
SELECT id, status, base_url, models, model_mapping
FROM channels
WHERE ${modelPatterns}
ORDER BY id;
`
  const output = runMysqlQuery(container, sql)
  return checkChannelRows(parseRows(output))
}

async function main() {
  const options = parseArgs(process.argv)
  const errors = []

  try {
    errors.push(...(await checkStatus(options.baseUrl, options.timeoutMs)))
    errors.push(...(await checkBundle(options.baseUrl, options.timeoutMs)))
    if (!options.skipDb && options.mysqlContainer) {
      errors.push(...checkDatabase(options.mysqlContainer))
    }
  } catch (error) {
    errors.push(error.message)
  }

  if (errors.length) return fail(errors)
  console.log('media playground runtime check passed')
}

function fail(errors) {
  console.error('media playground runtime check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

main()
