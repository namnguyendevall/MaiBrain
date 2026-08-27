const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionStore } = require('../session-store');
const {
    createApiKeyMiddleware,
    createRateLimitMiddleware,
    parseAllowedOrigins
} = require('../security');
const { parseModelAnswer } = require('../server');

function createMockResponse() {
    return {
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
        }
    };
}

test('session chỉ giữ số lượt hội thoại gần nhất', () => {
    const store = new SessionStore({ maxTurns: 2, maxSessions: 10, ttlMs: 60000 });
    const sessionId = 'session_12345678';
    store.addExchange(sessionId, 'câu 1', 'trả lời 1');
    store.addExchange(sessionId, 'câu 2', 'trả lời 2');
    store.addExchange(sessionId, 'câu 3', 'trả lời 3');
    const history = store.getHistory(sessionId);
    assert.equal(history.length, 2);
    assert.equal(history[0].user, 'câu 2');
    assert.equal(history[1].assistant, 'trả lời 3');
});

test('session hết hạn bị xóa', () => {
    const store = new SessionStore({ ttlMs: 10 });
    const sessionId = 'session_expired_01';
    store.addExchange(sessionId, 'câu hỏi', 'trả lời');
    store.sessions.get(sessionId).updatedAt = Date.now() - 100;
    store.pruneExpired();
    assert.deepEqual(store.getHistory(sessionId), []);
});

test('sessionId không hợp lệ không được lưu', () => {
    const store = new SessionStore();
    assert.equal(store.addExchange('bad id', 'a', 'b'), false);
    assert.equal(store.sessions.size, 0);
});

test('tách thẻ cảm xúc khỏi nội dung model', () => {
    assert.deepEqual(parseModelAnswer('[joy] Bạn đã thực hiện đúng kỹ thuật Á.'), {
        emotion: 'joy',
        answer: 'Bạn đã thực hiện đúng kỹ thuật Á.'
    });
    assert.deepEqual(parseModelAnswer('Câu trả lời không có thẻ.'), {
        emotion: 'neutral',
        answer: 'Câu trả lời không có thẻ.'
    });
});

test('API key chỉ bị bắt buộc khi server có cấu hình', () => {
    let nextCalled = false;
    const openMiddleware = createApiKeyMiddleware('', () => assert.fail('không được từ chối'));
    openMiddleware({ get: () => '' }, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    let rejectedStatus = 0;
    const protectedMiddleware = createApiKeyMiddleware('secret', (_req, _res, status) => {
        rejectedStatus = status;
    });
    protectedMiddleware({ get: () => '' }, {}, () => assert.fail('không được cho qua'));
    assert.equal(rejectedStatus, 401);
});

test('rate limit chặn request vượt giới hạn', () => {
    let rejectedStatus = 0;
    let accepted = 0;
    const middleware = createRateLimitMiddleware(
        { windowMs: 60000, maxRequests: 2 },
        (_req, _res, status) => { rejectedStatus = status; }
    );
    const request = { ip: '127.0.0.1', socket: {} };
    middleware(request, createMockResponse(), () => { accepted += 1; });
    middleware(request, createMockResponse(), () => { accepted += 1; });
    middleware(request, createMockResponse(), () => { accepted += 1; });
    assert.equal(accepted, 2);
    assert.equal(rejectedStatus, 429);
});

test('CORS origins được đọc từ danh sách cấu hình', () => {
    assert.equal(parseAllowedOrigins('*'), '*');
    const origins = parseAllowedOrigins('https://vietstage.vn, https://admin.vietstage.vn');
    assert.equal(origins.has('https://vietstage.vn'), true);
    assert.equal(origins.has('https://other.example'), false);
});
