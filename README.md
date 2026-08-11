# MaiBrain - AI Middleware Server

Đây là hệ thống Server Trung Gian (Middleware) dành cho ứng dụng VietStage, giúp xử lý các luật (System Rules) cho nghệ sĩ ảo Cô Mai và kết nối trực tiếp với **Ollama**.

## 1. Yêu cầu hệ thống
Để chạy được hệ thống này, máy của bạn hoặc máy chủ (Server/VPS) cần cài đặt sẵn:
1. [Node.js](https://nodejs.org/) (Phiên bản v18 trở lên).
2. [Ollama](https://ollama.com/) (Để chạy Local AI Model).

## 2. Cài đặt Ollama & Model AI
Sau khi cài đặt Ollama, bạn cần tải về bộ não (model) mà ứng dụng đang sử dụng. 
Mở Terminal (hoặc Command Prompt) và chạy lệnh sau (nếu bạn sử dụng model gốc hoặc custom model đã được push lên library):

```bash
# Lệnh tải model (Ví dụ với model Qwen2 1.5B mà app đang dựa vào)
ollama run qwen2:1.5b
```

> **Lưu ý quan trọng**: App hiện tại đang gọi tới tên model là `mai-musician-fast`. Nếu đây là model bạn tự tuỳ chỉnh (bằng Modelfile) từ `qwen2:1.5b`, người khác sẽ cần file `Modelfile` đó để build lại trên máy họ bằng lệnh: 
> `ollama create mai-musician-fast -f ./Modelfile`

## 3. Khởi động AI Middleware Server
1. Clone hoặc tải mã nguồn thư mục này về máy.
2. Mở Terminal tại thư mục chứa mã nguồn (nơi có file `server.js`).
3. Cài đặt các thư viện Node.js cần thiết:
```bash
npm install
```
4. Khởi động Server:
```bash
npm start
```
> Server sẽ mặc định chạy ở cổng **3000**: `http://localhost:3000/api/chat`

## 4. Tích hợp vào Frontend (Godot App)
Sau khi Server Node.js đã chạy báo `AI Middleware Server is running`, bạn chỉ cần vào mã nguồn Game Godot, đảm bảo `AIManager.gd` đang trỏ đúng về địa chỉ Middleware:
```gdscript
@export var api_url: String = "http://127.0.0.1:3000/api/chat"
```
Mọi thứ đã sẵn sàng để sử dụng!
