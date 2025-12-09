import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleChat } from './routes/chat.js';
import { checkOllamaAvailability } from './rag/ollama.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post('/chat', handleChat);

app.get('/health', async (req, res) => {
  const vectorStorePath = path.join(__dirname, 'vector_store.json');
  const vectorStoreExists = fs.existsSync(vectorStorePath);
  const ollamaAvailable = await checkOllamaAvailability();
  
  res.json({
    status: 'ok',
    vectorStoreExists,
    ollamaAvailable,
    message: vectorStoreExists && ollamaAvailable
      ? 'Server ready'
      : !ollamaAvailable
      ? 'Ollama not available. Please ensure Ollama is running.'
      : 'Vector store not found. Run "npm run embed" first.'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'RAG Chatbot API (Offline - Ollama)',
    endpoints: {
      'POST /chat': 'Send a message to the chatbot',
      'GET /health': 'Check server health'
    }
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  const vectorStorePath = path.join(__dirname, 'vector_store.json');
  if (!fs.existsSync(vectorStorePath)) {
    console.log('⚠️  Vector store not found. Run "npm run embed" to create it.');
  } else {
    console.log('✅ Vector store loaded');
  }
  
  const ollamaAvailable = await checkOllamaAvailability();
  if (!ollamaAvailable) {
    console.log('⚠️  Ollama not available. Please ensure Ollama is running.');
  } else {
    console.log('✅ Ollama is available');
  }
});
