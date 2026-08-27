function parseAllowedOrigins(value) {
    const raw = String(value || '*').trim();
    if (!raw || raw === '*') return '*';
    return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}

function createCorsOptions(value) {
    const allowedOrigins = parseAllowedOrigins(value);
    if (allowedOrigins === '*') return { origin: true };

    return {
        origin(origin, callback) {
            // Godot native requests generally do not send a browser Origin header.
            if (!origin || allowedOrigins.has(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Origin không được MaiBrain cho phép.'));
        }
    };
}

function createApiKeyMiddleware(apiKey, onRejected) {
    const expected = String(apiKey || '');
    return (req, res, next) => {
        if (!expected) {
            next();
            return;
        }

        const directKey = String(req.get('x-maibrain-key') || '');
        const authorization = String(req.get('authorization') || '');
        const bearerKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        if (directKey === expected || bearerKey === expected) {
            next();
            return;
        }
        onRejected(req, res, 401, 'Thiếu hoặc sai khóa truy cập MaiBrain.');
    };
}

function createRateLimitMiddleware(options, onRejected) {
    const windowMs = Number(options.windowMs || 60000);
    const maxRequests = Number(options.maxRequests || 40);
    const clients = new Map();

    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        const current = clients.get(key);
        const bucket = !current || now >= current.resetAt
            ? { count: 0, resetAt: now + windowMs }
            : current;
        bucket.count += 1;
        clients.set(key, bucket);

        res.setHeader('X-RateLimit-Limit', String(maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count > maxRequests) {
            onRejected(req, res, 429, 'Bạn gửi câu hỏi quá nhanh. Vui lòng chờ một chút rồi thử lại.');
            return;
        }
        next();
    };
}

module.exports = {
    createApiKeyMiddleware,
    createCorsOptions,
    createRateLimitMiddleware,
    parseAllowedOrigins
};
