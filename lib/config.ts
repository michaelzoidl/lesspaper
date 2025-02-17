import { join, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDirSync } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { Database } from "jsr:@db/sqlite@0.11";

const CONFIG_FOLDER_NAME = ".lesspaper";
let cachedConfigPath: string | null = null;

// Simple console logger to avoid circular dependency with logger.ts
function log(level: string, message: string) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${level.toUpperCase()}] config: ${message}`);
}

/**
 * Checks if a .lesspaper folder exists in the given directory
 */
async function hasConfigFolder(directory: string): Promise<boolean> {
  try {
    const configPath = join(directory, CONFIG_FOLDER_NAME);
    const stat = await Deno.stat(configPath);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

/**
 * Recursively searches up the directory tree for a .lesspaper folder
 */
async function findConfigFolder(startPath: string): Promise<string | null> {
  let currentDir = startPath;
  
  log('debug', `Searching for config folder starting from: ${startPath}`);
  
  while (true) {
    if (await hasConfigFolder(currentDir)) {
      log('info', `Found config folder at: ${join(currentDir, CONFIG_FOLDER_NAME)}`);
      return join(currentDir, CONFIG_FOLDER_NAME);
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // We've reached the root directory
      return null;
    }
    
    currentDir = parentDir;
  }
}

/**
 * Creates a .lesspaper folder in the user's home directory
 */
function createDefaultConfigFolder(): string {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    log('error', "Could not determine home directory");
    throw new Error("Could not determine home directory");
  }

  const configPath = join(homeDir, CONFIG_FOLDER_NAME);
  log('info', `Creating default config folder at: ${configPath}`);
  ensureDirSync(configPath);
  return configPath;
}

/**
 * Returns the path to the current .lesspaper config folder.
 * If no config folder is found in the directory tree, creates one in the user's home directory.
 */
export interface ConfigSetting {
  setting: string;
  value: string;
}

// Default settings for the application
const DEFAULT_SETTINGS: ConfigSetting[] = [
  { setting: 'port', value: '9493' },
  { setting: 'llm_enabled', value: 'false' },
  { setting: 'llm_model_path', value: '' },
  { setting: 'llm_provider', value: 'local' }, // local, deepseek, openai
  { setting: 'openai_api_key', value: '' },
  { setting: 'deepseek_api_key', value: '' }
];

/**
 * Initialize the config table and set default settings
 */
export async function initializeConfigTable(db: Database): Promise<void> {
  // Create config table with PRIMARY KEY on setting
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS config (
      setting TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();

  // Insert default settings if they don't exist
  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO config (setting, value) VALUES (?, ?)'
  );

  for (const { setting, value } of DEFAULT_SETTINGS) {
    insertStmt.run([setting, value]);
  }
}

/**
 * Get a config setting from the database
 */
export async function getConfigSetting(db: Database, setting: string): Promise<string | null> {
  const result = await db.prepare('SELECT value FROM config WHERE setting = ?').get([setting]);
  return result ? (result as { value: string }).value : null;
}

/**
 * Set a config setting in the database
 */
export async function setConfigSetting(db: Database, setting: string, value: string): Promise<void> {
  // Use INSERT OR REPLACE for non-document-source settings (like 'port')
  // Use regular INSERT for document sources to allow multiple entries
  const query = setting.startsWith('document-source-')
    ? 'INSERT INTO config (setting, value) VALUES (?, ?)'
    : 'INSERT OR REPLACE INTO config (setting, value) VALUES (?, ?)';
    
  await db.prepare(query).run([setting, value]);
}

export async function currentConfigFolder(): Promise<string> {
  if (cachedConfigPath) {
    return cachedConfigPath;
  }

  // Start search from current working directory
  const cwd = Deno.cwd();
  const configPath = await findConfigFolder(cwd);
  
  if (configPath) {
    cachedConfigPath = configPath;
    return configPath;
  }

  // If no config folder found, create in home directory
  cachedConfigPath = createDefaultConfigFolder();
  return cachedConfigPath;
}
