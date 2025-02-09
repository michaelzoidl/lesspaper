import { Database } from "jsr:@db/sqlite@0.11";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { currentConfigFolder, initializeConfigTable } from './config.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('database');

class DatabaseConnection {
  private static instance: Database | null = null;

  static async getInstance(): Promise<Database> {
    if (!DatabaseConnection.instance) {
      try {
        // Get the config folder path
        const configPath = await currentConfigFolder();
        const dbPath = join(configPath, "data.db");

        // Initialize database connection
        DatabaseConnection.instance = await new Database(dbPath);
        logger.info('Database connection established successfully');

        // Enable foreign keys and WAL mode for better performance
        DatabaseConnection.instance.prepare('PRAGMA foreign_keys = ON;').run();
        DatabaseConnection.instance.prepare('PRAGMA journal_mode = WAL;').run();

        // Initialize config table and default settings
        await initializeConfigTable(DatabaseConnection.instance);
      } catch (error: unknown) {
        logger.error(`Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    }

    return DatabaseConnection.instance;
  }

  static async close(): Promise<void> {
    if (DatabaseConnection.instance) {
      try {
        await DatabaseConnection.instance.close();
        DatabaseConnection.instance = null;
        logger.info('Database connection closed successfully');
      } catch (error: unknown) {
        logger.error(`Failed to close database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    }
  }
}

export { DatabaseConnection };
