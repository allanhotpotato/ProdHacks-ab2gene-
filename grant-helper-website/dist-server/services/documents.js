import mammoth from 'mammoth';
/** Extract text from PDF using unpdf (works in Node.js and serverless without DOM). */
async function extractTextFromPdf(buffer) {
    const { extractText } = await import('unpdf');
    const result = await extractText(new Uint8Array(buffer));
    const text = result.text;
    return Array.isArray(text) ? text.join('\n\n') : (text ?? '');
}
export async function extractTextFromFile(buffer, mimeType, filename) {
    if (mimeType === 'text/plain') {
        return buffer.toString('utf-8');
    }
    if (mimeType === 'application/pdf') {
        return await extractTextFromPdf(buffer);
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    }
    return `[Unsupported type ${mimeType} for ${filename}]`;
}
