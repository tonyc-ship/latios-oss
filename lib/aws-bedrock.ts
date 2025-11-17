import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

// AWS Bedrock Configuration
export class AWSBedrockService {
  private client: BedrockRuntimeClient;
  
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async streamClaude(
    systemPrompt: string, 
    userPrompt: string, 
    maxTokens: number = 10000,
    model: string = BEDROCK_MODELS.CLAUDE_3_7_SONNET
  ) {
    console.log('Attempting to stream with model:', model);
    
    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    };

    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body)
      });

      console.log('Sending request to Bedrock...');
      const response = await this.client.send(command);
      console.log('Received response from Bedrock');
      return response;
    } catch (error) {
      console.error('Error in streamClaude:', {
        error,
        modelId: model,
        region: process.env.AWS_REGION || 'us-east-1'
      });
      throw error;
    }
  }

  async streamTitan(
    prompt: string, 
    maxTokens: number = 10000,
    model: string = 'amazon.titan-text-premier-v1:0'
  ) {
    const body = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: maxTokens,
        temperature: 0.7,
        topP: 0.9
      }
    };

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body)
    });

    return await this.client.send(command);
  }

  // Process streaming response for Claude models with optional client gating
  async processClaudeStream(
    response: any,
    controller: ReadableStreamDefaultController<Uint8Array>,
    gating?: { allowFullStream: boolean; maxClientChars?: number }
  ): Promise<{ fullText: string; clientClosed: boolean }> {
    let fullText = '';
    let clientClosed = false;
    const encoder = new TextEncoder();
    const maxClientChars = gating?.maxClientChars ?? 200;
    let streamedChars = 0;
    const GATING_LIMIT_MARKER = '\n---GATING_LIMIT_REACHED---\n';

    if (response.body) {
      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));

          if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
            const text: string = chunkData.delta.text;
            fullText += text;

            if (!gating || gating.allowFullStream) {
              // Paid users: continuously push to client
              controller.enqueue(encoder.encode(text));
            } else if (!clientClosed) {
              // Free/not logged in: only push up to limit, then stop pushing but continue accumulating fullText
              const remaining = maxClientChars - streamedChars;
              if (remaining > 0) {
                if (text.length <= remaining) {
                  controller.enqueue(encoder.encode(text));
                  streamedChars += text.length;
                } else {
                  controller.enqueue(encoder.encode(text.slice(0, remaining)));
                  streamedChars += remaining;
                  // Send special marker to notify frontend that limit has been reached
                  controller.enqueue(encoder.encode(GATING_LIMIT_MARKER));
                  clientClosed = true;
                }
              } else if (!clientClosed) {
                // Limit reached, send special marker
                controller.enqueue(encoder.encode(GATING_LIMIT_MARKER));
                clientClosed = true;
              }
            }
          }

          if (chunkData.type === 'message_stop') {
            break;
          }
        }
      }
    }

    return { fullText, clientClosed };
  }

  // Process streaming response for Titan models with optional client gating
  async processTitanStream(
    response: any,
    controller: ReadableStreamDefaultController<Uint8Array>,
    gating?: { allowFullStream: boolean; maxClientChars?: number }
  ): Promise<{ fullText: string; clientClosed: boolean }> {
    let fullText = '';
    let clientClosed = false;
    const encoder = new TextEncoder();
    const maxClientChars = gating?.maxClientChars ?? 200;
    let streamedChars = 0;
    const GATING_LIMIT_MARKER = '\n---GATING_LIMIT_REACHED---\n';

    if (response.body) {
      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));

          if (chunkData.outputText) {
            const text: string = chunkData.outputText;
            fullText += text;

            if (!gating || gating.allowFullStream) {
              controller.enqueue(encoder.encode(text));
            } else if (!clientClosed) {
              const remaining = maxClientChars - streamedChars;
              if (remaining > 0) {
                if (text.length <= remaining) {
                  controller.enqueue(encoder.encode(text));
                  streamedChars += text.length;
                } else {
                  controller.enqueue(encoder.encode(text.slice(0, remaining)));
                  streamedChars += remaining;
                  // 发送特殊标记，告知前端已达到限制
                  controller.enqueue(encoder.encode(GATING_LIMIT_MARKER));
                  clientClosed = true;
                }
              } else if (!clientClosed) {
                // 已达上限，发送特殊标记
                controller.enqueue(encoder.encode(GATING_LIMIT_MARKER));
                clientClosed = true;
              }
            }
          }

          if (chunkData.completionReason === 'FINISH') {
            break;
          }
        }
      }
    }

    return { fullText, clientClosed };
  }
}

// Available models
export const BEDROCK_MODELS = {
  CLAUDE_3_7_SONNET: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
  CLAUDE_4_5_SONNET: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  CLAUDE_3_5_SONNET: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  CLAUDE_3_HAIKU: 'anthropic.claude-3-haiku-20240307-v1:0',
  TITAN_TEXT_PREMIER: 'amazon.titan-text-premier-v1:0',
  TITAN_TEXT_EXPRESS: 'amazon.titan-text-express-v1'
};

export const DEFAULT_MODEL = BEDROCK_MODELS.CLAUDE_3_7_SONNET; 