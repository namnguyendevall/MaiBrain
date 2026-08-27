# MaiBrain - AI Middleware cho VietStage

MaiBrain kết nối VietStageApp với Ollama và giới hạn cô Mai trong phạm vi kiến thức VietStage đã được duyệt. Server sử dụng RAG: tìm tài liệu phù hợp trước, sau đó mới cho model tạo câu trả lời dựa trên tài liệu đó.

## Luồng xử lý

1. Kiểm tra request và chuẩn hóa ngữ cảnh nhạc cụ.
2. Chặn chủ đề ngoài phạm vi và yêu cầu prompt injection.
3. Tìm tài liệu trong `knowledge/*.json`.
4. Nếu không đủ liên quan, trả lời từ chối mà không gọi model sinh nội dung.
5. Nếu tìm thấy tài liệu, gửi riêng các đoạn đã duyệt cho Ollama.
6. Trả NDJSON streaming tương thích với `VietStageApp/scripts/AIManager.gd` hiện tại.

## Yêu cầu

- Node.js 18 trở lên.
- Ollama.
- Model trả lời `qwen2:1.5b` hoặc model được cấu hình trong `Modelfile`.
- Khuyến nghị model embedding `embeddinggemma`.

## Cài đặt

```bash
npm install
ollama pull qwen2:1.5b
ollama pull embeddinggemma
ollama create mai-musician-fast -f ./Modelfile
npm start
```

Server mặc định chạy tại:

```text
http://127.0.0.1:3000/api/chat
```

Kiểm tra trạng thái:

```text
GET http://127.0.0.1:3000/health
```

Nếu chưa cài model embedding, server vẫn khởi động và tự chuyển sang truy xuất từ khóa. Đây chỉ là chế độ dự phòng; môi trường triển khai nên có embedding để hiểu câu hỏi tiếng Việt linh hoạt hơn.

## Request hiện tại

Vẫn tương thích request cũ của VietStageApp:

```json
{
  "prompt": "Kỹ thuật Á xuống thực hiện như thế nào?",
  "instrument_context": "dan_tranh"
}
```

MaiBrain đã sẵn sàng nhận thêm ngữ cảnh khi VietStageApp được cập nhật:

```json
{
  "prompt": "Kỹ thuật này thực hiện như thế nào?",
  "instrumentContext": "dan_tranh",
  "levelCode": "LEVEL_2",
  "lessonCode": "DAN_TRANH_LEVEL_2_KY_THUAT_A",
  "screenContext": "lesson_theory"
}
```

Trường `model` từ client bị bỏ qua. Model được server kiểm soát bằng biến môi trường `MAI_CHAT_MODEL` để người dùng không thể chọn tùy ý model khác.

## Thêm kiến thức đã duyệt

Thêm file JSON vào thư mục `knowledge`. Mỗi file chứa một mảng tài liệu:

```json
[
  {
    "id": "DAN_TRANH_LEVEL_2_KY_THUAT_A_THEORY_01",
    "title": "Kỹ thuật Á",
    "instrument": "dan_tranh",
    "levelCode": "LEVEL_2",
    "lessonCode": "DAN_TRANH_LEVEL_2_KY_THUAT_A",
    "contentType": "theory",
    "approved": true,
    "version": 1,
    "content": "Nội dung đã được giảng viên duyệt..."
  }
]
```

Quy tắc dữ liệu:

- Chỉ tài liệu có `approved: true` mới được nạp.
- `id`, `title` và `content` là bắt buộc.
- Không đưa bài đang ẩn, nội dung nháp hoặc thông tin chưa được giảng viên duyệt vào kho.
- Khi sửa nội dung, tăng `version` để dễ kiểm soát.
- Khởi động lại MaiBrain sau khi cập nhật tài liệu.

## Cấu hình môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng MaiBrain |
| `MAI_CHAT_MODEL` | `mai-musician-fast` | Model tạo câu trả lời |
| `OLLAMA_GENERATE_URL` | `http://127.0.0.1:11434/api/generate` | API sinh nội dung |
| `OLLAMA_EMBED_URL` | `http://127.0.0.1:11434/api/embed` | API embedding |
| `OLLAMA_EMBED_MODEL` | `embeddinggemma` | Model embedding |
| `MAX_PROMPT_LENGTH` | `1200` | Số ký tự tối đa của câu hỏi |
| `OLLAMA_TIMEOUT_MS` | `90000` | Thời gian chờ Ollama |
| `DISABLE_EMBEDDINGS` | `false` | Đặt `true` để chỉ dùng tìm kiếm từ khóa |

## Kiểm thử

Các bài test không cần khởi động Ollama:

```bash
npm test
```

Bộ test kiểm tra câu hỏi VietStage, kỹ thuật Đàn Tranh, câu hỏi ngoài phạm vi và prompt injection.

## Lưu ý triển khai

Thư mục `MaiBrain` là nguồn middleware chính. Không nên tiếp tục duy trì một bản sao độc lập trong `VietStageApp/ai_server`, vì hai bản có thể lệch nhau sau các lần cập nhật.
