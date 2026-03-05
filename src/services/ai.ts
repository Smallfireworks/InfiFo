import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;

export function getAI() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export async function analyzeContent(content: string, instruction: string): Promise<string> {
  const genAI = getAI();
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: `Content:\n${content}\n\nInstruction:\n${instruction}`,
      config: {
        systemInstruction: "You are a helpful AI assistant integrated into a personal notebook/blog. You help analyze, explain, format, and debug content. Keep your answers concise, clear, and formatted in Markdown.",
      }
    });
    return response.text || 'No response generated.';
  } catch (error: any) {
    console.error("AI Error:", error);
    return `Error generating response: ${error.message}`;
  }
}

export async function streamChat(messages: { role: 'user' | 'model', text: string }[], onChunk: (text: string) => void) {
  const genAI = getAI();
  try {
    const chat = genAI.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: "You are a helpful AI assistant integrated into a personal notebook/blog. You help analyze, explain, format, and debug content. Keep your answers concise, clear, and formatted in Markdown.",
      }
    });

    for (let i = 0; i < messages.length - 1; i++) {
        await chat.sendMessage({ message: messages[i].text });
    }

    const lastMessage = messages[messages.length - 1];
    const responseStream = await chat.sendMessageStream({ message: lastMessage.text });

    for await (const chunk of responseStream) {
      onChunk(chunk.text || '');
    }
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    onChunk(`\n\n**Error:** ${error.message}`);
  }
}
