# Docsy 🧠📄

**Docsy** is an intelligent research assistant that lets you chat with your documents. Upload PDFs, Word docs, and text files to create "Notebooks" and get instant, cited answers powered by AI.

## ✨ Features

- **📚 Notebook-based Workflow**: Organize your research into separate notebooks.
- **💬 Chat with Documents**: Ask questions across multiple documents simultaneously.
- **📄 Multi-Format Support**:
  - PDF (`.pdf`)
  - Word (`.docx`, `.doc`)
  - Text & Markdown (`.txt`, `.md`)
- **🌐 Web Search Integration**: Enrich your research with real-time web results alongside your private documents.
- **🔍 Vector Search**: Semantic search ensures the AI finds the most relevant context.
- **⚡ Real-time Updates**: Built on Convex for instant syncing across devices.
- **🔐 Secure Authentication**: Integrated with Clerk for robust user management.

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Backend & Database**: [Convex](https://convex.dev/)
- **Authentication**: [Clerk](https://clerk.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Vector Store**: Qdrant / Convex Vector Search
- **AI Models**: Integration with OpenAI/Anthropic via OpenRouter (planned)

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

Create a `.env.local` file in the root directory:

```bash
# Convex Deployment
CONVEX_DEPLOYMENT=your_convex_deployment_url
NEXT_PUBLIC_CONVEX_URL=your_public_convex_url

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# AI & Search (Add your API keys)
OPENROUTER_API_KEY=your_openrouter_key
TAVILY_API_KEY=your_tavily_key
```

### 4. Run the Development Server

Start the Convex backend and Next.js frontend:

```bash
bun dev
```

Visit `http://localhost:3000` to see the app.

## 🗺️ Roadmap & Future Features

- [ ] **Audio Overviews**: Generate "podcast-style" summaries of your notebooks.
- [ ] **Smart Citations**: Clickable citations that highlight the source text.
- [ ] **YouTube Support**: Add video transcripts as sources.
- [ ] **Knowledge Graph**: Visualize connections between your documents.
- [ ] **Collaborative Notebooks**: Share and edit with team members.
