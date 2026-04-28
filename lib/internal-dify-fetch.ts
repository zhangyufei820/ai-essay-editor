import { Agent } from "undici"

const INTERNAL_HOSTS = new Set([
  "docker-api-1",
  "dify-image-gateway",
  "localhost",
  "127.0.0.1",
])

const PRIVATE_HOST_PATTERN =
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/

const internalDifyAgent = new Agent({
  connections: Number(process.env.DIFY_AGENT_MAX_CONNECTIONS || 200),
  pipelining: 1,
  keepAliveTimeout: Number(process.env.DIFY_AGENT_KEEPALIVE_MS || 15_000),
  keepAliveMaxTimeout: Number(process.env.DIFY_AGENT_KEEPALIVE_MAX_MS || 60_000),
})

function shouldUseInternalAgent(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "http:") return false

    const host = url.hostname.toLowerCase()
    return INTERNAL_HOSTS.has(host) || PRIVATE_HOST_PATTERN.test(host)
  } catch {
    return false
  }
}

type RequestInitWithDispatcher = RequestInit & { dispatcher?: Agent }

export async function internalDifyFetch(url: string, init: RequestInit = {}) {
  if (!shouldUseInternalAgent(url)) {
    return fetch(url, init)
  }

  const requestInit: RequestInitWithDispatcher = {
    ...init,
    dispatcher: internalDifyAgent,
  }

  return fetch(url, requestInit as RequestInit)
}
