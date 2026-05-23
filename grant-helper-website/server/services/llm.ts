import { OPENAI_API_KEY, OPENAI_MODEL, RAG_SYSTEM_INSTRUCTION } from '../config.js';

export function buildSystemInstruction(
  grantContext: string,
  retrievedDocumentChunks?: string
): string {
  let out = RAG_SYSTEM_INSTRUCTION;
  if (retrievedDocumentChunks?.trim()) {
    out += `Relevant excerpts from your organization's uploaded documents (retrieved for this question):\n${retrievedDocumentChunks.trim()}\n\n`;
  }
  out += `Grant opportunity (use for deadlines, eligibility, amounts, etc.):\n${grantContext}`;
  return out;
}

async function generateOpenAIText(
  instructions: string,
  messages: Array<{ role: 'developer' | 'user' | 'assistant'; content: string }>
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'developer', content: instructions }, ...messages],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed: ${response.status} ${errorBody}`.trim());
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content?.trim() || '';
}

export async function generateModelText(
  instructions: string,
  prompt: string,
  history: Array<{ role: 'user' | 'model'; content: string }> = []
): Promise<string> {
  const messages = [
    ...history.map((message) => ({
      role: message.role === 'model' ? ('assistant' as const) : ('user' as const),
      content: message.content,
    })),
    { role: 'user' as const, content: prompt },
  ];
  return await generateOpenAIText(instructions, messages);
}

export { generateOpenAIText };
