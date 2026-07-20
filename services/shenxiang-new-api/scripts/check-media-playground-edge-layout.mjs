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

function main() {
  const sourceRoot = path.resolve(sourceRootFromArgs())
  const root = fs.existsSync(path.join(sourceRoot, 'web'))
    ? path.join(sourceRoot, 'web')
    : sourceRoot
  const stylePath = path.join(
    root,
    'classic/src/pages/MediaPlayground/MediaPlayground.css',
  )

  if (!fs.existsSync(stylePath)) {
    return fail([`missing required file: ${stylePath}`])
  }

  const style = fs.readFileSync(stylePath, 'utf8')
  const errors = []
  const contentShell = style.match(
    /body\.mp-route-active \.semi-layout-content\s*\{([^}]*)\}/,
  )

  if (!contentShell || !/padding:\s*0\s*!important/.test(contentShell[1])) {
    errors.push(
      'media route must clear inherited content padding on every edge',
    )
  }
  if (!/scrollbar-gutter:\s*stable/.test(style)) {
    errors.push(
      'desktop media scroll panes must reserve stable scrollbar space',
    )
  }
  if (
    !/@media\s*\(min-width:\s*1181px\)\s*and\s*\(max-height:\s*820px\)[\s\S]*?body\.mp-route-active \.mp-parameter-panel\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/.test(
      style,
    )
  ) {
    errors.push(
      'short desktop viewports must keep the generation controls visible',
    )
  }

  if (errors.length) return fail(errors)
  console.log('media playground Edge layout check passed')
}

function fail(errors) {
  console.error('media playground Edge layout check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

main()
