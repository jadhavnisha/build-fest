import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmbedding, generateChatCompletion } from '../rag/ollama.js';
import { searchSimilarChunks } from '../rag/search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VECTOR_STORE_PATH = path.join(__dirname, '../vector_store.json');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

/**
 * Load vector store from JSON
 * @returns {Object} - Vector store data
 */
function loadVectorStore() {
  if (!fs.existsSync(VECTOR_STORE_PATH)) {
    throw new Error('Vector store not found. Please run "npm run embed" first.');
  }
  const data = fs.readFileSync(VECTOR_STORE_PATH, 'utf-8');
  return JSON.parse(data);
}

/**
 * POST /chat - Main chat endpoint with RAG
 */
export async function handleChat(req, res) {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log(`\n📩 Query: ${message}`);
    
    // Step 1: Load vector store
    const vectorStore = loadVectorStore();
    console.log(`📚 Loaded ${vectorStore.chunks.length} chunks`);
    
    // Step 2: Generate embedding for query
    console.log('🔄 Generating query embedding...');
    const queryEmbedding = await generateEmbedding(message, OLLAMA_EMBEDDING_MODEL);
    console.log('✅ Query embedding generated');
    
    // Step 3: Search for similar chunks
    console.log('🔍 Searching for relevant chunks...');
    const topChunks = searchSimilarChunks(queryEmbedding, vectorStore.chunks, 5);
    console.log(`📄 Found ${topChunks.length} relevant chunks`);
    console.log('Similarities:', topChunks.map(c => c.similarity.toFixed(4)).join(', '));
    
    // Step 4: Build context
    const context = topChunks
      .map((chunk, idx) => `[Source ${idx + 1} - ${chunk.filename}]\n${chunk.text}`)
      .join('\n\n---\n\n');
    
    // Step 5: Create RAG prompt
    const systemPrompt = `You are a helpful assistant that answers questions based ONLY on the provided context from the knowledgebase.

Important rules:
- Answer questions using ONLY the information in the context below
- If the context doesn't contain relevant information, say "I don't have enough information in the knowledgebase to answer that question."
- Do not make up information or use external knowledge
- Be concise and accurate
- Cite the source when possible

Context from knowledgebase:
${context}`;
    
    const userPrompt = message;
    
    // Step 6: Generate response with Ollama
    console.log(`🤖 Generating response with ${OLLAMA_MODEL}...`);
    const answer = await generateChatCompletion(systemPrompt, userPrompt, OLLAMA_MODEL);
    console.log('✅ Response generated\n');
    
    // Step 7: Return response
    res.json({
      answer: answer,
      sources: topChunks.map(chunk => ({
        filename: chunk.filename,
        similarity: chunk.similarity.toFixed(4),
        preview: chunk.text.substring(0, 150) + '...'
      })),
      using_knowledgebase: true,
      model: OLLAMA_MODEL
    });
    
  } catch (error) {
    console.error('❌ Error in /chat:', error.message);
    res.status(500).json({
      error: 'Failed to process chat request',
      details: error.message
    });
  }
}
