// import { DatabaseConnection } from './database.ts';
// import { createLogger } from './logger.ts';
// import * as tf from 'npm:@tensorflow/tfjs-core';
// import '@tensorflow/tfjs-backend-cpu';
// import '@tensorflow/tfjs-converter';
// import { load } from 'npm:@tensorflow-models/universal-sentence-encoder';

// const logger = createLogger('lib:semantic-search');

// export interface SearchResult {
//   content: string;
//   similarity: number;
//   documentId: number;
// }

// let model: Awaited<ReturnType<typeof load>> | null = null;

// async function ensureModel() {
//   if (!model) {
//     logger.info('Loading Universal Sentence Encoder model...');
//     model = await load();
//     logger.info('Model loaded successfully');
//   }
//   return model;
// }

// /**
//  * Compute cosine similarity between two vectors
//  */
// function cosineSimilarity(a: Float32Array, b: Float32Array): number {
//   const dotProduct = tf.dot(tf.tensor1d(a), tf.tensor1d(b));
//   const normA = tf.norm(tf.tensor1d(a));
//   const normB = tf.norm(tf.tensor1d(b));
//   const similarity = tf.div(dotProduct, tf.mul(normA, normB));
//   return similarity.dataSync()[0];
// }

// /**
//  * Search for similar blocks of text using semantic similarity
//  * @param query The search query
//  * @param limit Maximum number of results to return (default: 20)
//  * @returns Array of search results sorted by similarity (highest first)
//  */
// export async function semanticSearch(query: string, limit: number = 20): Promise<SearchResult[]> {
//   try {
//     // Initialize TensorFlow.js backend if not already done
//     await tf.setBackend('cpu');
//     await tf.ready();
    
//     // Get model and generate query embedding
//     const model = await ensureModel();
//     const queryEmbedding = await model.embed([query]);
//     const queryVector = await queryEmbedding.array();
//     const queryFloat32 = new Float32Array(queryVector[0]);

//     // Get database connection
//     const db = await DatabaseConnection.getInstance();

//     // Get all blocks and their embeddings
//     const blocks = await db.prepare(`
//       SELECT 
//         id,
//         document_id,
//         content,
//         embedding
//       FROM blocks
//     `).all() as Array<{
//       id: number;
//       document_id: number;
//       content: string;
//       embedding: Uint8Array;
//     }>;

//     // Calculate similarities
//     const results: SearchResult[] = [];
//     for (const block of blocks) {
//       const blockVector = new Float32Array(block.embedding.buffer);
//       const similarity = cosineSimilarity(queryFloat32, blockVector);

//       results.push({
//         content: block.content,
//         similarity,
//         documentId: block.document_id
//       });
//     }

//     // Sort by similarity (highest first) and limit results
//     return results
//       .sort((a, b) => b.similarity - a.similarity)
//       .slice(0, limit);

//   } catch (error) {
//     logger.error('Error in semantic search:', error);
//     throw error;
//   }
// }
