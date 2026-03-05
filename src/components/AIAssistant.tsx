import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { streamChat } from '../services/ai';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface AIAssistantProps {
  context: { text: string, type: 'block' | 'selection' } | null;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

export function AIAssistant({ context, onClose }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (context) {
      setMessages([
        { role: 'model', text: `I see you selected a ${context.type}. How can I help you with this content?\n\n> ${context.text.split('\n').slice(0, 3).join('\n> ')}${context.text.split('\n').length > 3 ? '\n> ...' : ''}` }
      ]);
    }
  }, [context]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', text: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    setMessages(prev => [...prev, { role: 'model', text: '' }]);

    let currentResponse = '';

    let prompt = userMessage;
    if (newMessages.length === 2 && context) {
      prompt = `Context:\n${context.text}\n\nQuestion:\n${userMessage}`;
    }

    const messagesToSend: Message[] = newMessages.map(m => m.role === 'user' && m === newMessages[newMessages.length - 1] ? { role: 'user', text: prompt } : m);

    await streamChat(messagesToSend, (chunk) => {
      currentResponse += chunk;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].text = currentResponse;
        return updated;
      });
    });

    setIsLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--color-paper)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-ink)]/10">
        <div className="flex items-center gap-2 text-[var(--color-accent-blue)]">
          <Sparkles size={20} />
          <h2 className="font-hand text-2xl font-bold">AI Assistant</h2>
        </div>
        <button onClick={onClose} className="p-1 text-[var(--color-ink)]/60 hover:text-[var(--color-ink)] transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !context && (
          <div className="text-center text-[var(--color-ink-light)] mt-10 font-hand text-xl">
            Select a block or text to get started, or just ask a question.
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user' 
                ? 'bg-[var(--color-ink)] text-[var(--color-paper)] rounded-tr-sm' 
                : 'bg-white/50 border border-[var(--color-ink)]/10 rounded-tl-sm text-[var(--color-ink)]'
            }`}>
              <div className="markdown-body text-sm">
                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {msg.text || (isLoading && i === messages.length - 1 ? '...' : '')}
                </Markdown>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[var(--color-ink)]/10 bg-white/30">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="w-full bg-white/50 border border-[var(--color-ink)]/20 rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]/50 transition-shadow"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[var(--color-accent-blue)] text-white rounded-full disabled:opacity-50 disabled:bg-[var(--color-ink)]/20 transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
