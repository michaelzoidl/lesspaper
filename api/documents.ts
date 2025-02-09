import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('api:documents');
const router = new Router();

interface Document {
  id: number;
  path: string;
  meta: string;
  created_at: string;
  updated_at: string;
}

router.get("/api/documents", async (ctx) => {
  try {
    const db = await DatabaseConnection.getInstance();
    const stmt = db.prepare("SELECT * FROM documents ORDER BY created_at DESC");
    const rawDocuments = await stmt.all() as Record<string, unknown>[];
    stmt.finalize();

    // Transform raw documents into properly typed Document objects
    const documents: Document[] = rawDocuments.map(raw => ({
      id: Number(raw.id),
      path: String(raw.path),
      meta: String(raw.meta),
      created_at: String(raw.created_at),
      updated_at: String(raw.updated_at)
    }));

    // Parse meta JSON string to object for each document
    const formattedDocuments = documents.map(doc => ({
      ...doc,
      meta: JSON.parse(doc.meta)
    }));

    ctx.response.body = formattedDocuments;
  } catch (error) {
    logger.error("Error fetching documents:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.get("/api/document/:id", async (ctx) => {
  try {
    const id = ctx.params.id;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Document ID is required" };
      return;
    }

    const db = await DatabaseConnection.getInstance();
    const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
    const document = await stmt.get(id) as Document | undefined;
    stmt.finalize();

    if (!document) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Document not found" };
      return;
    }

    try {
      // Check if file exists
      const fileInfo = await Deno.stat(document.path);
      if (!fileInfo.isFile) {
        throw new Error("Not a file");
      }

      // Set appropriate headers
      ctx.response.headers.set("Content-Type", "application/pdf");
      const filename = document.path.split("/").pop() || '';
      const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);
      ctx.response.headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodedFilename}`); 

      // Stream the file
      const file = await Deno.open(document.path);
      ctx.response.body = file.readable;
    } catch (error) {
      logger.error(`Error reading PDF file at path '${document.path}':`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path: document.path,
        exists: await Deno.stat(document.path).then(() => true).catch(() => false)
      });
      ctx.response.status = 404;
      ctx.response.body = { error: "PDF file not found or cannot be accessed" };
    }
  } catch (error) {
    logger.error("Error fetching document:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

export { router as documentsRouter };
