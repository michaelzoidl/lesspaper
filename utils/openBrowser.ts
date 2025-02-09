import { createLogger } from '../lib/logger.ts';

const logger = createLogger('openBrowser');

/**
 * Opens a URL in the default browser, supporting Windows, macOS, and Linux
 * @param url The URL to open in the browser
 */
export async function openBrowser(url: string): Promise<void> {
  const platform = Deno.build.os;
  
  const commands: Record<string, string[]> = {
    windows: ['cmd', '/c', 'start'],
    darwin: ['open'],
    linux: ['xdg-open'],
  } as const;

  const command = commands[platform as keyof typeof commands];
  if (!command) {
    logger.error('Unsupported platform for browser opening', { platform });
    return;
  }

  try {
    const cmd = new Deno.Command(command[0], {
      args: [...command.slice(1), url],
    });
    await cmd.output();
    logger.info('Browser opened automatically', { url });
  } catch (error) {
    logger.error('Failed to open browser automatically', { error, url });
  }
}
