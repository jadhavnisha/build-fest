# 🤖 RAG Chatbot - Offline with Ollama

A complete **Retrieval-Augmented Generation (RAG)** chatbot system that runs **100% offline** using local models via Ollama. No cloud APIs, no OpenAI - everything runs on your machine.

## 🎯 Features

- **Fully Offline**: Uses Ollama for both embeddings and LLM inference
- **RAG-Powered**: Answers questions based on your markdown knowledgebase
- **Modern Stack**: Node.js + Express backend, React frontend
- **Vector Search**: Cosine similarity search for relevant context retrieval
- **Clean UI**: ChatGPT-like interface with chat bubbles
- **Local Vector Store**: File-based JSON storage (no external database)

## 📁 Project Structure

```
build-fest/
├── knowledgebase/          # Add your .md files here
│   └── patient-creation.md
├── server/                 # Backend (Node.js + Express)
│   ├── index.js           # Main Express server
│   ├── package.json
│   ├── .env.example
│   ├── routes/
│   │   └── chat.js        # POST /chat endpoint
│   └── rag/
│       ├── embed.js       # Embedding generation script
│       ├── search.js      # Cosine similarity search
│       ├── utils.js       # Chunking & normalization
│       └── ollama.js      # Ollama integration
└── client/                # Frontend (React + Vite)
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx        # Main chat UI
        ├── App.css
        ├── main.jsx
        ├── components/
        │   ├── ChatBubble.jsx
        │   └── ChatBubble.css
        └── services/
            └── api.js     # Backend API calls
```

## 🚀 Setup Instructions

### Prerequisites

1. **Install Node.js** (v18 or higher)
   ```bash
   # Check if installed
   node --version
   npm --version
   ```

