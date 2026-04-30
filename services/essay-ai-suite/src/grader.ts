import type { AppConfig, EssayGradeResult, EssayInput, GradeOptions } from './types';
import { OpenAiCompatibleClient } from './llm-client';
import { buildEssayGradingMessages, ESSAY_GRADING_PROMPT_V1 } from './prompts/essay-grading-v1';

export class EssayGrader {
  private readonly llmClient: OpenAiCompatibleClient;

  constructor(private readonly config: AppConfig) {
    this.llmClient = new OpenAiCompatibleClient(config);
  }

  async grade(input: EssayInput, options: GradeOptions = {}): Promise<EssayGradeResult> {
    const startedAt = Date.now();
    const essayId = input.essay_id ?? `essay_${startedAt}`;

    try {
      const report = await this.generateReport(input, options);
      const score = estimateScore(input.text);

      return {
        essay_id: essayId,
        student_name: input.student_name,
        status: 'success',
        attempts: 1,
        score,
        level: scoreToLevel(score),
        grade_level: input.grade_level,
        genre: input.genre,
        summary: summarizeText(input.text),
        problems: detectProblems(input.text),
        polished_text: options.rewrite === false ? '' : buildPolishedDraft(input.text),
        markdown_report: report.markdown,
        provider: this.hasLlmConfig() ? 'llm' : 'local-draft',
        model: report.model,
        prompt_version: report.promptVersion,
        error: null,
        duration_ms: Date.now() - startedAt,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        essay_id: essayId,
        student_name: input.student_name,
        status: 'failed',
        attempts: 1,
        score: null,
        level: null,
        grade_level: input.grade_level,
        genre: input.genre,
        summary: '',
        problems: [],
        polished_text: '',
        markdown_report: '',
        provider: this.hasLlmConfig() ? 'llm' : 'local-draft',
        model: this.config.llmModel ?? null,
        prompt_version: options.prompt_version ?? ESSAY_GRADING_PROMPT_V1.version,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startedAt,
        created_at: new Date().toISOString(),
      };
    }
  }

  private async generateReport(
    input: EssayInput,
    options: GradeOptions,
  ): Promise<{ markdown: string; model: string | null; promptVersion: string }> {
    if (this.hasLlmConfig()) {
      return this.callOpenAiCompatible(input, options);
    }
    return {
      markdown: buildLocalDraftReport(input, options),
      model: null,
      promptVersion: ESSAY_GRADING_PROMPT_V1.version,
    };
  }

  private hasLlmConfig(): boolean {
    return this.llmClient.isConfigured();
  }

  private async callOpenAiCompatible(
    input: EssayInput,
    options: GradeOptions,
  ): Promise<{ markdown: string; model: string | null; promptVersion: string }> {
    const prompt = buildEssayGradingMessages(input, options);
    const completion = await this.llmClient.complete(prompt.messages);
    return {
      markdown: completion.content,
      model: completion.model,
      promptVersion: prompt.version,
    };
  }
}

function buildLocalDraftReport(input: EssayInput, options: GradeOptions): string {
  const score = estimateScore(input.text);
  const problems = detectProblems(input.text);
  const title = input.student_name ? `${input.student_name}的作文批改报告` : '作文批改报告';

  return [
    `### ${title}`,
    '',
    `- **综合评分**：${score}/100`,
    `- **等级**：${scoreToLevel(score)}`,
    `- **学段**：${input.grade_level ?? '未指定'}`,
    `- **文体**：${input.genre ?? '未指定'}`,
    '',
    '#### 主要优点',
    `文章已经具备基本表达完整性，核心内容约 ${input.text.length} 字，适合进入结构和语言层面的精修。`,
    '',
    '#### 关键问题',
    ...problems.map((item) => `- ${item}`),
    '',
    '#### 修改建议',
    '- 先明确中心句，再调整段落顺序。',
    '- 每段保留一个主要功能，避免观点和叙事混杂。',
    '- 增加具体场景、动作、感官细节，让表达更有画面感。',
    '',
    options.rewrite === false ? '' : '#### 润色示范',
    options.rewrite === false ? '' : buildPolishedDraft(input.text),
  ].filter(Boolean).join('\n');
}

function estimateScore(text: string): number {
  const lengthScore = Math.min(35, Math.floor(text.length / 40));
  const punctuationScore = /[。！？!?]/.test(text) ? 15 : 8;
  const paragraphScore = text.includes('\n') ? 15 : 10;
  return Math.max(60, Math.min(92, 35 + lengthScore + punctuationScore + paragraphScore));
}

function scoreToLevel(score: number): string {
  if (score >= 90) return '王者';
  if (score >= 82) return '钻石';
  if (score >= 74) return '黄金';
  if (score >= 66) return '白银';
  return '青铜';
}

function summarizeText(text: string): string {
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function detectProblems(text: string): string[] {
  const problems: string[] = [];
  if (!text.includes('\n')) {
    problems.push('段落层次不够清晰，建议按开头、展开、转折、收束拆分。');
  }
  if (text.length < 400) {
    problems.push('内容展开略少，可以补充关键场景和细节。');
  }
  if (!/[，。！？；：]/.test(text)) {
    problems.push('标点使用不足，会影响阅读节奏。');
  }
  if (problems.length === 0) {
    problems.push('下一步重点提升语言张力和段落过渡。');
  }
  return problems;
}

function buildPolishedDraft(text: string): string {
  const preview = text.length > 220 ? `${text.slice(0, 220)}...` : text;
  return `这里先保留原文核心内容，并建议在正式模型接入后输出完整润色版：${preview}`;
}
