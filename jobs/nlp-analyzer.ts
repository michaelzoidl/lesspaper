import { nlp, dates } from '../deps.ts';
import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';

// Type declarations for nlp
type NLPResult = {
  text: string;
  [key: string]: unknown;
};

type Doc = {
  dates: () => { json: () => NLPResult[] };
  people: () => { json: () => NLPResult[] };
  nouns: () => { json: () => NLPResult[] };
  organizations: () => { json: () => NLPResult[] };
};

const logger = createLogger('jobs:nlp-analyzer');
nlp.extend(dates);

interface Document {
  id: number;
  path: string;
  meta: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentMeta {
  text?: string;
  nlp_dates?: Array<{ key: string; value: string }>;
  nlp_people?: Array<{ key: string; value: string }>;
  nlp_organizations?: Array<{ key: string; value: string }>;
  nlp_topics?: Array<{ key: string; value: string }>;
  [key: string]: unknown;
}

async function analyzeDocument(doc: Document) {
  try {
    const meta = JSON.parse(doc.meta || '{}') as DocumentMeta;
    const content = doc.content ? JSON.parse(doc.content) as Record<string, string> : {};
    
    // Combine all pages into one text for analysis
    const allText = Object.values(content).join(' ');
    
    if (!allText) {
      logger.info(`No content found in document ${doc.id}`);
      return null;
    }

    logger.info(`Analyzing content from document ${doc.id} (${Object.keys(content).length} pages)`);
    const doc_nlp = nlp(allText) as Doc;
    
    // Extract dates
    const dates = doc_nlp.dates().json() as NLPResult[];
    if (dates.length > 0) {
      meta.nlp_dates = dates.map(d => ({
        key: 'detected_date',
        value: d.text
      }));
    }

    // Extract people names
    const people = doc_nlp.people().json() as NLPResult[];
    if (people.length > 0) {
      meta.nlp_people = people.map(p => ({
        key: 'person',
        value: p.text
      }));
    }

    // Extract organizations
    const orgs = doc_nlp.organizations().json() as NLPResult[];
    if (orgs.length > 0) {
      meta.nlp_organizations = orgs.map(o => ({
        key: 'organization',
        value: o.text
      }));
    }

    // Extract topics (nouns)
    const topics = doc_nlp.nouns().json() as NLPResult[];
    if (topics.length > 0) {
      meta.nlp_topics = topics.map(t => ({
        key: 'topic',
        value: t.text
      }));
    }

    return meta;
  } catch (error) {
    logger.error('Error analyzing document:', error);
    return null;
  }
}

async function processNewDocuments() {
  try {
    const db = await DatabaseConnection.getInstance();
    const stmt = db.prepare(`
      SELECT id, path, meta, content, created_at, updated_at FROM documents 
      WHERE (meta IS NULL OR meta NOT LIKE '%nlp_%') AND content IS NOT NULL
      ORDER BY created_at DESC
    `);
    
    const rawDocuments = await stmt.all() as Record<string, unknown>[];
    logger.info(`Found ${rawDocuments.length} documents to analyze`);
    
    const documents: Document[] = rawDocuments.map(raw => ({
      id: Number(raw.id),
      path: String(raw.path),
      meta: raw.meta as string | null ?? null,
      content: raw.content as string | null ?? null,
      created_at: String(raw.created_at),
      updated_at: String(raw.updated_at)
    }));
    stmt.finalize();

    for (const doc of documents) {
      logger.info(`Analyzing document: ${doc.path} (ID: ${doc.id}, Current meta: ${doc.meta ?? 'null'})`);
      const updatedMeta = await analyzeDocument(doc);
      logger.info(`Analysis result for ${doc.path}:`, updatedMeta);
      
      if (updatedMeta) {
        const updateStmt = db.prepare('UPDATE documents SET meta = ? WHERE id = ?');
        const metaString = JSON.stringify(updatedMeta);
        logger.info(`Updating document ${doc.id} with meta:`, metaString);
        await updateStmt.run(metaString, doc.id);
        updateStmt.finalize();
        
        logger.info(`Updated document ${doc.id} with NLP analysis`);
      }
    }
  } catch (error) {
    logger.error('Error processing documents:', error);
  }
}

// Export the job function for the scheduler
export const nlpAnalyzer = async () => {
  logger.info('Running NLP analysis job');
  await processNewDocuments();
};
