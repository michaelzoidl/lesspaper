export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function extractFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

export function formatDate(dateString: string, format: 'full' | 'monthYear' = 'full'): string | { month: string; year: string } {
  const date = new Date(dateString);
  if (format === 'monthYear') {
    return {
      month: date.toLocaleString('en-US', { month: 'long' }),
      year: date.getFullYear().toString()
    };
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
