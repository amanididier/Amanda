import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Square } from "lucide-react";
import { useRef, useState } from "react";

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
  const abortRef = useRef<AbortController | null>(null);

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
            { role: "system", content: "You are Amanda, a private assistant. This is a temporary conversation. Answer clearly and do not claim to save anything." },
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Temporary chat</p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight">A conversation that stays private.</h1>
          <p className="mt-2 text-sm text-muted-foreground">This chat is held in memory only and is not written to Amanda’s local database.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Exit temporary chat"><ArrowLeft /></Button>
      </div>
      <div className="max-h-[52vh] min-h-24 space-y-4 overflow-y-auto py-4" role="log" aria-live="polite">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ask a quick question without saving this conversation.</p>}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted"}`}>{message.content}</div>
        ))}
        {(sending || streamed) && <div className="mr-auto max-w-[90%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-sm">{streamed || "Thinking…"}</div>}
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask Amanda anything…" className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" disabled={!modelConnection || sending} />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{modelConnection ? "Temporary · not saved to this device" : "Load the local model in Settings to start chatting."}</p>
          {sending ? <Button variant="outline" onClick={() => abortRef.current?.abort()}><Square data-icon="inline-start" /> Stop</Button> : <Button onClick={() => void sendMessage()} disabled={!modelConnection || !input.trim()}><Send data-icon="inline-start" /> Send</Button>}
        </div>
      </div>
    </section>
  );
}
