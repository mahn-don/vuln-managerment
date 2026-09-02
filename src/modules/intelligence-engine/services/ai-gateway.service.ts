import { prisma } from "@/lib/db/prisma";
import { createChildLogger } from "@/lib/logger";
import { aiSettingsService } from "@/modules/platform-services/services/ai-settings.service";
import type { Prisma } from "@/generated/prisma";

const logger = createChildLogger("ai-gateway");

interface AIRequest {
  type: string;
  promptTemplate: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface AIResponse {
  content: string;
  tokensUsed: number;
  latencyMs: number;
  model: string;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: { type: string; text: string }[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

class AIGatewayService {
  /**
   * Configuration comes from the administration screen, falling back to the
   * environment so deployments configured that way keep working. It is read per
   * request (behind a short cache in the settings service) rather than captured
   * at construction, so changing the model or rotating a token takes effect
   * without restarting the process.
   */
  get isConfigured(): Promise<boolean> {
    return aiSettingsService
      .get()
      .then((settings) => settings.enabled && Boolean(settings.apiToken));
  }

  /**
   * Send a request to the Claude API and log the interaction.
   */
  async chat(request: AIRequest): Promise<AIResponse> {
    const settings = await aiSettingsService.get();

    if (!settings.enabled || !settings.apiToken) {
      throw new Error(
        "External AI is not configured. Enable it and set an API token under Administration → AI settings."
      );
    }

    const model = request.model || settings.model;
    const startTime = Date.now();

    try {
      const response = await fetch(settings.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiToken,
          "anthropic-version": settings.apiVersion,
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens || settings.maxTokens,
          temperature: request.temperature ?? settings.temperature,
          system: request.systemPrompt,
          messages: [{ role: "user", content: request.userPrompt }],
        }),
        signal: AbortSignal.timeout(settings.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data: ClaudeResponse = await response.json();
      const latencyMs = Date.now() - startTime;
      const tokensUsed = data.usage.input_tokens + data.usage.output_tokens;
      const content = data.content[0]?.text || "";

      // Log the AI interaction
      await prisma.aIRecommendation.create({
        data: {
          type: request.type,
          inputSummary: `${request.type} request`,
          modelProvider: "anthropic",
          modelId: model,
          promptTemplate: request.promptTemplate,
          output: { retained: false } as Prisma.InputJsonValue,
          tokensUsed,
          latencyMs,
          status: "PENDING",
        },
      });

      logger.info(
        { type: request.type, model, tokensUsed, latencyMs },
        "AI request completed"
      );

      return { content, tokensUsed, latencyMs, model };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error({ type: request.type, error: (error as Error).message, latencyMs }, "AI request failed");
      throw error;
    }
  }

  /**
   * Parse a JSON response from the AI, with fallback.
   */
  parseJSON<T>(content: string): T | null {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      return JSON.parse(jsonStr.trim());
    } catch {
      logger.warn("Failed to parse AI response as JSON");
      return null;
    }
  }
}

export const aiGateway = new AIGatewayService();
