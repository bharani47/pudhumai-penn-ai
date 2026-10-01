# Pudhumai Penn AI Navigator - PromptWars Submission

## 🎯 Problem Addressed
In India, 48% of rural girls have never used the internet. This project addresses the PromptWars challenge by providing a zero-barrier, native-language interface for first-time women users to access essential government schemes.

## 🛠 Technical Implementation (Server-Side Proxy)
- **Framework:** Next.js 14 (App Router)
- **AI Integration:** Google Gemini API (`gemini-3.8-flash` via `@google/genai` ≥ 2.3.0)
- **Firewall Bypass Architecture:** To ensure rural accessibility even on restricted networks, Gemini API calls are securely routed through serverless Next.js API endpoints (`/api/chat`), preventing client-side CORS or proxy firewall blocking.
- **Language:** Native Tamil processing via Gemini.

## 📁 Project Structure
```
pudhumai-penn-ai/
├── app/
│   ├── globals.css          # Tailwind directives, zero boilerplate
│   ├── layout.tsx           # Root layout — lang="ta", PWA metadata
│   ├── page.tsx             # Mobile-first chat UI (Client Component)
│   └── api/
│       └── chat/
│           └── route.ts     # POST /api/chat — Gemini server proxy
├── public/
│   └── manifest.json        # PWA manifest (installable on Android/iOS)
├── .env.local.example       # API key template
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## 🚀 Quick Start

### 1. Clone and install
```bash
git clone <repo-url>
cd pudhumai-penn-ai
npm install
```

### 2. Set your API key
```bash
cp .env.local.example .env.local
# Edit .env.local and replace the placeholder with your real key
```

### 3. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

### 4. Deploy to Vercel
```bash
npx vercel --prod
# Add NEXT_PUBLIC_GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables
```

## 🔐 Security
- The Gemini API key **never reaches the browser** — it is consumed exclusively inside the Next.js serverless function (`route.ts`).
- `NEXT_PUBLIC_GEMINI_API_KEY` is intentionally server-side only in `route.ts` (via `process.env`).  
  The `NEXT_PUBLIC_` prefix is kept to match the exact specification in the brief; in production, rename it to `GEMINI_API_KEY` for stricter secret hygiene.
- `.gitignore` excludes `.env*.local` preventing accidental key commits.

## 🌍 SDG Alignment
- **Goal 4:** Quality Education (Promoting the Pudhumai Penn higher education scheme)
- **Goal 5:** Gender Equality (Removing digital barriers for women)
- **Goal 10:** Reduced Inequalities (Zero-UI design for tech-illiterate users)

## ♿ Accessibility Highlights
| Feature | Implementation |
|---|---|
| Screen reader announcements | `aria-live="polite"` on chat container |
| Labelled form controls | `<label>` + `htmlFor`, `aria-label` on button |
| Keyboard navigation | Native `<form>` submit, no JS-only traps |
| High-contrast colours | Green-600 (#16a34a) on white — WCAG AA |
| Disabled state | `disabled` attribute on input & button during loading |

## 📱 Progressive Web App
`public/manifest.json` enables "Add to Home Screen" prompts on Android Chrome and iOS Safari, giving first-time users a native-app experience with **zero data cost** beyond the initial load.

## 🤖 AI System Prompt
```
You are an empathetic, highly simplified AI assistant for rural Indian women.
Your only goal is to guide them to the 'Pudhumai Penn' higher education financial scheme.
You must reply ONLY in simple Tamil.
Assume the user has zero technical knowledge.
Keep answers under 3 sentences.
```

## 🚀 Deployment
Fully deployed via Vercel. Repository maintained entirely under 10 MB to ensure rapid cloning and deployment in low-bandwidth environments.
