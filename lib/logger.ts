import { ensureFileSync } from "https://deno.land/std/fs/ensure_file.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { currentConfigFolder } from "./config.ts";

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  namespace: string;
  logFile?: string;
}

class Logger {
  private namespace: string;
  private enabled: boolean;
  private static logFile: string | null = null;

  constructor(options: LoggerOptions) {
    this.namespace = options.namespace;
    this.enabled = this.isDebugEnabled();
  }

  private static async initLogFile() {
    if (!Logger.logFile) {
      const configPath = await currentConfigFolder();
      Logger.logFile = join(configPath, 'system.log');
      ensureFileSync(Logger.logFile);
    }
    return Logger.logFile;
  }

  private isDebugEnabled(): boolean {
    const debug = Deno.env.get('DEBUG');
    if (!debug) return false;
    
    // Support patterns like "*", "namespace:*", "-namespace"
    const patterns = debug.split(',');
    const isEnabled = patterns.some(pattern => {
      if (pattern.startsWith('-')) {
        return !this.namespace.match(pattern.slice(1));
      }
      return this.namespace.match(pattern.replace('*', '.*'));
    });

    return isEnabled;
  }

  private async writeToFile(level: LogLevel, message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${this.namespace}: ${message}\n`;
    
    try {
      const logFile = await Logger.initLogFile();
      await Deno.writeTextFile(logFile, logEntry, { append: true });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`Failed to write to log file: ${error.message}`);
      } else {
        console.error('Failed to write to log file: Unknown error');
      }
    }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level.toUpperCase()}] ${this.namespace}: ${message}`;
  }

  debug(message: string, ...args: unknown[]) {
    const formattedMessage = args.length ? `${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}` : message;
    if (this.enabled) {
      console.debug('\x1b[34m%s\x1b[0m', this.formatMessage('debug', formattedMessage));
    }
    this.writeToFile('debug', formattedMessage);
  }

  info(message: string, ...args: unknown[]) {
    const formattedMessage = args.length ? `${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}` : message;
    if (this.enabled) {
      console.info('\x1b[32m%s\x1b[0m', this.formatMessage('info', formattedMessage));
    }
    this.writeToFile('info', formattedMessage);
  }

  warn(message: string, ...args: unknown[]) {
    const formattedMessage = args.length ? `${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}` : message;
    if (this.enabled) {
      console.warn('\x1b[33m%s\x1b[0m', this.formatMessage('warn', formattedMessage));
    }
    this.writeToFile('warn', formattedMessage);
  }

  error(message: string, ...args: unknown[]) {
    const formattedMessage = args.length ? `${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}` : message;
    if (this.enabled) {
      console.error('\x1b[31m%s\x1b[0m', this.formatMessage('error', formattedMessage));
    }
    this.writeToFile('error', formattedMessage);
  }
}

export function createLogger(namespace: string, logFile?: string): Logger {
  return new Logger({ namespace, logFile });
}
