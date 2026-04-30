import type { DocumentExtractInput, OcrImageInput } from './types';
import { isRecord } from './validation';

export function normalizeDocumentInput(body: unknown): DocumentExtractInput {
  if (!isRecord(body)) {
    throw new Error('Request body must be a JSON object.');
  }

  return {
    document_id: readString(body.document_id),
    file_name: readString(body.file_name),
    mime_type: readString(body.mime_type),
    text: readString(body.text),
    content_base64: readString(body.content_base64),
  };
}

export function normalizeDocumentBatchInput(body: unknown): DocumentExtractInput[] {
  if (!isRecord(body) || !Array.isArray(body.documents)) {
    throw new Error('documents must be an array.');
  }
  if (body.documents.length === 0) {
    throw new Error('documents must contain at least one item.');
  }
  return body.documents.map(normalizeDocumentInput);
}

export function normalizeOcrInput(body: unknown): OcrImageInput {
  if (!isRecord(body)) {
    throw new Error('Request body must be a JSON object.');
  }

  return {
    image_id: readString(body.image_id),
    file_name: readString(body.file_name),
    image_base64: readString(body.image_base64),
    text: readString(body.text),
  };
}

export function normalizeOcrBatchInput(body: unknown): OcrImageInput[] {
  if (!isRecord(body) || !Array.isArray(body.images)) {
    throw new Error('images must be an array.');
  }
  if (body.images.length === 0) {
    throw new Error('images must contain at least one item.');
  }
  return body.images.map(normalizeOcrInput);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
