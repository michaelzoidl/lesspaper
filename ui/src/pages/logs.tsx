import useSWR from 'swr';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom'
import { LogLine } from '@/components/LogLine';

const fetcher = (url: string) => fetch(url).then(res => res.text());

export default function Logs() {
  const { data: logsRAW, error, isLoading } = useSWR('/api/logs', fetcher, {
    refreshInterval: 5000 // Refresh every 5 seconds
  });

  const logs = JSON.parse(logsRAW || '{}');

  if (error) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-red-500">Failed to load logs</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  console.log(logs)

  return (
    <>
      <Link
        to="/"
        className="inline-flex gap-2 items-center mb-6 text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>
      <div className="py-8 h-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">System Logs</h1>
          <div className="text-sm text-gray-500">Auto-refreshing every 5 seconds</div>
        </div>

        <div className="p-4 w-full h-full text-gray-100 bg-gray-900 rounded-lg">
          <div className="overflow-auto max-h-[1000px] space-y-1">
            {logs?.lines
              .reverse()
              .map((line: string, index: number) => (
                <LogLine key={index} line={line} />
              ))}
          </div>
        </div>
      </div>

    </>
  );
}
