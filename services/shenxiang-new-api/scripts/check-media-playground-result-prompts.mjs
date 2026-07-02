#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root')
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }
  return 'services/shenxiang-new-api/src-patch'
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function missingMarkerErrors(label, text, markers) {
  return markers
    .filter((marker) => !text.includes(marker))
    .map((marker) => `${label}: missing ${marker}`)
}

function main() {
  const sourceRoot = path.resolve(sourceRootFromArgs())
  const root = fs.existsSync(path.join(sourceRoot, 'web'))
    ? path.join(sourceRoot, 'web')
    : sourceRoot
  const classicPath = path.join(root, 'classic/src/pages/MediaPlayground/index.jsx')

  if (!fs.existsSync(classicPath)) {
    return fail([`missing required file: ${classicPath}`])
  }

  const classic = readText(classicPath)
  const errors = []

  errors.push(
    ...missingMarkerErrors('prompt fallback helper', classic, [
      'function firstPromptText(...values)',
      'const text = String(value || \'\').trim()',
    ]),
  )

  errors.push(
    ...missingMarkerErrors('image result mapping', classic, [
      "function extractImageResults(response, fallbackPrompt = '')",
      'const originalPrompt = firstPromptText(item.prompt, fallbackPrompt)',
      'displayPrompt: firstPromptText(revisedPrompt, originalPrompt)',
    ]),
  )

  errors.push(
    ...missingMarkerErrors('image task result mapping', classic, [
      "function imageTaskToResult(task, fallbackPrompt = '')",
      'item.prompt',
      'task.prompt',
      'task.data?.prompt',
      'fallbackPrompt',
      'displayPrompt: firstPromptText(revisedPrompt, originalPrompt)',
    ]),
  )

  errors.push(
    ...missingMarkerErrors('submit prompt snapshot', classic, [
      'const submittedPrompt = firstPromptText(requestPayload.prompt, prompt)',
      'pollImageTask(taskId, submittedPrompt)',
      "async function pollImageTask(taskId, submittedPrompt = '')",
      'imageTaskToResult(res.data.data, submittedPrompt)',
    ]),
  )

  errors.push(
    ...missingMarkerErrors('result card prompt rendering', classic, [
      'const displayPrompt = firstPromptText(',
      'result.displayPrompt',
      'result.revisedPrompt',
      'result.prompt',
      'const [promptExpanded, setPromptExpanded] = useState(false)',
      "className={promptExpanded ? 'mp-result-prompt is-expanded' : 'mp-result-prompt'}",
      'Prompt 摘要',
      "{promptExpanded ? '收起' : '展开'}",
    ]),
  )

  if (classic.includes("<p className='mp-revised-prompt'>{result.revisedPrompt}</p>")) {
    errors.push('result card prompt rendering: still renders revisedPrompt directly')
  }

  if (errors.length) return fail(errors)
  console.log('media playground result prompt check passed')
}

function fail(errors) {
  console.error('media playground result prompt check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

main()
