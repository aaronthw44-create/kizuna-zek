# Kizuna-Zek AI Studio (Kizu) 🌌✍️

[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Alibaba Cloud Model Studio](https://img.shields.io/badge/Alibaba_Cloud-Model_Studio-FF6A00?style=for-the-badge&logo=alibabacloud&logoColor=white)](https://www.alibabacloud.com/help/en/model-studio)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

> **Languages**: [English](README.md) | [Español](README.es.md)

**Kizuna-Zek AI Studio** (shortened as **"Kizu"**) is a high-performance AI-assisted writing platform designed for crafting complex psychological light novels, dark fantasy serials, and real-time Lore management.

---

## 🌐 Live Production & Custom Domain

* **Primary Custom Domain**: [https://kizu.steycopstudios.com](https://kizu.steycopstudios.com)
* **Startup Showcase Landing Page**: [https://kizu.steycopstudios.com?view=landing](https://kizu.steycopstudios.com?view=landing)

---

## 🚀 Alibaba Cloud AI Catalyst Program Candidate

Kizuna-Zek is architected for the **Alibaba Cloud AI Catalyst Program ($120k Grant Application)**.

* **Primary Engine**: Alibaba Cloud Model Studio (`qwen3.8-max` via OpenAI-compatible SSE proxy).
* **Secondary Engine**: Google Gemini API (`gemini-3.6-flash`).
* **Fallback Engine**: NVIDIA NIM Microservices (`stepfun-ai/step-5-preview`).
* **Landing Page & Showcase**: Built-in full-page interactive showcase at `?view=landing`.

---

## 💡 Etymology & Vision

The name combines **"Kizuna"** (絆 - *indelible bond/anchor*) with the surname of the story's main protagonist, **Kolder Zekshoyu**. Additionally, the abbreviation **"Kizu"** (傷 - *wound* in Japanese) symbolizes the narrative's core focus on psychological drama, limb-system trauma, and resilience.

---

## ✨ Key Capabilities & Features

### 1. Dual-Engine & Resilient Auto-Router
* **Zero-Downtime Switching**: Automatically failovers between Alibaba Cloud Model Studio, Google Gemini, and NVIDIA NIM if rate-limits or latency spikes occur.
* **Deep Thinking CoT Visualization**: Captures internal reasoning blocks (*Chain-of-Thought*) with a visual indicator ("💧 Pensado durante..."), collapsed by default for a pristine reading canvas.

### 2. 2K Token Shield & Smart Context Optimization
* **Smart Context Window**: Compresses lore and chapter memories to a tight ~2,000 token footprint, preserving context quality while minimizing billing costs.
* **SSE Stream Sanitization**: Real-time buffer cleaning against orphaned stop-tokens (`<`, `<|im_end|>`).

### 3. Zero-Copy 8K Vision & Video Storyboard Engine
* **Client-Side 8K Adaptive Canvas Compressor**: Downscales 4K/8K/200MP photos via zero-copy `ObjectURL` with progressive 2x mipmapping and Vision Transformer (ViT 28x28) patch-grid alignment, keeping payload sizes < 750 KB without blur or API 413 errors.
* **Universal 4-Frame Video Storyboard Extractor**: Decodes MP4/WebM/MOV files locally using the device's hardware GPU video decoder (`MediaCodec` / `VideoToolbox`), extracting 4 chronological keyframes (#1 @ 8%, #2 @ 36%, #3 @ 64%, #4 @ 92%) into a single HD 2×2 grid (< 680 KB). Allows **Qwen3.8-Max, Qwen-VL, Gemini & Kimi** to analyze full video sequences with zero server video uploading and minimal token cost (~1,200 tokens).

### 4. OpenWebUI Dark Noir Design System
* **Default Noir Dark Theme** (`#09090b`) with Day/Night UI toggle.
* **Mobile-First UX**: Minimum 44×44px touch targets and mobile auto-zoom prevention (`text-[16px] md:text-sm`).

### 5. Canon Lore Manager & EPUB Export
* **Interactive Lore Library**: Real-time management of character sheets, somatic items, and locations.
* **Editorial Suite**: Direct EPUB ebook export, Google Drive sync, and real-time Firestore cloud backup.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Motion.
* **Backend Proxy / Server**: Node.js, Express, TSX, `@google/genai`, `openai` SDK.
* **Database & Auth**: IndexedDB (local persistence), Firebase Firestore, Google Drive API.

---

## ⚡ Getting Started (Installation & Setup)

### Prerequisites

* Node.js (v18.0.0 or higher)
* npm or pnpm or bun

### 1. Clone the Repository

```bash
git clone https://github.com/aaronthw44-create/kizuna-zek-workspace.git
cd kizuna-zek-workspace
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Fill in your API keys in `.env`:

```env
DASHSCOPE_API_KEY=your_dashscope_api_key
DASHSCOPE_BASE_URL=https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
GEMINI_API_KEY=your_gemini_api_key
NVIDIA_API_KEY=your_nvidia_api_key
PORT=3000
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production Build

```bash
npm run build
npm start
```

---

## 📂 Project Structure

```text
├── src/
│   ├── components/
│   │   ├── CompanyLandingModal.tsx  # Alibaba Catalyst Showcase & Full-Page Landing
│   │   ├── ChatMessage.tsx         # CoT Reasoning Process & Text Renderer
│   │   ├── ChatHeader.tsx          # Dual-Engine Model Router
│   │   ├── Sidebar.tsx             # Navigation & Lore Manager
│   │   └── SettingsModal.tsx       # Custom API keys & Endpoint Config
│   ├── utils/
│   │   ├── autoRouter.ts           # Automatic Failover & Engine Routing
│   │   └── directApiStream.ts      # SSE Streaming & Token Sanitizer
│   ├── App.tsx                     # React 19 Root Layout & State Manager
│   └── main.tsx                    # React 19 Entry Point
├── server.ts                       # Express Proxy Server (DashScope & Gemini)
├── .env.example                    # Environment Variables Template
└── README.md                       # Main Documentation
```

---

## 📸 Interface & Landing Screenshots

| Custom Domain Landing Page | Workspace Writing Interface |
| :---: | :---: |
| ![Landing Page](public/assets/aistudio/Screenshot_20261026_181825_Chrome_05210a99.jpg) | ![Workspace Interface](public/assets/aistudio/Screenshot_20261026_080521_Samsung_Browser_cdf99ef4.jpg) |

---

© 2026 Kizuna-Zek AI Studio. All rights reserved. Built for creators and psychological drama literature.
