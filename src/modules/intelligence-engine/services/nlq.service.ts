import { predefinedMetrics, type MetricResult } from "../metrics/predefined-metrics";
import { aiGateway } from "./ai-gateway.service";
import { createChildLogger } from "@/lib/logger";
import { auditService } from "@/modules/platform-services/services/audit.service";

const logger = createChildLogger("nlq");

export interface NLQResponse {
  answer: string;
  data: unknown;
  source: {
    type: "predefined_metric" | "ai_generated";
    metric?: string;
    query?: string;
    period?: string;
  };
  lastSynced?: string;
}

class NLQService {
  /**
   * Process a natural language question about security data.
   * First tries predefined metrics (deterministic), then falls back to AI interpretation.
   */
  async ask(question: string, userId: string, _userRole?: string): Promise<NLQResponse> {
    logger.info({ questionLength: question.length }, "Processing NLQ question");

    // Stage 1: Try predefined metrics
    const metricResult = await this.tryPredefinedMetrics(question);
    if (metricResult) {
      await auditService.log({
        userId,
        action: "ai.nlq_query",
        source: "AI",
        details: { questionLength: question.length, responseType: "predefined_metric", metric: metricResult.metric },
      });

      return {
        answer: metricResult.result.label,
        data: metricResult.result.value,
        source: {
          type: "predefined_metric",
          metric: metricResult.metric,
          query: metricResult.result.query,
          period: metricResult.result.period,
        },
      };
    }

    // Stage 2: Generic AI interpretation without database access.
    if (await aiGateway.isConfigured) {
      try {
        return await this.askWithAI(question, userId);
      } catch (error) {
        logger.error({ error: (error as Error).message }, "AI NLQ failed, returning suggestions");
      }
    }

    // Stage 4: Fallback — suggest rephrasing
    return {
      answer: "I couldn't find a specific answer to that question. Try asking about:\n" +
        "- Open vulnerability counts (by severity)\n" +
        "- SLA breaches or compliance\n" +
        "- Assessment backlog or overdue assessments\n" +
        "- Applications never assessed or with most vulnerabilities\n" +
        "- Engineer workload\n" +
        "- Vulnerabilities created in a specific month",
      data: null,
      source: { type: "ai_generated" },
    };
  }

  /**
   * Try to match the question against predefined metrics.
   */
  private async tryPredefinedMetrics(question: string): Promise<{
    metric: string;
    result: MetricResult;
  } | null> {
    for (const [metricName, metric] of Object.entries(predefinedMetrics)) {
      for (const pattern of metric.patterns) {
        const match = question.match(pattern);
        if (match) {
          // Extract parameters from regex groups
          const params: Record<string, string> = {};

          // Extract severity
          const sevMatch = question.match(/\b(critical|high|medium|low)\b/i);
          if (sevMatch) params.severity = sevMatch[1];

          // Extract period
          const periodMatch = question.match(
            /\b(january|february|march|april|may|june|july|august|september|october|november|december|this month|last month|this week|this quarter|last quarter)\b/i
          );
          if (periodMatch) params.period = periodMatch[1];

          try {
            const result = await metric.handler(params);
            return { metric: metricName, result };
          } catch (error) {
            logger.error({ metric: metricName, error: (error as Error).message }, "Predefined metric failed");
          }
        }
      }
    }

    return null;
  }

  /**
   * Use AI to interpret and answer the question.
   */
  private async askWithAI(question: string, userId: string): Promise<NLQResponse> {
    const systemPrompt = `You are a security data analyst assistant. You answer questions about security assessments, vulnerabilities, applications, and SLA compliance.

You do NOT have direct database access. Based on the question, describe what data would answer it and provide the best answer you can based on the context of a security operations team.

Keep answers concise and factual. If you don't have specific data, say so clearly.

Respond in this JSON format:
{
  "answer": "Your answer text",
  "suggestion": "A rephrased version of the question that would match our predefined metrics, or null"
}`;

    const response = await aiGateway.chat({
      type: "nlq_query",
      promptTemplate: "nlq-v1",
      systemPrompt,
      userPrompt: `Question: ${question}`,
      maxTokens: 500,
      temperature: 0.3,
    });

    const parsed = aiGateway.parseJSON<{ answer: string; suggestion?: string }>(response.content);

    await auditService.log({
      userId,
      action: "ai.nlq_query",
      source: "AI",
      details: { questionLength: question.length, responseType: "ai_generated", tokensUsed: response.tokensUsed },
    });

    return {
      answer: parsed?.answer || response.content,
      data: null,
      source: { type: "ai_generated" },
    };
  }

}

export const nlqService = new NLQService();
