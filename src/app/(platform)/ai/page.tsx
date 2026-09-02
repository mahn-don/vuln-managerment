"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, ChevronDown, ChevronRight, Bot, User } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface NLQResponse {
  answer: string;
  data: unknown;
  source: {
    type: "predefined_metric" | "ai_generated";
    metric?: string;
    query?: string;
    period?: string;
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: NLQResponse["source"];
  data?: unknown;
}

const SUGGESTED_QUESTION_KEYS = [
  "ai.suggestedQ1",
  "ai.suggestedQ2",
  "ai.suggestedQ3",
  "ai.suggestedQ4",
  "ai.suggestedQ5",
] as const;

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSubmit(question: string) {
    if (!question.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: question.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Request failed");

      const nlq: NLQResponse = json.data;
      const assistantMessage: Message = {
        role: "assistant",
        content: nlq.answer,
        source: nlq.source,
        data: nlq.data,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("ai.errorMessage") },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("ai.securityAssistant")}</h1>
        <p className="text-muted-foreground">{t("ai.askAboutPosture")}</p>
      </div>

      {/* Chat area */}
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">
                  {t("ai.emptyState")}
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] space-y-2 rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>

                  {/* Source metadata */}
                  {Boolean(msg.source) && (
                    <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      {Boolean(msg.source?.type) && (
                        <p>
                          <span className="font-medium">{t("ai.source")}:</span>{" "}
                          {msg.source?.type === "predefined_metric"
                            ? t("ai.predefinedMetric")
                            : t("ai.aiGenerated")}
                        </p>
                      )}
                      {Boolean(msg.source?.metric) && (
                        <p>
                          <span className="font-medium">{t("ai.metric")}:</span>{" "}
                          {String(msg.source?.metric)}
                        </p>
                      )}
                      {Boolean(msg.source?.query) && (
                        <p>
                          <span className="font-medium">{t("ai.query")}:</span>{" "}
                          {String(msg.source?.query)}
                        </p>
                      )}
                      {Boolean(msg.source?.period) && (
                        <p>
                          <span className="font-medium">{t("ai.period")}:</span>{" "}
                          {String(msg.source?.period)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Data collapsible */}
                  {Boolean(msg.data) && <DataCollapsible data={msg.data} />}
                </div>
                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="max-w-[75%] space-y-2 rounded-lg bg-muted px-4 py-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {SUGGESTED_QUESTION_KEYS.map((key) => {
                const label = t(key);
                return (
                  <button
                    key={key}
                    onClick={() => handleSubmit(label)}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 border-t pt-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(input);
                }
              }}
              placeholder={t("ai.inputPlaceholder")}
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={() => handleSubmit(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataCollapsible({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t("ai.rawData")}
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-2 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
