/**
 * LaTeX 常量 - 共享的 KaTeX 宏定义
 * 避免在多个组件中重复定义
 */

export const LATEX_MACROS: Record<string, string> = {
  "\\vec": "\\mathbf{#1}",
  "\\vb": "\\mathbf{#1}",
  "\\bm": "\\mathbf{#1}",
  "\\abs": "\\left|#1\\right|",
  "\\norm": "\\left\\|#1\\right\\|",
  "\\set": "\\left\\{#1\\right\\}",
  "\\령": "\\langle #1 \\rangle",
  "\\sse": "\\subseteq",
  "\\nse": "\\nsubseteq",
  "\\R": "\\mathbb{R}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
  "\\lam": "\\lambda",
  "\\Lam": "\\Lambda",
  "\\角": "\\angle",
  "\\三角形": "\\triangle",
  "\\垂直": "\\perp",
  "\\平行": "\\parallel",
  "\\相似": "\\sim",
  "\\全等": "\\cong",
}

import { renderLatexWithCorrection } from "./latex-utils"

/**
 * 渲染 LaTeX 为 HTML 字符串（已集成自动纠错）
 */
export function renderLatex(text: string, displayMode: boolean): string {
  try {
    return renderLatexWithCorrection(text, displayMode, LATEX_MACROS)
  } catch (e) {
    console.error("KaTeX render error:", e)
    return text
  }
}
