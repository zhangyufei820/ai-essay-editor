/**
 * 🖌 v2 智能体产物模板总出口
 *
 * 4 种主模板（每个智能体的产物决定挑哪个）：
 *   - EssayReviewTemplate     作文批改稿
 *   - WorksheetPosterTemplate 错题诊断海报
 *   - VocabCardTemplate       词境记忆卡
 *   - FlashcardTemplate       闪卡
 *   - MarkdownTemplate        默认 fallback
 */

export { EssayReviewTemplate, type EssayReviewTemplateProps } from "./EssayReviewTemplate"
export {
  WorksheetPosterTemplate,
  type WorksheetPosterTemplateProps,
} from "./WorksheetPosterTemplate"
export { VocabCardTemplate, type VocabCardTemplateProps } from "./VocabCardTemplate"
export { FlashcardTemplate, type FlashcardTemplateProps } from "./FlashcardTemplate"
export { MarkdownTemplate, type MarkdownTemplateProps } from "./MarkdownTemplate"
