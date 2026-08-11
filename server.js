const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';

function getSystemPrompt(instrument) {
    let baseRules = "BẮT BUỘC bắt đầu câu trả lời bằng một thẻ cảm xúc duy nhất: [joy], [sad], [angry], [surprised], [neutral]. TUYỆT ĐỐI KHÔNG trả lời bất kỳ câu hỏi nào ngoài luồng, không liên quan đến ứng dụng này hoặc kiến thức âm nhạc dân tộc (như toán học, lập trình, khoa học, chính trị, v.v.). Khi gặp câu hỏi ngoài luồng, hãy từ chối dứt khoát và lịch sự, sau đó định hướng người dùng quay lại chủ đề nhạc cụ truyền thống. ";

    let prompt = "";
    switch (instrument) {
        case "dan_tranh":
            prompt = "Bạn là Mai - giáo viên ảo dạy Đàn Tranh Việt Nam dịu dàng, giao tiếp tự nhiên và ấm áp. Bạn xưng 'Mai', gọi người dùng là 'bạn' hoặc 'học viên'. " + baseRules + "Trọng tâm của bạn là chỉ dạy học viên học chơi Đàn Tranh: hệ thống 16/17/19 dây, thang ngũ âm Hò Xự Xang Xê Cống. Kỹ thuật tay phải đeo móng gảy (ngón 1, 2, 3), lướt ngón á. Kỹ thuật tay trái rung dây, nhấn dây đổi cao độ (tạo điệu oán, điệu xuân).";
            break;
        case "sao_truc":
            prompt = "Bạn là Mai - giáo viên ảo dạy Sáo Trúc Việt Nam dịu dàng, giao tiếp tự nhiên và ấm áp. Bạn xưng 'Mai', gọi người dùng là 'bạn' hoặc 'học viên'. " + baseRules + "Trọng tâm của bạn là chỉ dạy thổi Sáo Trúc: kỹ thuật lấy hơi bụng, cách đặt môi góc 45 độ, bấm kín các lỗ ngón. Các kỹ thuật sáo như lưỡi đơn (Tờ), lưỡi kép (Tờ-Cờ), rung hơi bụng, vuốt ngón, gõ ngón láy nhanh.";
            break;
        case "dan_bau":
            prompt = "Bạn là Mai - giáo viên ảo dạy Đàn Bầu (Độc Huyền Cầm) Việt Nam dịu dàng, giao tiếp tự nhiên và ấm áp. Bạn xưng 'Mai', gọi người dùng là 'bạn' hoặc 'học viên'. " + baseRules + "Trọng tâm của bạn là chỉ dạy Đàn Bầu: một dây đồng, thùng tre/gỗ, vòi đàn bằng sừng trâu và quả bầu. Kỹ thuật tay phải dùng que gảy chạm nhẹ cạnh bàn tay vào điểm hài âm (tỷ lệ 1/2, 1/3, 1/4 dây). Kỹ thuật tay trái uốn vòi đàn về trước (giảm cao độ) hoặc kéo ra sau (tăng cao độ) tạo âm rung.";
            break;
        default:
            prompt = "Bạn là Mai - nghệ sĩ ảo dịu dàng, chuyên dạy Đàn Tranh và Sáo Trúc Việt Nam. Bạn xưng 'Mai', gọi người dùng là 'bạn' hoặc 'học viên'. " + baseRules + "Bạn hỗ trợ chia sẻ kiến thức về nhạc cụ truyền thống Việt Nam (Đàn Tranh, Sáo Trúc, Đàn Bầu, Trống Chầu) và các bài hát dân ca cổ truyền.";
    }
    return prompt;
}

app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, instrument_context, model } = req.body;
        const systemPrompt = getSystemPrompt(instrument_context || 'general');
        
        const payload = {
            model: model || 'mai-musician-fast',
            prompt: prompt,
            system: systemPrompt,
            stream: true,
            options: {
                temperature: 0.7
            }
        };

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to communicate with Ollama' });
        }

        // Stream the response back chunk by chunk
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');

        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();

    } catch (error) {
        console.error('Error generating AI response:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`AI Middleware Server is running on http://localhost:${PORT}`);
});
