# Docsy 🧠📄

**Docsy** is an intelligent research assistant that lets you chat with your documents. Upload PDFs, Word docs, and text files to create "Notebooks" and get instant, cited answers powered by AI.

## ✨ Features

- **📚 Notebook-based Workflow**: Organize your research into separate notebooks.
- **💬 Chat with Documents**: Ask questions across multiple documents simultaneously.
- **💾 Persistent Conversations**: Chat history is automatically saved to the database, so you never lose your context.
- **🤖 Advanced Model Selection**: Choose from **20+ top-tier AI models** (Gemini, Llama 3, Claude 3.5, DeepSeek, etc.) including many **free options**.
- **📄 Multi-Format Support**:
  - PDF (`.pdf`)
  - Word (`.docx`, `.doc`)
  - Text & Markdown (`.txt`, `.md`)
- **🔍 Vector Search**: Semantic search over your sources, with inline `[1]` citations that open the cited passage.
- **🎙️ Audio Overviews**: Podcast-style narration of a notebook's sources.
- **⚡ Real-time Updates**: Built on Convex for instant syncing across devices.
- **🔐 Secure Authentication**: Integrated with Clerk for robust user management.

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Backend & Database**: [Convex](https://convex.dev/)
- **Authentication**: [Clerk](https://clerk.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **AI Models**: [OpenRouter](https://openrouter.ai/) (Gemini, Meta, Anthropic, Mistral, etc.) — the catalogue is fetched live, not hardcoded
- **Embeddings**: [Google Gemini](https://ai.google.dev/) (`gemini-embedding-001`, 768 dims)
- **Vector Store**: [Qdrant](https://qdrant.tech/)
- **Text-to-Speech**: [ElevenLabs](https://elevenlabs.io/) (audio overviews)
- **Web Search**: [Tavily](https://tavily.com/) or [Serper](https://serper.dev/)

Retrieval, audio overviews and web search each need their own key. Without them
those features are unavailable — see `.env.example` for what breaks without what.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/docsy.git
cd docsy
```

### 2. Install dependencies

```bash
bun install
```

### 3. Set up Environment Variables

```bash
cp .env.example .env.local
```

`.env.example` lists every variable and what breaks without it. The Clerk pair is
the only one required to boot — the server refuses to start without it and names
what is missing. Everything else disables a feature rather than the app.

⚠️ **Four more variables live on the Convex deployment, not in `.env.local`** —
Convex functions read their own environment:

```bash
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev
bunx convex env set CLERK_WEBHOOK_SECRET whsec_...
bunx convex env set QDRANT_URL https://...
bunx convex env set QDRANT_API_KEY ...
```

You also need, in the Clerk Dashboard, a JWT template named exactly `convex` and
a webhook pointed at `https://<deployment>.convex.site/clerk-webhook` (`.site`,
not `.cloud`) for `user.created` / `user.updated` / `user.deleted`. **Without the
webhook no user record is ever created and nobody can use the app.** Each of
these fails silently and differently; `.env.example` has the symptom table.

### 4. Run the Development Server

Two terminals — the app is non-functional without the Convex backend:

```bash
bunx convex dev
```

```bash
bun dev
```

Visit `http://localhost:3000` to see the app.
