class SessionStore {
    constructor(options = {}) {
        this.maxSessions = Number(options.maxSessions || 500);
        this.maxTurns = Number(options.maxTurns || 6);
        this.ttlMs = Number(options.ttlMs || 30 * 60 * 1000);
        this.sessions = new Map();
    }

    isValidSessionId(sessionId) {
        return typeof sessionId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(sessionId);
    }

    getHistory(sessionId) {
        if (!this.isValidSessionId(sessionId)) return [];
        this.pruneExpired();
        const session = this.sessions.get(sessionId);
        if (!session) return [];
        session.updatedAt = Date.now();
        return session.turns.map((turn) => ({ ...turn }));
    }

    addExchange(sessionId, userMessage, assistantMessage) {
        if (!this.isValidSessionId(sessionId)) return false;
        this.pruneExpired();

        const session = this.sessions.get(sessionId) || { turns: [], updatedAt: Date.now() };
        session.turns.push({
            user: String(userMessage || '').slice(0, 1200),
            assistant: String(assistantMessage || '').slice(0, 2400)
        });
        session.turns = session.turns.slice(-this.maxTurns);
        session.updatedAt = Date.now();
        this.sessions.delete(sessionId);
        this.sessions.set(sessionId, session);

        while (this.sessions.size > this.maxSessions) {
            const oldestSessionId = this.sessions.keys().next().value;
            this.sessions.delete(oldestSessionId);
        }
        return true;
    }

    clear(sessionId) {
        if (!this.isValidSessionId(sessionId)) return false;
        return this.sessions.delete(sessionId);
    }

    pruneExpired(now = Date.now()) {
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.updatedAt > this.ttlMs) {
                this.sessions.delete(sessionId);
            }
        }
    }
}

module.exports = { SessionStore };
