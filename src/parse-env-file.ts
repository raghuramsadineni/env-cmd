import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveEnvFilePath, IMPORT_HOOK_EXTENSIONS, isPromise } from './utils.js'
import type { Environment } from './types.ts'

/**
 * Gets the environment vars from an env file
 */
export async function getEnvFileVars(envFilePath: string): Promise<Environment> {
  const absolutePath = resolveEnvFilePath(envFilePath)
  if (!existsSync(absolutePath)) {
    const pathError = new Error(`Invalid env file path (${envFilePath}).`)
    pathError.name = 'PathError'
    throw pathError
  }

  // Get the file extension
  const ext = extname(absolutePath).toLowerCase()
  let env: Environment = {}
  if (IMPORT_HOOK_EXTENSIONS.includes(ext)) {
    // For some reason in ES Modules, only JSON file types need to be specifically delinated when importing them
    let attributeTypes = {}
    if (ext === '.json') {
      attributeTypes = { with: { type: 'json' } }
    }
    const res = await import(pathToFileURL(absolutePath).href, attributeTypes) as Environment | { default: Environment }
    if ('default' in res) {
      env = res.default as Environment
    } else {
      env = res
    }
    // Check to see if the imported value is a promise
    if (isPromise(env)) {
      env = await env
    }
  }
  else {
    const file = readFileSync(absolutePath, { encoding: 'utf8' })
    env = parseEnvString(file)
  }
  return env
}

/**
 * Parse out all env vars from a given env file string and return an object
 */
export function parseEnvString(envFileString: string): Environment {
  // First thing we do is stripe out all comments
  envFileString = stripComments(envFileString.toString())

  // Next we stripe out all the empty lines
  envFileString = stripEmptyLines(envFileString)

  // Merge the file env vars with the current process env vars (the file vars overwrite process vars)
  return parseEnvVars(envFileString)
}

/**
 * Parse out all env vars from an env file string
 */
export function parseEnvVars(envString: string): Environment {
  const envParseRegex = /^((.+?)[=](.*))$/gim
  const matches: Environment = {}
  let match
  while ((match = envParseRegex.exec(envString)) !== null) {
    // Note: match[1] is the full env=var line
    const key = match[2].trim()
    let value: string | number | boolean = match[3].trim()

    // remove any surrounding quotes
    value = value
      .replace(/(^['"]|['"]$)/g, '')
      .replace(/\\n/g, '\n')

    // Convert string to JS type if appropriate
    if (value !== '' && !isNaN(+value)) {
      matches[key] = +value
    }
    else if (value === 'true') {
      matches[key] = true
    }
    else if (value === 'false') {
      matches[key] = false
    }
    else {
      matches[key] = value
    }
  }
  return JSON.parse(JSON.stringify(matches)) as Environment
}

/**
 * Strips out comments from env file string
 */
export function stripComments(envString: string): string {
  const commentsRegex = /(^#.*$)/gim
  let match = commentsRegex.exec(envString)
  let newString = envString
  while (match != null) {
    newString = newString.replace(match[1], '')
    match = commentsRegex.exec(envString)
  }
  return newString
}

/**
 * Strips out newlines from env file string
 */
export function stripEmptyLines(envString: string): string {
  const emptyLinesRegex = /(^\n)/gim
  return envString.replace(emptyLinesRegex, '')
}
