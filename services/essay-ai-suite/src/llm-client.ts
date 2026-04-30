import type { AppConfig } from './types';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  content: string;
  model: string;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAiCompatibleClient {
  constructor(private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.llmApiBaseUrl && this.config.llmApiKey && this.config.llmModel);
  }

  async complete(messages: LlmMessage[]): Promise<LlmCompletion> {
    if (!this.isConfigured()) {
      throw new Error('LLM config is incomplete.');
    }

    const baseUrl = this.config.llmApiBaseUrl?.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.llmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.llmModel,
        temperature: 0.5,
        messages,
      }),
      signal: AbortSignal.timeout(this.config.jobTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`LLM request failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('LLM response did not include content.');
    }

    return {
      content,
      model: data.model ?? this.config.llmModel ?? 'unknown',
    };
  }
}
