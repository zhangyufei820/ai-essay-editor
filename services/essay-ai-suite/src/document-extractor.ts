import type { AppConfig, DocumentExtractInput, DocumentExtractResult } from './types';

export class DocumentExtractor {
  constructor(private readonly config: AppConfig) {}

  async extract(input: DocumentExtractInput, index = 0): Promise<DocumentExtractResult> {
    const documentId = input.document_id || `doc_${index + 1}`;

    try {
      const text = normalizeText(readText(input));
      if (text) {
        return {
          document_id: documentId,
          file_name: input.file_name,
          mime_type: input.mime_type,
          text,
          char_count: text.length,
          provider: 'local-text',
          status: 'success',
          error: null,
        };
      }

      if (input.content_base64 && this.hasExternalProvider()) {
        return this.extractWithExternalProvider(input, documentId);
      }

      throw new Error('No extractable document text was provided.');
    } catch (error) {
      return {
        document_id: documentId,
        file_name: input.file_name,
        mime_type: input.mime_type,
        text: '',
        char_count: 0,
        provider: this.hasExternalProvider() ? 'external' : 'local-text',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private hasExternalProvider(): boolean {
    return Boolean(this.config.docExtractApiUrl && this.config.docExtractApiKey);
  }

  private async extractWithExternalProvider(
    input: DocumentExtractInput,
    documentId: string,
  ): Promise<DocumentExtractResult> {
    const response = await fetch(this.config.docExtractApiUrl as string, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.docExtractApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.config.jobTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Document extraction request failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    const data = await response.json() as { text?: string; content?: string };
    const text = normalizeText(data.text ?? data.content ?? '');
    if (!text) {
      throw new Error('Document extraction response did not include text.');
    }

    return {
      document_id: documentId,
      file_name: input.file_name,
      mime_type: input.mime_type,
      text,
      char_count: text.length,
      provider: 'external',
      status: 'success',
      error: null,
    };
  }
}

function readText(input: DocumentExtractInput): string {
  if (input.text) {
    return input.text;
  }
  if (input.content_base64 && isTextMime(input.mime_type)) {
    return Buffer.from(input.content_base64, 'base64').toString('utf8');
  }
  return '';
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isTextMime(mimeType?: string): boolean {
  if (!mimeType) {
    return true;
  }
  return mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('markdown');
}
