const { normalizeText } = require('./knowledge-base');

const ALLOWED_INSTRUMENTS = new Set(['general', 'dan_tranh', 'sao_truc', 'dan_bau', 'trong_chau']);

const OUT_OF_SCOPE_PATTERNS = [
    /\b(code|python|javascript|typescript|java|c\+\+|html|css|sql|database|github|git|compiler)\b/,
    /\b(lap trinh|viet ham|thuat toan|website|phan mem)\b/,
    /\b(phuong trinh|tich phan|dao ham|giai toan|hoa hoc|vat ly)\b/,
    /\b(chinh tri|chung khoan|tien ao|ca cuoc|thuoc dieu tri|chan doan benh)\b/,
    /\b(thoi tiet|bong da|nau an|du lich)\b/
];

const PROMPT_INJECTION_PATTERNS = [
    /bo qua (tat ca |toan bo )?(chi dan|huong dan|quy tac)/,
    /quen (tat ca |toan bo )?(chi dan|huong dan|quy tac)/,
    /tiet lo (system prompt|prompt he thong|chi dan he thong)/,
    /in (system prompt|prompt he thong)/,
    /gia vo (ban|mai) la/,
    /dong vai (mot )?(tro ly|lap trinh vien|bac si)/,
    /ignore (all |previous )?(instructions|rules)/,
    /reveal (the )?(system prompt|instructions)/
];

function sanitizeInstrument(value) {
    const normalized = normalizeText(value || 'general').replace(/-/g, '_');
    return ALLOWED_INSTRUMENTS.has(normalized) ? normalized : 'general';
}

function containsPattern(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

function assessScope(prompt, retrieval, options = {}) {
    const normalizedPrompt = normalizeText(prompt);
    if (!normalizedPrompt) return { inScope: false, reason: 'empty_prompt' };
    if (containsPattern(normalizedPrompt, PROMPT_INJECTION_PATTERNS)) {
        return { inScope: false, reason: 'prompt_injection' };
    }
    if (containsPattern(normalizedPrompt, OUT_OF_SCOPE_PATTERNS)) {
        return { inScope: false, reason: 'disallowed_topic' };
    }

    const best = retrieval[0];
    if (!best) return { inScope: false, reason: 'no_knowledge' };

    const hasLessonContext = Boolean(options.lessonCode);
    const threshold = options.embeddingAvailable ? 0.42 : 0.12;
    const contextualThreshold = hasLessonContext ? Math.min(threshold, 0.14) : threshold;
    if (best.score < contextualThreshold) {
        return { inScope: false, reason: 'low_relevance', score: best.score };
    }

    return { inScope: true, reason: 'approved_knowledge_found', score: best.score };
}

module.exports = {
    ALLOWED_INSTRUMENTS,
    OUT_OF_SCOPE_PATTERNS,
    PROMPT_INJECTION_PATTERNS,
    assessScope,
    sanitizeInstrument
};
