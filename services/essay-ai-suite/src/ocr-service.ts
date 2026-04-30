import type { AppConfig, OcrImageInput, OcrResult } from './types';

export class OcrService {
  constructor(private readonly config: AppConfig) {}

  async recognize(input: OcrImageInput, index = 0): Promise<OcrResult> {
    const imageId = input.image_id || `image_${index + 1}`;

    if (input.text?.trim()) {
      return {
        image_id: imageId,
        file_name: input.file_name,
        text: input.text.trim(),
        confidence: 1,
        provider: 'passthrough',
        status: 'success',
        error: null,
      };
    }

    if (input.image_base64?.trim()) {
      if (this.hasProvider()) {
        return this.recognizeWithOpenAiCompatibleVision(input, imageId);
      }
      return failedResult(imageId, input.file_name, 'OCR provider is not configured yet. Pass text for passthrough testing or configure OCR_API_BASE_URL/OCR_API_KEY/OCR_MODEL.');
    }

    return failedResult(imageId, input.file_name, 'No image_base64 or text was provided.');
  }

  private hasProvider(): boolean {
    return Boolean(this.config.ocrApiBaseUrl && this.config.ocrApiKey && this.config.ocrModel);
  }

  private async recognizeWithOpenAiCompatibleVision(input: OcrImageInput, imageId: string): Promise<OcrResult> {
    try {
      const baseUrl = this.config.ocrApiBaseUrl?.replace(/\/$/, '');
      const mimeType = inferImageMimeType(input.file_name);
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.ocrApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.ocrModel,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: '请做 OCR 识别。只输出图片中的作文正文，忽略方格线、批注和无关说明。',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请识别这张图片里的作文正文，只输出纯文本。',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${input.image_base64}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.jobTimeoutSeconds * 1000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OCR request failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('OCR response did not include text.');
      }

      return {
        image_id: imageId,
        file_name: input.file_name,
        text,
        confidence: null,
        provider: 'openai-compatible-vision',
        status: 'success',
        error: null,
      };
    } catch (error) {
      return failedResult(imageId, input.file_name, error instanceof Error ? error.message : String(error));
    }
  }
}

function failedResult(imageId: string, fileName: string | undefined, error: string): OcrResult {
  return {
    image_id: imageId,
    file_name: fileName,
    text: '',
    confidence: null,
    provider: 'stub',
    status: 'failed',
    error,
  };
}

function inferImageMimeType(fileName?: string): string {
  const lower = fileName?.toLowerCase() ?? '';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}