2. **Install Ollama**
   
   - **macOS/Linux:**
     ```bash
     curl -fsSL https://ollama.com/install.sh | sh
     ```
   
   - **Windows:** Download from [ollama.com](https://ollama.com/download)

3. **Pull Required Models**
   ```bash
   # LLM model for chat
   ollama pull llama3
   
   # Embedding model
   ollama pull nomic-embed-text
   ```

   **Alternative models you can use:**
   - LLM: `mistral`, `gemma`, `llama2`, `codellama`
   - Embeddings: `nomic-embed-text`, `mxbai-embed-large`

4. **Verify Ollama is Running**
   ```bash
   ollama list
   ```
   You should see both models listed.

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd build-fest
   ```

2. **Install Backend Dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install Frontend Dependencies**
   ```bash
   cd ../client
   npm install
   ```

4. **Configure Environment (Optional)**
   
   Backend - Copy `.env.example` to `.env` and modify if needed:
   ```bash
   cd ../server
   cp .env.example .env
   ```
   
   Default values in `.env.example`:
   ```env
   PORT=3001
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=llama3
   OLLAMA_EMBEDDING_MODEL=nomic-embed-text
   ```

## 📚 Generate Embeddings

Before running the chatbot, you need to generate embeddings for your markdown files:

```bash
cd server
npm run embed
```

This will:
1. Read all `.md` files from `/knowledgebase`
2. Split them into chunks (2000 characters with 200 char overlap)
3. Generate embeddings using `ollama embed`
4. Save everything to `vector_store.json`

**Output example:**
```
🚀 Starting embedding process...

Step 1: Reading markdown files...
Found 1 markdown file(s)

Step 2: Chunking documents...
  patient-creation.md: 15 chunks
Total chunks: 15

Step 3: Generating embeddings with Ollama...
Using model: nomic-embed-text

Embedding chunk 1/15...
Embedding chunk 2/15...
...
✅ Embeddings generated!

Step 4: Saving vector store...
✅ Vector store saved to: /path/to/server/vector_store.json

✅ Embedding process completed successfully!
```

## 🏃 Running the Application

### Start Backend Server

```bash
cd server
npm start
```

Server will run on `http://localhost:3001`

**For development (with auto-reload):**
```bash
npm run dev
```

### Start Frontend

In a new terminal:

```bash
cd client
npm run dev
```

Frontend will run on `http://localhost:3000`

Open your browser and visit: **http://localhost:3000**

## 💬 Using the Chatbot

1. Type your question in the input box at the bottom
2. Press Enter or click "Send"
3. The chatbot will:
   - Generate embedding for your query
   - Search for relevant chunks from knowledgebase
   - Pass top 5 chunks to the LLM as context
   - Return an answer based ONLY on the knowledgebase

**When RAG is active**, you'll see:
```
✓ Using knowledgebase context
```

## 📝 Adding New Knowledgebase Documents

1. **Add markdown files** to the `/knowledgebase` folder:
   ```bash
   cp your-document.md knowledgebase/
   ```

2. **Regenerate embeddings:**
   ```bash
   cd server
   npm run embed
   ```

3. **Restart the backend** (if running):
   ```bash
   # Stop with Ctrl+C, then:
   npm start
   ```

That's it! The chatbot now knows about your new documents.

## 🔧 API Endpoints

### POST /chat
Send a message to the chatbot

**Request:**
```json
{
  "message": "What is patient creation?"
}
```

**Response:**
```json
{
  "answer": "Patient creation is...",
  "sources": [
    {
      "filename": "patient-creation.md",
      "similarity": "0.8542",
      "preview": "Preview of the chunk..."
    }
  ],
  "using_knowledgebase": true,
  "model": "llama3"
}
```

### GET /health
Check server status

**Response:**
```json
{
  "status": "ok",
  "vectorStoreExists": true,
  "ollamaAvailable": true,
  "message": "Server ready"
}
```

## 🛠️ Troubleshooting

### Ollama not found
```bash
# Check if Ollama is running
ollama list

# Start Ollama service (if needed)
ollama serve
```

### Models not found
```bash
# Pull missing models
ollama pull llama3
ollama pull nomic-embed-text
```

### Vector store not found
```bash
cd server
npm run embed
```

### Port already in use
Edit `.env` file in server directory:
```env
PORT=3002  # or any available port
```

### Cannot connect to backend from frontend
Check that:
1. Backend is running on port 3001
2. Frontend `.env` has correct API URL:
   ```env
   VITE_API_URL=http://localhost:3001
   ```

## 🎨 Customization

### Change LLM Model

Edit `server/.env`:
```env
OLLAMA_MODEL=mistral  # or gemma, llama2, etc.
```

### Change Embedding Model

Edit `server/.env`:
```env
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large
```

Then regenerate embeddings:
```bash
cd server
npm run embed
```

### Adjust Chunk Size

Edit `server/rag/utils.js`:
```javascript
export function chunkText(text, chunkSize = 2000, overlap = 200)
```

### Change Number of Retrieved Chunks

Edit `server/routes/chat.js`:
```javascript
const topChunks = searchSimilarChunks(queryEmbedding, vectorStore.chunks, 5);
// Change 5 to your desired number
```

## 📊 Performance

- **Embedding Generation**: ~1-2 seconds per chunk (depends on model)
- **Query Response**: ~2-5 seconds (depends on model and context size)
- **Vector Search**: <100ms for 1000 chunks

## 🔐 Privacy

- **100% Offline**: No data leaves your machine
- **No API Keys**: No cloud service dependencies
- **Local Storage**: All vectors stored in local JSON file

## 📄 License

MIT

## 🤝 Contributing

1. Add new markdown files to `/knowledgebase`
2. Run `npm run embed` in server directory
3. Test the chatbot with questions about new content

## 🆘 Support

If you encounter issues:
1. Check Ollama is running: `ollama list`
2. Verify models are pulled: `ollama list` should show both models
3. Ensure embeddings are generated: check for `server/vector_store.json`
4. Check server logs for detailed error messages

---

**Built with ❤️ using Ollama, Node.js, Express, React, and Vite**
