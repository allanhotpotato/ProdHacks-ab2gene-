import { OPENAI_API_KEY, OPENAI_MODEL, RAG_SYSTEM_INSTRUCTION } from '../config.js';
export function buildSystemInstruction(grantContext, retrievedDocumentChunks) {
    let out = RAG_SYSTEM_INSTRUCTION;
    if (retrievedDocumentChunks?.trim()) {
        out += `Relevant excerpts from your organization's uploaded documents (retrieved for this question):\n${retrievedDocumentChunks.trim()}\n\n`;
    }
    out += `Grant opportunity (use for deadlines, eligibility, amounts, etc.):\n${grantContext}`;
    return out;
}
function isNonAutofillField(fieldKey, inputType, tagName) {
    const blockedKeys = new Set([
        'password',
        'confirm_password',
        'username',
        'birth_month',
        'birth_day',
        'unknown'
    ]);
    if (blockedKeys.has(fieldKey)) {
        return true;
    }
    return inputType === 'checkbox' || inputType === 'radio' || inputType === 'password' || tagName === 'button';
}
/** Generate one grant-application answer using Gemini from context and question. */
export async function generateAnswerForQuestion(context, question, wordLimit) {
    const instructions = RAG_SYSTEM_INSTRUCTION + (wordLimit ? ` Keep your answer within ${wordLimit} words.` : '');
    const prompt = `Context from the organization's documents and profile:\n\n${context}\n\nQuestion to answer:\n${question}\n\nProvide a direct, concise answer suitable for pasting into a grant form.`;
    return await generateModelText(instructions, prompt);
}
export async function generateAutofillAnswer(options) {
    const { organizationContext, grantContext, questionText, fieldKey, descriptor, tagName, inputType, pageTitle, pageUrl, } = options;
    if (isNonAutofillField(fieldKey, inputType, tagName)) {
        return {
            answer: '',
            confidence: 'low',
            rationale: 'Skipped because this field should not be auto-filled.',
            normalizedFieldKey: fieldKey || 'unknown',
        };
    }
    const instructions = `${RAG_SYSTEM_INSTRUCTION}

You are generating one auto-fill value for a grant portal field.
Return strict JSON only with keys: normalizedFieldKey, answer, confidence, rationale.
- normalizedFieldKey must be snake_case.
- confidence must be one of high, medium, low.
- rationale should be one short sentence.
- answer should be ready to paste into the field.
- For short text inputs, keep the answer short.
- For textarea questions, answer in one concise paragraph.
- If the field should not be auto-filled or the context is insufficient, return answer as an empty string and confidence as low.`;
    const prompt = `Field key guess: ${fieldKey || 'unknown'}
Field question or label:
${questionText}

Descriptor:
${descriptor || 'n/a'}

HTML tag / input type:
${tagName} / ${inputType}

Page title:
${pageTitle || 'n/a'}

Page URL:
${pageUrl || 'n/a'}

Grant context:
${grantContext || 'n/a'}

Organization profile context:
${organizationContext}
`;
    const raw = await generateModelText(instructions, prompt);
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        return {
            normalizedFieldKey: parsed.normalizedFieldKey?.trim() || fieldKey || 'unknown',
            answer: parsed.answer?.trim() || '',
            confidence: parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
                ? parsed.confidence
                : 'low',
            rationale: parsed.rationale?.trim() || 'No rationale returned.',
        };
    }
    catch {
        return {
            normalizedFieldKey: fieldKey || 'unknown',
            answer: cleaned,
            confidence: cleaned ? 'medium' : 'low',
            rationale: 'Model response could not be parsed as JSON, so fallback text was used.',
        };
    }
}
async function generateOpenAIText(instructions, messages) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'developer', content: instructions },
                ...messages,
            ],
        }),
    });
    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenAI request failed: ${response.status} ${errorBody}`.trim());
    }
    const json = await response.json();
    return json.choices?.[0]?.message?.content?.trim() || '';
}
export async function generateModelText(instructions, prompt, history = []) {
    const messages = [
        ...history.map((message) => ({
            role: message.role === 'model' ? 'assistant' : 'user',
            content: message.content,
        })),
        { role: 'user', content: prompt },
    ];
    return await generateOpenAIText(instructions, messages);
}
