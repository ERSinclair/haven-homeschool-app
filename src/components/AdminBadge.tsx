'use client';

interface AdminBadgeProps {
  adminLevel: 'gold' | 'silver' | 'bronze' | null;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
}

export default function AdminBadge({ adminLevel, size = 'sm', showTitle = false }: AdminBadgeProps) {
  if (!adminLevel) return null;

  const badgeConfig = {
    gold: {
      bg: 'bg-gradient-to-r from-yellow-400 to-yellow-600',
      text: 'text-white',
      border: 'border-yellow-400',
      shadow: 'shadow-yellow-400/25',
      title: 'Full Admin',
      icon: '👑'
    },
    silver: {
      bg: 'bg-gradient-to-r from-gray-300 to-gray-500',
      text: 'text-white',
      border: 'border-gray-400',
      shadow: 'shadow-gray-400/25',
      title: 'Partial Admin',
      icon: '🥈'
    },
    bronze: {
      bg: 'bg-gradient-to-r from-amber-600 to-amber-800',
      text: 'text-white',
      border: 'border-amber-600',
      shadow: 'shadow-amber-600/25',
      title: 'Restricted Admin',
      icon: '🥉'
    }
  };

  const config = badgeConfig[adminLevel];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  if (showTitle) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${config.bg} ${config.text} ${sizeClasses[size]} rounded-full font-medium shadow-sm ${config.shadow} ${config.border} border`}>
        <span className="text-xs">{config.icon}</span>
        <span>{config.title}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center ${config.bg} ${config.text} ${sizeClasses[size]} rounded-full font-medium shadow-sm ${config.shadow} ${config.border} border`}>
      <span className={size === 'sm' ? 'text-xs' : 'text-sm'}>{config.icon}</span>
    </div>
  );
}