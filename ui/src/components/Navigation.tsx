import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Documents', href: '/documents' },
  { name: 'Logs', href: '/logs' },
  { name: 'Settings', href: '/settings' },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex space-x-4 bg-gray-100 p-4 mb-4 rounded-lg">
      {navigation.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className={cn(
            'px-3 py-2 rounded-md text-sm font-medium',
            location.pathname === item.href
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-700 hover:bg-gray-200'
          )}
        >
          {item.name}
        </Link>
      ))}
    </nav>
  );
}
