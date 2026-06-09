export type OpenClawRuntimeGuardInput = {
  query?: unknown
  inputs?: unknown
}

export type OpenClawRuntimeGuardResult =
  | { allowed: true }
  | {
      allowed: false
      code: "OPENCLAW_FORBIDDEN_RUNTIME_ACTION"
      message: string
      matched: string
    }

const FORBIDDEN_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+-/i,
  /\brmdir\b/i,
  /\bfind\b[\s\S]{0,80}\b-delete\b/i,
  /\bgit\s+(clean|reset|checkout|push)\b/i,
  /\bdocker(?:\s+compose)?\s+(exec|run|stop|restart|rm|rmi|system|volume|network|cp|pull|push|build|logs|inspect)\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bsudo\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkubectl\b/i,
  /\bhelm\b/i,
]

const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /(^|[/\s])\.env($|[.\s/])/i,
  /(^|[/\s])\.ssh($|[/\s])/i,
  /docker-compose[^/\s]*\.ya?ml/i,
  /(^|[/\s])Dockerfile($|[\s"'}\]])/i,
  /(^|[/\s])nginx($|[/\s])/i,
  /(^|[/\s])openresty($|[/\s])/i,
  /(^|[/\s])1panel($|[/\s])/i,
  /\/opt\/1panel($|[/?#\s])/i,
  /\/etc($|[/?#\s])/i,
  /\/root($|[/?#\s])/i,
  /\/data\/ai-essay-editor($|[/?#\s])/i,
  /\/var\/lib\/docker($|[/?#\s])/i,
]

const FORBIDDEN_INTENT_PATTERNS: RegExp[] = [
  /(删除|移除|清空|重置|覆盖|改写|修改|更改|写入|创建|新增|重启|停止|启动|进入|连接|授权|提权)[\s\S]{0,40}(文件|目录|配置|环境变量|服务器|容器|镜像|网络|卷|1Panel|OpenResty|Nginx|SSH|Docker|\.env)/i,
  /(delete|remove|clear|reset|overwrite|modify|edit|write|create|restart|stop|start|connect|ssh|grant|chmod|chown)[\s\S]{0,40}(file|directory|config|env|server|container|image|network|volume|1panel|openresty|nginx|docker)/i,
]

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function evaluateOpenClawRuntimeRequest(input: OpenClawRuntimeGuardInput): OpenClawRuntimeGuardResult {
  const text = [valueToText(input.query), valueToText(input.inputs)].filter(Boolean).join("\n")
  if (!text.trim()) return { allowed: true }

  for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        code: "OPENCLAW_FORBIDDEN_RUNTIME_ACTION",
        matched: pattern.source,
        message: "高级创作普通用户不能执行 SSH、Docker、删除、重启、权限变更等服务器操作。",
      }
    }
  }

  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        code: "OPENCLAW_FORBIDDEN_RUNTIME_ACTION",
        matched: pattern.source,
        message: "高级创作普通用户不能读取或修改服务器配置、1Panel、OpenResty、.env、生产目录等敏感路径。",
      }
    }
  }

  for (const pattern of FORBIDDEN_INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        code: "OPENCLAW_FORBIDDEN_RUNTIME_ACTION",
        matched: pattern.source,
        message: "高级创作普通用户不能请求删除文件、修改配置、控制容器或获取服务器权限。",
      }
    }
  }

  return { allowed: true }
}
