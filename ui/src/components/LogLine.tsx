import { cn } from '@/lib/utils';

interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
}

function parseLogLine(line: string): LogEntry | null {
  const regex = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[(?<level>\w+)]\s+(?<component>.+?)(?=:\s+):\s+(?<message>.+)$/;
  const match = line.match(regex);
  if (match && match.groups) {
    return {
      timestamp: match.groups.timestamp,
      level: match.groups.level,
      component: match.groups.component,
      message: match.groups.message,
    };
  }
  return null;
}

const levelColors = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
} as const;

interface LogLineProps {
  line: string;
}

export function LogLine({ line }: LogLineProps) {
  const parsed = parseLogLine(line);

  console.log({line})
  
  if (!parsed) {
    return <div className="text-gray-500 font-mono text-sm">{line}</div>;
  }

  const { timestamp, level, component, message } = parsed;
  const levelColor = levelColors[level as keyof typeof levelColors] || 'text-gray-400';

  return (
    <div className="flex gap-2 font-mono text-sm py-1 hover:bg-gray-800/50">
      <div className="text-gray-500 shrink-0 w-42 overflow-hidden text-ellipsis">
        {timestamp}
      </div>
      <div className={cn('shrink-0 w-16 font-semibold', levelColor)}>
        {level}
      </div>
      <div className="text-gray-400 shrink-0 w-[250px] overflow-hidden text-ellipsis">
        {component}
      </div>
      <div className="text-gray-100 min-w-0">
        {message}
      </div>
    </div>
  );
}
