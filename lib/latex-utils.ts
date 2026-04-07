/**
 * LaTeX 自动纠错工具
 *
 * 处理 AI 生成的 LaTeX 源码中的常见错误：
 * 1. 自动补全缺失的括号（如 \sqrt{x → \sqrt{x}）
 * 2. 移除非法字符
 * 3. 修复不匹配的分组
 */

import katex from "katex"

// ============================================
// 错误类型
// ============================================

export interface LaTeXError {
  type: "unmatched_brace" | "illegal_char" | "incomplete_command" | "render_failed"
  original: string
  corrected: string
  message?: string
}

// ============================================
// 预编译的正则表达式（避免每次调用时重新编译）
// ============================================

const ILLEGAL_CHAR_PATTERNS = [
  /[\u2018\u2019]/g,
  /[\u201C\u201D]/g,
  /【/g,
  /】/g,
  /〔/g,
  /〕/g,
  /\u3000/g,
  /\\x[0-9A-Fa-f]{2}/g,
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
  /€/g,
  /£/g,
  /¥/g,
  /，{2,}/g,
  /。{2,}/g,
  /[\u200B-\u200F\uFEFF]/g,
]

const SAFE_LATEX_PATTERN = /[^a-zA-Z0-9\\{}[\]()|=<>./,+*:;-]/g

// ============================================
// 工具函数
// ============================================

const countBraces = (str: string, brace: "{") =>
  str.split(brace).length - 1

const countLBraces = (str: string) => countBraces(str, "{")
const countRBraces = (str: string) => countBraces(str, "}")

/**
 * 检查并补全缺失的右大括号
 * 策略：从右向左扫描，追踪嵌套层级，补充缺失的 }
 */
function autoCloseBraces(latex: string): string {
  const openBraces = countLBraces(latex)
  const closeBraces = countRBraces(latex)

  if (openBraces === closeBraces) {
    return latex // 已经匹配
  }

  if (openBraces > closeBraces) {
    // 需要补充右括号
    let result = latex
    let deficit = openBraces - closeBraces
    let openCount = 0

    // 从右向左扫描，找到需要补充的位置
    for (let i = result.length - 1; i >= 0 && deficit > 0; i--) {
      const char = result[i]
      if (char === "{") {
        openCount -= 1
      } else if (char === "}") {
        openCount += 1
      }

      // 在第一个 { 之后的位置补充 }（通常是命令参数的末尾）
      if (openCount < 0) {
        // 找到一个未配对的 {，在它后面补充一个 }
        result = result.slice(0, i + 1) + "}" + result.slice(i + 1)
        openCount = 0
        deficit -= 1
      }
    }

    // 如果还有剩余，追加到末尾
    while (deficit > 0) {
      result += "}"
      deficit -= 1
    }

    return result
  }

  // openBraces < closeBraces - 有多余的 }，尝试移除
  // 这种情况下比较危险，简单处理：移除末尾多余的 }
  let result = latex
  let excess = closeBraces - openBraces

  while (excess > 0 && result.endsWith("}")) {
    result = result.slice(0, -1)
    excess -= 1
  }

  return result
}

/**
 * 移除 LaTeX 中非法的字符
 */
function removeIllegalChars(latex: string): string {
  let result = latex
  for (const pattern of ILLEGAL_CHAR_PATTERNS) {
    result = result.replace(pattern, "")
  }
  return result
}

/**
 * 修复不完整的命令
 * 例如：\sqrt{ 后面没有内容时，移除空的 {}
 */
function fixIncompleteCommands(latex: string): string {
  // 移除空的必选参数 \command{}
  let result = latex.replace(/\\sqrt\s*\{\s*\}/g, "\\sqrt{}")
  result = result.replace(/\\frac\s*\{\s*\}\s*\{/g, "\\frac{}{")
  result = result.replace(/\\frac\s*\{[^}]*\}\s*\{\s*\}/g, "\\frac{...}{}")

  // 修复常见的 AI 乱码
  result = result.replace(/\\text\{[^}]*$/g, (match) => {
    // 截断不完整的 \text{...
    return match.slice(0, 50) + "}"
  })

  return result
}

/**
 * 修复多出来的独立 } 或 {
 */
function fixOrphanBraces(latex: string): string {
  let result = latex

  // 移除行首多余的 }
  result = result.replace(/^\s*\}+/g, "")

  // 移除行尾多余的 {
  result = result.replace(/\{\s*$/g, "")

  // 移除孤立的 } 后面紧跟的 {
  result = result.replace(/\}\s*\{/g, "}{")

  // 清理连续空白
  result = result.replace(/\s+/g, " ").trim()

  return result
}

/**
 * 处理特殊命令的边界情况
 */
function fixSpecialCommands(latex: string): string {
  let result = latex

  // \frac 需要两个参数
  const fracMatch = result.match(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/)
  if (!fracMatch) {
    // 尝试修复不完整的 frac
    const fracCount = (result.match(/\\frac/g) || []).length
    const bracePairs = (result.match(/\{[^}]*\}/g) || []).length

    if (fracCount > 0 && bracePairs < fracCount * 2) {
      // frac 数量多于完整的大括号对，尝试补全
      // \frac{a}{b} 需要两个 {..}
      const openFrac = result.match(/\\frac\s*\{/g)
      const closeFrac = result.match(/\}/g)

      if (openFrac && closeFrac) {
        const openCount = openFrac.length
        const closeCount = closeFrac.length

        if (openCount > closeCount) {
          // 需要补充 }
          result = result.replace(/(\\frac\s*\{[^}]*)$/g, "$1}")
        }
      }
    }
  }

  return result
}

