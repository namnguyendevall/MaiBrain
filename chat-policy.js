const { normalizeText, tokenize } = require('./knowledge-base');

const INSTRUMENT_NAMES = {
    dan_tranh: /\b(dan tranh|zither)\b/,
    sao_truc: /\b(sao truc|thoi sao|cay sao)\b/,
    dan_bau: /\bdan bau\b/,
    trong_chau: /\btrong chau\b/,
    dan_nhi: /\bdan nhi\b/,
    dan_nguyet: /\bdan nguyet\b/,
    dan_ty_ba: /\bdan ty ba\b/,
    dan_tam: /\bdan tam\b/,
    dan_da: /\bdan da\b/,
    dan_t_rung: /\bdan t rung\b/,
    khen: /\bkhen\b/,
    cong_chieng: /\bcong chieng\b/,
    song_loan: /\bsong loan\b/,
};
const DOMAIN = /\b(nhac cu (dan toc|truyen thong)|dan nhi|dan nguyet|dan ty ba|dan tam|dan tu|dan da|dan t rung|khen|cong chieng|song loan|dan tranh|sao truc|dan bau|trong chau)\b/;
const FOLLOW_UP = /\b(ky thuat nay|nhac cu nay|bai nay|not nay|day nay|ngon nay|lo bam nay|tu the nay|luyen tap tiep|noi ro hon|giai thich them)\b/;
const MUSICAL_QUESTION = /\b(ky thuat|gay|day dan|ngon tay|am thanh|cao do|phach|nhip|lo bam|luong hoi|tu the|bao quan|a xuong|a len|song thanh)\b/;
const ATTACK = /\b(ignore|reveal|system prompt|bo qua.*(quy tac|huong dan|chi dan)|tiet lo.*(prompt|chi dan)|dong vai|gia vo)\b/;
const UNRELATED_TASK = /\b(lap trinh|python|javascript|viet code|viet ham|giai toan|phuong trinh|xin nghi phep|con meo|chung khoan|ca cuoc|chan doan|du bao thoi tiet|ke chuyen|viet truyen|viet tho|viet email|viet thu)\b/;

function resolveContext(prompt, context = {}) {
    const text = normalizeText(prompt);
    const instruments = Object.entries(INSTRUMENT_NAMES).filter(([, regex]) => regex.test(text)).map(([key]) => key);
    const explicitDomain = DOMAIN.test(text) || instruments.length > 0;
    const changesInstrument = instruments.length > 0 && (instruments.length !== 1 || instruments[0] !== context.instrument);
    return {
        ...context,
        instrument: instruments.length === 1 ? instruments[0] : (explicitDomain && instruments.length === 0 || instruments.length > 1 ? 'general' : context.instrument || 'general'),
        instruments,
        lessonCode: changesInstrument || (explicitDomain && instruments.length === 0) ? '' : context.lessonCode || '',
        levelCode: changesInstrument || (explicitDomain && instruments.length === 0) ? '' : context.levelCode || '',
    };
}

function classifyTopic(prompt, context = {}) {
    const text = normalizeText(prompt);
    if (!text) return { inScope: false, reason: 'empty_prompt' };
    if (ATTACK.test(text)) return { inScope: false, reason: 'prompt_injection' };
    if (UNRELATED_TASK.test(text)) return { inScope: false, reason: 'disallowed_topic' };
    const explicit = DOMAIN.test(text) || Object.values(INSTRUMENT_NAMES).some(regex => regex.test(text));
    const followUp = (FOLLOW_UP.test(text) || MUSICAL_QUESTION.test(text)) && Boolean(context.lessonCode || context.hasInstrumentContext);
    if (!explicit && !followUp) return { inScope: false, reason: 'disallowed_topic' };
    return { inScope: true, reason: 'instrument_topic' };
}

function sentences(text) {
    return String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map(s => s.trim()).filter(Boolean) || [];
}

// Only approved, verbatim sentences may leave the service. A model judgment
// alone cannot guarantee that generated prose stays grounded or in scope.
function validateGroundedAnswer(answer, sources) {
    const parts = sentences(answer);
    const allowed = new Set(sources.flatMap(item => sentences(item.document.content)));
    if (!parts.length || parts.some(part => !allowed.has(part))) return false;
    return true;
}

// A topical document is not enough evidence for an exact quantity. For example,
// a document mentioning flute finger holes cannot answer how many there are
// unless an approved sentence actually states a quantity.
function requiresExactQuantity(prompt) {
    return /\b(bao nhieu|may|so luong)\b/.test(normalizeText(prompt));
}

function hasDirectQuantityEvidence(prompt, sources) {
    if (!requiresExactQuantity(prompt)) return true;

    const normalizedPrompt = normalizeText(prompt);
    const queryTokens = tokenize(prompt).filter(token => !['bao', 'nhieu', 'may', 'so', 'luong'].includes(token));
    // Some target nouns (for example “dây”) are generic stop words for
    // retrieval, but they are essential when validating a quantity question.
    const countedSubjects = normalizedPrompt.split(' ').filter(token => ['lo', 'day', 'phim', 'thanh', 'trong'].includes(token));
    const quantity = '(?:\\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi(?:\\s+(?:mot|hai|ba|bon|nam|sau|bay|tam|chin))?)';
    return sources.some(({ document }) => sentences(document.content).some(sentence => {
        const normalizedSentence = normalizeText(sentence);
        // Quantity must describe the requested part of the instrument, rather
        // than an unrelated phrase such as “một dây” in a playing instruction.
        if (countedSubjects.length > 0) {
            return countedSubjects.some(subject => new RegExp(`\\b(?:co|gom|bao gom)\\s+${quantity}(?:\\s+\\w+){0,2}\\s+${subject}\\b`).test(normalizedSentence));
        }
        return queryTokens.some(token => normalizedSentence.includes(token)) && new RegExp(`\\b${quantity}\\b`).test(normalizedSentence);
    }));
}

module.exports = { resolveContext, classifyTopic, validateGroundedAnswer, hasDirectQuantityEvidence };
