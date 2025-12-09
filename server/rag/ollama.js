import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute Ollama embedding command
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model name
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function generateEmbedding(text, model = 'nomic-embed-text') {
  try {
    const command = `ollama embed --model ${model} "${text.replace(/"/g, '\\"')}"`;
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('success')) {
      console.error('Ollama stderr:', stderr);
    }
    
    // Parse the embedding from stdout
    const embedding = JSON.parse(stdout.trim());
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate chat completion using Ollama
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User message
 * @param {string} model - Model name
 * @returns {Promise<string>} - Model response
 */
export async function generateChatCompletion(systemPrompt, userPrompt, model = 'llama3') {
  try {
    const prompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const command = `ollama run ${model} "${escapedPrompt}"`;
    
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
    
    if (stderr) {
      console.error('Ollama stderr:', stderr);
    }
    
    return stdout.trim();
  } catch (error) {
    console.error('Error generating chat completion:', error.message);
    throw new Error(`Failed to generate chat completion: ${error.message}`);
  }
}

/**
 * Check if Ollama is running and model is available
 * @param {string} model - Model name to check
 * @returns {Promise<boolean>}
 */
export async function checkOllamaAvailability(model = 'llama3') {
  try {
    const { stdout } = await execAsync('ollama list');
    return stdout.includes(model);
  } catch (error) {
    return false;
  }
}
