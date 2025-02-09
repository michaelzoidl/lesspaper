import useSWR from 'swr';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom'
import { LogLine } from '@/components/LogLine';

const fetcher = (url: string) => fetch(url).then(res => res.text());

export default function Logs() {
  const { data: logs, error, isLoading } = useSWR('/api/logs', fetcher, {
    refreshInterval: 5000 // Refresh every 5 seconds
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Failed to load logs</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Link
        to="/"
        className="inline-flex items-center gap-2 mb-6 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>
      <div className="py-8 h-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">System Logs</h1>
          <div className="text-sm text-gray-500">Auto-refreshing every 5 seconds</div>
        </div>

        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg w-full h-full">
          <div className="overflow-auto max-h-[1000px] space-y-1">
            {logs?.split('\n')
              .filter(Boolean)
              .reverse()
              .map((line, index) => (
                <LogLine key={index} line={line} />
              ))}
          </div>
        </div>
      </div>

    </>
  );
}
