// LLM Service - Supports Anthropic Claude and OpenAI
// This replaces the AWS Bedrock service with individual-friendly APIs


export class LLMService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    // Use summarization service URL (will be proxied through Next.js API routes)
    this.apiUrl = '/api/media/summarize';
    this.apiKey = ''; // Will be handled server-side
  }

  async translateText(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 10000
  ): Promise<string> {
    // For translation, we'll call the Python translation service
    const translateUrl = '/api/media/translate';

    try {
      const response = await fetch(translateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          max_tokens: maxTokens
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Error in translateText:', error);
      throw error;
    }
  }

  async streamSummary(
    systemPrompt: string,
    userPrompt: string,
    episodeData: {
      episodeId: string;
      podcastName: string;
      episodeTitle: string;
      episodeDuration: string;
      episodePubDate: string;
      transcript: string;
      language: number;
    }
  ): Promise<ReadableStream<Uint8Array>> {
    const requestBody = {
      episodeId: episodeData.episodeId,
      podcastName: episodeData.podcastName,
      episodeTitle: episodeData.episodeTitle,
      episodeDuration: episodeData.episodeDuration,
      episodePubDate: episodeData.episodePubDate,
      userId: 'guest', // Default for client-side calls
      transcript: episodeData.transcript,
      language: episodeData.language,
      system_prompt: systemPrompt,
      user_prompt: userPrompt
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.body!;
    } catch (error) {
      console.error('Error in streamSummary:', error);
      throw error;
    }
  }
}

// Available models (for reference - actual models are handled server-side)
export const LLM_MODELS = {
  CLAUDE_SONNET_4_5: 'claude-sonnet-4-5-20250929',
  GPT_5_1: 'gpt-5.1',
};

export const DEFAULT_MODEL = LLM_MODELS.CLAUDE_SONNET_4_5;

// Legacy compatibility - these maintain the same interface as the old AWS service
export const BEDROCK_MODELS = LLM_MODELS;
export const AWSBedrockService = LLMService; 