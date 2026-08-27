const fs = require('fs');
const path = require('path');

const DEFAULT_EMBED_URL = 'http://127.0.0.1:11434/api/embed';
const DEFAULT_EMBED_MODEL = 'embeddinggemma';

const STOP_WORDS = new Set([
    'a', 'ai', 'bi', 'ban', 'bang', 'cach', 'cac', 'cho', 'co', 'cua', 'da',
    'day', 'de', 'duoc', 'gi', 'hay', 'hoi', 'hoc', 'khi', 'khong', 'la', 'lam',
    'mai', 'mot', 'nao', 'nay', 'nhu', 'nhung', 'noi', 'o', 'phai', 'qua',
    'sao', 'se', 'the', 'thi', 'trong', 'tu', 'va', 've', 'voi'
]);

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(value) {
    const original = String(value || '');
    const tokens = normalizeText(original)
        .split(' ')
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
    // "Á" là tên kỹ thuật Đàn Tranh nhưng sau khi bỏ dấu sẽ thành từ dừng "a".
    // Giữ riêng từ Á đứng độc lập để fallback từ khóa vẫn truy xuất đúng bài.
    if (/(^|\s)á(?=\s|$|[.,;:!?])/iu.test(original)) {
        tokens.push('technique_a');
    }
    return tokens;
}

function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
        return 0;
    }

    let dot = 0;
    let leftLength = 0;
    let rightLength = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftLength += left[index] * left[index];
        rightLength += right[index] * right[index];
    }

    if (leftLength === 0 || rightLength === 0) return 0;
    return dot / (Math.sqrt(leftLength) * Math.sqrt(rightLength));
}

function lexicalSimilarity(query, document) {
    const queryTokens = new Set(tokenize(query));
    const documentTokens = new Set(tokenize(document));
    if (queryTokens.size === 0 || documentTokens.size === 0) return 0;

    let overlap = 0;
    for (const token of queryTokens) {
        if (documentTokens.has(token)) overlap += 1;
    }

    const queryCoverage = overlap / queryTokens.size;
    const documentCoverage = overlap / documentTokens.size;
    return queryCoverage * 0.85 + documentCoverage * 0.15;
}

class KnowledgeBase {
    constructor(options = {}) {
        this.knowledgeDirectory = options.knowledgeDirectory || path.join(__dirname, 'knowledge');
        this.embedUrl = options.embedUrl || process.env.OLLAMA_EMBED_URL || DEFAULT_EMBED_URL;
        this.embedModel = options.embedModel || process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL;
        this.documents = [];
        this.embeddingAvailable = false;
    }

    async initialize() {
        this.documents = this.loadApprovedDocuments();
        if (this.documents.length === 0) {
            throw new Error('Không tìm thấy tài liệu VietStage đã được duyệt trong thư mục knowledge.');
        }

        if (process.env.DISABLE_EMBEDDINGS === 'true') {
            console.warn('[MaiBrain] Embedding đã tắt; đang dùng truy xuất từ khóa cục bộ.');
            return;
        }

        try {
            const embeddings = await this.embed(this.documents.map((document) => document.searchText));
            this.documents.forEach((document, index) => {
                document.embedding = embeddings[index];
            });
            this.embeddingAvailable = embeddings.length === this.documents.length;
            console.log(`[MaiBrain] Đã lập chỉ mục ${this.documents.length} tài liệu bằng ${this.embedModel}.`);
        } catch (error) {
            this.embeddingAvailable = false;
            console.warn(`[MaiBrain] Không dùng được embedding (${error.message}). Chuyển sang truy xuất từ khóa.`);
        }
    }

    loadApprovedDocuments() {
        if (!fs.existsSync(this.knowledgeDirectory)) return [];

        const documents = [];
        const files = fs.readdirSync(this.knowledgeDirectory).filter((file) => file.endsWith('.json'));
        for (const file of files) {
            const fullPath = path.join(this.knowledgeDirectory, file);
            const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (!Array.isArray(parsed)) {
                throw new Error(`${file} phải chứa một mảng tài liệu.`);
            }

            for (const item of parsed) {
                if (!item || item.approved !== true) continue;
                if (!item.id || !item.title || !item.content) {
                    throw new Error(`${file} có tài liệu thiếu id, title hoặc content.`);
                }

                const instrument = normalizeText(item.instrument || 'general').replace(/-/g, '_');
                const document = {
                    ...item,
                    instrument,
                    levelCode: String(item.levelCode || '').toUpperCase(),
                    lessonCode: String(item.lessonCode || '').toUpperCase(),
                    sourceFile: file,
                    embedding: null
                };
                document.searchText = [
                    document.title,
                    document.content,
                    document.instrument,
                    document.levelCode,
                    document.lessonCode,
                    document.contentType,
                    Array.isArray(document.keywords) ? document.keywords.join(' ') : ''
                ].join(' ');
                documents.push(document);
            }
        }

        return documents;
    }

    async embed(input) {
        const response = await fetch(this.embedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.embedModel, input })
        });

        if (!response.ok) {
            throw new Error(`Ollama embed trả HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!Array.isArray(payload.embeddings)) {
            throw new Error('Ollama embed không trả embeddings hợp lệ');
        }
        return payload.embeddings;
    }

    async retrieve(query, context = {}) {
        const instrument = normalizeText(context.instrument || 'general').replace(/-/g, '_');
        const lessonCode = String(context.lessonCode || '').toUpperCase();
        const levelCode = String(context.levelCode || '').toUpperCase();
        const candidates = this.documents.filter((document) => (
            document.instrument === 'general' ||
            instrument === 'general' ||
            document.instrument === instrument
        ));

        let queryEmbedding = null;
        if (this.embeddingAvailable) {
            try {
                [queryEmbedding] = await this.embed([query]);
            } catch (error) {
                console.warn(`[MaiBrain] Lỗi embedding câu hỏi: ${error.message}`);
            }
        }

        const ranked = candidates.map((document) => {
            const lexicalScore = lexicalSimilarity(query, document.searchText);
            const semanticScore = queryEmbedding && document.embedding
                ? Math.max(0, cosineSimilarity(queryEmbedding, document.embedding))
                : 0;
            const instrumentBoost = instrument !== 'general' && document.instrument === instrument ? 0.06 : 0;
            // Ngữ cảnh bài học phải ưu tiên hơn câu hỏi rút gọn như
            // "kỹ thuật này", vốn giống nhiều tài liệu về mặt từ khóa.
            const lessonBoost = lessonCode && document.lessonCode === lessonCode ? 0.5 : 0;
            const levelBoost = levelCode && document.levelCode === levelCode ? 0.04 : 0;
            const combinedScore = queryEmbedding
                ? semanticScore * 0.78 + lexicalScore * 0.22 + instrumentBoost + lessonBoost + levelBoost
                : lexicalScore + instrumentBoost + lessonBoost + levelBoost;

            return {
                document,
                score: Math.min(1, combinedScore),
                lexicalScore,
                semanticScore
            };
        }).sort((left, right) => right.score - left.score);

        return ranked.slice(0, Number(context.topK || 4));
    }
}

module.exports = {
    KnowledgeBase,
    cosineSimilarity,
    lexicalSimilarity,
    normalizeText,
    tokenize
};
