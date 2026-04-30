import type { EssayInput, GradeBatchRequest, GradeSingleRequest } from './types';

export function normalizeSingleRequest(body: unknown): GradeSingleRequest {
  if (!isRecord(body)) {
    throw new Error('Request body must be a JSON object.');
  }

  const text = readString(body.text);
  if (!text || text.trim().length < 5) {
    throw new Error('Essay text is required and must contain at least 5 characters.');
  }

  return {
    essay_id: readString(body.essay_id),
    student_name: readString(body.student_name),
    text: text.trim(),
    grade_level: readString(body.grade_level),
    genre: readString(body.genre),
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
    options: isRecord(body.options) ? body.options : undefined,
  };
}

export function normalizeBatchRequest(body: unknown, maxBatchSize: number): GradeBatchRequest {
  if (!isRecord(body)) {
    throw new Error('Request body must be a JSON object.');
  }
  if (!Array.isArray(body.essays)) {
    throw new Error('essays must be an array.');
  }
  if (body.essays.length === 0) {
    throw new Error('essays must contain at least one item.');
  }
  if (body.essays.length > maxBatchSize) {
    throw new Error(`Batch size exceeds limit ${maxBatchSize}.`);
  }

  return {
    essays: body.essays.map((item, index) => normalizeEssayInput(item, index)),
    options: isRecord(body.options) ? body.options : undefined,
  };
}

function normalizeEssayInput(item: unknown, index: number): EssayInput {
  if (!isRecord(item)) {
    throw new Error(`Essay at index ${index} must be an object.`);
  }
  const text = readString(item.text);
  if (!text || text.trim().length < 5) {
    throw new Error(`Essay at index ${index} is missing valid text.`);
  }

  return {
    essay_id: readString(item.essay_id) ?? `essay_${index + 1}`,
    student_name: readString(item.student_name),
    text: text.trim(),
    grade_level: readString(item.grade_level),
    genre: readString(item.genre),
    metadata: isRecord(item.metadata) ? item.metadata : undefined,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
