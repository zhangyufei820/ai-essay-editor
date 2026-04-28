/**
 * LLM 文本清洗工具
 *
 * 处理 AI 大模型输出中常见的过度转义问题：
 * 1. _literal `\n` 显示为字面字符串而非换行 → 转为实际换行
 * 2. _literal `\t` 显示为字面字符串 → 转为实际制表符
 * 3. LaTeX 双转义：`\\times` → `\times`，`\\frac` → `\frac` 等
 * 4. 其他常见转义序列
 */

/**
 * 清洗 LLM 原始输出文本，修复过度转义问题
 *
 * @param rawText 大模型返回的原始文本
 * @returns 清洗后的文本
 */
export function cleanLLMText(rawText: string): string {
  if (!rawText || typeof rawText !== "string") {
    return rawText
  }

  let text = rawText

  // ============================================
  // 1. 修复转义的新行序列
  // LLM 常输出 literal "\\n"（两个字符：反斜杠+n），而非真正的换行符
  // 在 JSON 字符串中这是 "\\n"，显示在 markdown 中不会被解释为换行
  // 需要将其转为真正的换行符或 markdown 换行语法
  // ============================================

  // 处理 literal \\n / \\t，但不能误伤 LaTeX 命令：\neq、\nabla、\text 等。
  text = text.replace(/\\n(?![A-Za-z])/g, "\n")
  text = text.replace(/\\t(?![A-Za-z])/g, "\t")

  // 部分模型会把数学定界符转义为 \$、\(、\[，需要还原后才能被 KaTeX 识别。
  text = text.replace(/\\\$/g, "$")
  text = text.replace(/\\\[/g, "$$")
  text = text.replace(/\\\]/g, "$$")
  text = text.replace(/\\\(/g, "$")
  text = text.replace(/\\\)/g, "$")

  // ============================================
  // 2. 修复 LaTeX 双转义
  // LLM 常将 \times 输出为 \\times，\\frac 输出为 \\frac
  // KaTeX 需要的是 \times 而不是 \\times
  // ============================================

  // 常见 LaTeX 数学符号的双转义修复
  // 注意顺序很重要：先处理复合的，再处理单一的
  const latexReplacements: [RegExp, string][] = [
    // 分数 - 多字符命令优先
    [/\\\\frac/g, "\\frac"],
    // 根号
    [/\\\\sqrt/g, "\\sqrt"],
    // 求和、积分、连乘
    [/\\\\sum/g, "\\sum"],
    [/\\\\int/g, "\\int"],
    [/\\\\prod/g, "\\prod"],
    // 极限
    [/\\\\lim/g, "\\lim"],
    [/\\\\sin/g, "\\sin"],
    [/\\\\cos/g, "\\cos"],
    [/\\\\tan/g, "\\tan"],
    // 希腊字母（常见的）
    [/\\\\alpha/g, "\\alpha"],
    [/\\\\beta/g, "\\beta"],
    [/\\\\gamma/g, "\\gamma"],
    [/\\\\delta/g, "\\delta"],
    [/\\\\epsilon/g, "\\epsilon"],
    [/\\\\theta/g, "\\theta"],
    [/\\\\lambda/g, "\\lambda"],
    [/\\\\mu/g, "\\mu"],
    [/\\\\pi/g, "\\pi"],
    [/\\\\sigma/g, "\\sigma"],
    [/\\\\omega/g, "\\omega"],
    // 关系运算符
    [/\\\\times/g, "\\times"],
    [/\\\\div/g, "\\div"],
    [/\\\\pm/g, "\\pm"],
    [/\\\\cdot/g, "\\cdot"],
    [/\\\\leq/g, "\\leq"],
    [/\\\\geq/g, "\\geq"],
    [/\\\\neq/g, "\\neq"],
    [/\\\\approx/g, "\\approx"],
    // 箭头
    [/\\\\rightarrow/g, "\\rightarrow"],
    [/\\\\leftarrow/g, "\\leftarrow"],
    [/\\\\Rightarrow/g, "\\Rightarrow"],
    [/\\\\Leftarrow/g, "\\Leftarrow"],
    // 集合
    [/\\\\subset/g, "\\subset"],
    [/\\\\supset/g, "\\supset"],
    [/\\\\subseteq/g, "\\subseteq"],
    [/\\\\in/g, "\\in"],
    [/\\\\notin/g, "\\notin"],
    [/\\\\cup/g, "\\cup"],
    [/\\\\cap/g, "\\cap"],
    [/\\\\emptyset/g, "\\emptyset"],
    // 逻辑
    [/\\\\forall/g, "\\forall"],
    [/\\\\exists/g, "\\exists"],
    [/\\\\neg/g, "\\neg"],
    [/\\\\land/g, "\\land"],
    [/\\\\lor/g, "\\lor"],
    // 布局命令
    [/\\\\frac/g, "\\frac"],
    [/\\\\binom/g, "\\binom"],
    [/\\\\sqrt/g, "\\sqrt"],
    // 矩阵
    [/\\\\begin\{(matrix|bmatrix|vmatrix|pmatrix)\}/g, "\\begin{$1}"],
    [/\\\\end\{(matrix|bmatrix|vmatrix|pmatrix)\}/g, "\\end{$1}"],
    // 文本命令
    [/\\\\text\{/g, "\\text{"],
    [/\\\\textbf\{/g, "\\textbf{"],
    [/\\\\textit\{/g, "\\textit{"],
    // 向量/粗体
    [/\\\\vec\{/g, "\\vec{"],
    [/\\\\mathbf\{/g, "\\mathbf{"],
    [/\\\\bm\{/g, "\\bm{"],
  ]

  for (const [pattern, replacement] of latexReplacements) {
    text = text.replace(pattern, replacement)
  }

  // ============================================
  // 3. 修复其他常见的双转义
  // ============================================

  // 换行指令（在 markdown 中有时候需要）
  // 如果行尾有 \\，可能应该转为真正的换行
  text = text.replace(/\\$/gm, "")

  // 清理多余的反斜杠（连续两个反斜杠转为单个，但不是在 LaTeX 命令中）
  // 这个比较危险，可能会破坏正确的 LaTeX，所以只处理明显错误的模式
  // 例如在普通文本中的 \\n 我们已经在前面处理了

  // ============================================
  // 4. 修复 markdown 列表前的异常空格
  // ============================================
  // 修复类似 "1.  \\n  2." 这种被过度转义搞坏的列表
  text = text.replace(/(\d+)\.\s*\\n\s+/g, "$1. ")

  return text
}
