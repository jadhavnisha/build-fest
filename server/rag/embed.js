import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmbedding, checkOllamaAvailability, getOllamaHost } from './ollama.js';
import { chunkText } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KNOWLEDGEBASE_DIR = path.join(__dirname, '../../knowledgebase');
const VECTOR_STORE_PATH = path.join(__dirname, '../vector_store.json');
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

/**
 * Read all markdown files from knowledgebase
 * @returns {Array} - Array of {filename, content}
 */
function readMarkdownFiles() {
  if (!fs.existsSync(KNOWLEDGEBASE_DIR)) {
    throw new Error(`Knowledgebase directory not found: ${KNOWLEDGEBASE_DIR}`);
  }
  
  const files = fs.readdirSync(KNOWLEDGEBASE_DIR).filter(file => file.endsWith('.md'));
  const documents = [];
  
  for (const file of files) {
    const filePath = path.join(KNOWLEDGEBASE_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    documents.push({ filename: file, content });
  }
  
  return documents;
}

/**
 * Generate embeddings for all chunks
 * @param {Array} chunks - Array of text chunks
 * @returns {Promise<Array>} - Chunks with embeddings
 */
async function embedChunks(chunks) {
  const embeddedChunks = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Embedding chunk ${i + 1}/${chunks.length}...`);
    const embedding = await generateEmbedding(chunks[i].text, EMBEDDING_MODEL);
    embeddedChunks.push({
      ...chunks[i],
      embedding
    });
  }
  
  return embeddedChunks;
}

/**
 * Main embedding process
 */
async function createVectorStore() {
  console.log('🚀 Starting embedding process...\n');
  
  // Step 0: Check if Ollama is available
  console.log('Step 0: Checking Ollama availability...');
  console.log(`Connecting to Ollama at: ${getOllamaHost()}`);
  
  const ollamaAvailable = await checkOllamaAvailability(EMBEDDING_MODEL);
  
  if (!ollamaAvailable) {
    console.log('\n❌ Ollama service is not available or model not found!');
    console.log('\nPlease ensure:');
    console.log('  1. Ollama is installed: ollama --version');
    console.log('  2. Ollama service is running: ollama serve');
    console.log(`  3. The embedding model is pulled: ollama pull ${EMBEDDING_MODEL}`);
    console.log(`  4. Test connection with: curl ${getOllamaHost()}/api/tags\n`);
    process.exit(1);
  }
  
  console.log(`✅ Ollama is running and model '${EMBEDDING_MODEL}' is available\n`);
  
  // Step 1: Read markdown files
  console.log('Step 1: Reading markdown files...');
  const documents = readMarkdownFiles();
  console.log(`Found ${documents.length} markdown file(s)\n`);
  
  if (documents.length === 0) {
    console.log('❌ No markdown files found in /knowledgebase');
    process.exit(1);
  }
  
  // Step 2: Chunk documents
  console.log('Step 2: Chunking documents...');
  let allChunks = [];
  for (const doc of documents) {
    const textChunks = chunkText(doc.content);
    const chunks = textChunks.map((text, idx) => ({
      text,
      filename: doc.filename,
      chunkIndex: idx
    }));
    allChunks = allChunks.concat(chunks);
    console.log(`  ${doc.filename}: ${chunks.length} chunks`);
  }
  console.log(`Total chunks: ${allChunks.length}\n`);
  
  // Step 3: Generate embeddings using Ollama
  console.log('Step 3: Generating embeddings with Ollama...');
  console.log(`Using model: ${EMBEDDING_MODEL}\n`);
  const embeddedChunks = await embedChunks(allChunks);
  console.log('✅ Embeddings generated!\n');
  
  // Step 4: Save to JSON
  console.log('Step 4: Saving vector store...');
  const vectorStore = {
    created_at: new Date().toISOString(),
    chunks: embeddedChunks,
    metadata: {
      total_chunks: embeddedChunks.length,
      files: documents.map(d => d.filename),
      embedding_model: EMBEDDING_MODEL,
      chunk_size: 2000,
      chunk_overlap: 200
    }
  };
  
  fs.writeFileSync(VECTOR_STORE_PATH, JSON.stringify(vectorStore, null, 2));
  console.log(`✅ Vector store saved to: ${VECTOR_STORE_PATH}`);
  console.log('\n✅ Embedding process completed successfully!');
}

// Run the script
createVectorStore().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
