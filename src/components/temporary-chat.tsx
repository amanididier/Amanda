import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { readModelStream } from "@/lib/local-model-stream";

type Message = { id: string; role: "user" | "assistant"; content: string };
type ModelConnection = { baseUrl: string; apiKey: string };

export function TemporaryChat({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const modelConnection = queryClient.getQueryData<ModelConnection>(["model-connection"]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streamed, setStreamed] = useState("");
  const [sending, setSending] = useState(false);
  const [progressLabel, setProgressLabel] = useState("Reading your message");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!sending || streamed) return;
    const updates = [
      "Reading your message",
      "Gathering the conversation",
      "Preparing a clear response",
      "Putting the answer together",
    ];
    let index = 0;
    setProgressLabel(updates[0] ?? "Reading your message");
    const interval = window.setInterval(() => {
      index = (index + 1) % updates.length;
      setProgressLabel(updates[index] ?? "Preparing a response");
    }, 1100);
    return () => window.clearInterval(interval);
  }, [sending, streamed]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || !modelConnection || sending) return;
    const nextMessages: Message[] = [...messages, { id: crypto.randomUUID(), role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setStreamed("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`${modelConnection.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${modelConnection.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are Amanda, a private assistant. This is a temporary conversation. Answer clearly and do not claim to save anything. Do not reveal internal reasoning, hidden analysis, or scratch work. Never output think tags or raw control tokens." },
            ...nextMessages.map(({ role, content: message }) => ({ role, content: message })),
          ],
          stream: true,
          max_tokens: 1200,
          temperature: 0.7,
        }),
      });
      if (!response.ok || !response.body) throw new Error(`The local model returned HTTP ${response.status}`);
      const result = await readModelStream(response.body, controller.signal, setStreamed);
      if (!controller.signal.aborted && result.text.trim()) {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.text.trim() }]);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: error instanceof Error ? error.message : "Amanda could not answer that message." }]);
      }
    } finally {
      setSending(false);
      setStreamed("");
      abortRef.current = null;
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="relative mb-7 flex min-h-10 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0"
          onClick={onClose}
          aria-label="Return to Amanda"
          title="Return to Amanda"
        >
          <ArrowLeft />
        </Button>
        <h1 className="px-12 text-center font-serif text-3xl tracking-tight sm:text-4xl">A temporary chat</h1>
      </div>
      <div className="max-h-[52vh] min-h-24 space-y-4 overflow-y-auto py-4" role="log" aria-live="polite">
        {messages.length === 0 && <div className="min-h-8" />}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted"}`}>{message.content}</div>
        ))}
        {(sending || streamed) && <div className="mr-auto max-w-[90%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-sm">{streamed || progressLabel}</div>}
      </div>
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask Amanda anything…" className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" disabled={!modelConnection || sending} />
        <div className="mt-2 flex items-center justify-between">
          <span className="sr-only">{modelConnection ? "Temporary chat" : "Local model unavailable"}</span>
          {sending ? <Button variant="outline" onClick={() => abortRef.current?.abort()}><Square data-icon="inline-start" /> Stop</Button> : <Button onClick={() => void sendMessage()} disabled={!modelConnection || !input.trim()}><Send data-icon="inline-start" /> Send</Button>}
        </div>
      </div>
    </section>
  );
}