// ============================================
// 主纠错函数
// ============================================

export interface LaTeXCorrectionResult {
  original: string
  corrected: string
  errors: LaTeXError[]
  isValid: boolean
}

/**
 * 对 LaTeX 源码进行自动纠错
 *
 * @param latex 原始 LaTeX 字符串
 * @returns 纠错结果
 */
export function correctLatex(latex: string): LaTeXCorrectionResult {
  // 快速检查：如果括号已经匹配且无非法字符，跳过纠错
  const openCount = countLBraces(latex)
  const closeCount = countRBraces(latex)
  if (openCount === closeCount && ILLEGAL_CHAR_PATTERNS.every(p => !p.test(latex))) {
    return { original: latex, corrected: latex, errors: [], isValid: true }
  }

  const errors: LaTeXError[] = []
  let corrected = latex

  // 1. 移除非法字符
  const beforeIllegal = corrected
  corrected = removeIllegalChars(corrected)
  if (corrected !== beforeIllegal) {
    errors.push({
      type: "illegal_char",
      original: beforeIllegal,
      corrected,
      message: "移除了非法字符",
    })
  }

  // 2. 修复孤儿大括号
  const beforeOrphan = corrected
  corrected = fixOrphanBraces(corrected)
  if (corrected !== beforeOrphan) {
    errors.push({
      type: "unmatched_brace",
      original: beforeOrphan,
      corrected,
      message: "修复了孤儿大括号",
    })
  }

  // 3. 修复不完整的命令
  const beforeIncomplete = corrected
  corrected = fixIncompleteCommands(corrected)
  if (corrected !== beforeIncomplete) {
    errors.push({
      type: "incomplete_command",
      original: beforeIncomplete,
      corrected,
      message: "修复了不完整的命令",
    })
  }

  // 4. 修复特殊命令
  const beforeSpecial = corrected
  corrected = fixSpecialCommands(corrected)
  if (corrected !== beforeSpecial) {
    errors.push({
      type: "incomplete_command",
      original: beforeSpecial,
      corrected,
      message: "修复了特殊命令",
    })
  }

  // 5. 自动补全缺失的大括号
  const beforeBraces = corrected
  corrected = autoCloseBraces(corrected)
  if (corrected !== beforeBraces) {
    errors.push({
      type: "unmatched_brace",
      original: beforeBraces,
      corrected,
      message: "自动补全了缺失的大括号",
    })
  }

  return {
    original: latex,
    corrected,
    errors,
    isValid: errors.length === 0,
  }
}

// ============================================
// 渲染函数（含纠错）
// ============================================

// KaTeX 默认宏（可扩展）
const DEFAULT_MACROS: Record<string, string> = {}

/**
 * 带纠错的 KaTeX 渲染
 *
 * @param latex 原始 LaTeX 字符串
 * @param displayMode 是否为块级公式
 * @param macros 自定义宏（可选）
 * @returns 渲染后的 HTML 字符串
 */
export function renderLatexWithCorrection(
  latex: string,
  displayMode: boolean,
  macros?: Record<string, string>
): string {
  const activeMacros = macros || DEFAULT_MACROS

  try {
    // 先进行纠错
    const result = correctLatex(latex)

    // 如果有纠错且开启了调试模式，打印纠错信息
    if (result.errors.length > 0 && process.env.NODE_ENV === "development") {
      console.debug("[LaTeX] 纠错:", {
        original: result.original.slice(0, 30) + (result.original.length > 30 ? "..." : ""),
        corrections: result.errors.map((e) => e.message),
      })
    }

    // 尝试渲染纠错后的内容
    try {
      return katex.renderToString(result.corrected, {
        displayMode,
        throwOnError: false,
        errorColor: "#B71C1C",
        macros: activeMacros,
      })
    } catch {
      // 如果纠错后仍然失败，尝试更保守的修复 - 只保留基本字符
      const safeLatex = result.corrected.replace(SAFE_LATEX_PATTERN, "")

      return katex.renderToString(safeLatex || "\\text{Error}", {
        displayMode,
        throwOnError: false,
        errorColor: "#B71C1C",
        macros: activeMacros,
      })
    }
  } catch (e) {
    console.error("[LaTeX] 渲染失败:", e)
    return `<span class="latex-error" style="color:#B71C1C;font-size:0.9em">${latex.slice(0, 50)}${latex.length > 50 ? "..." : ""}</span>`
  }
}

/**
 * 安全渲染 LaTeX，返回 React 可用的 JSX 或字符串
 * 如果渲染失败，返回包含原始公式的文本显示
 */
export function safeRenderLatex(
  latex: string,
  displayMode: boolean
): { html: string; hadError: boolean } {
  try {
    const html = renderLatexWithCorrection(latex, displayMode)
    return { html, hadError: false }
  } catch {
    return {
      html: `<span class="latex-error">${latex}</span>`,
      hadError: true,
    }
  }
}
