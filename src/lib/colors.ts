// Consistent avatar colors based on name
const avatarColors = [
  'bg-rose-500',
  'bg-orange-500', 
  'bg-amber-500',
  'bg-emerald-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
];

// Generate consistent color from name
export function getAvatarColor(name: string): string {
  if (!name) return 'bg-gray-400';
  
  // Simple hash from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % avatarColors.length;
  return avatarColors[index];
}

// Status colors - more vibrant
export const statusColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  considering: {
    bg: 'bg-green-50',
    text: 'text-gray-900',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  new: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-400',
    dot: 'bg-emerald-500',
  },
  experienced: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-400',
    dot: 'bg-emerald-500',
  },
  social: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  new_to_area: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  other: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    dot: 'bg-gray-500',
  },
};

export const statusLabels: Record<string, string> = {
  considering: 'Community',
  new: 'Home Education',
  experienced: 'Extracurricular',
  social: 'Social Activities',
  new_to_area: 'New to Area',
  other: 'Other',
};

export const statusIcons: Record<string, string> = {
  considering: '',
  new: '',
  experienced: '',
  social: '',
  new_to_area: '',
  other: '',
};

// User type badge styles — consistent across the app
export function getUserTypeBadge(userType?: string): { style: string; label: string } | null {
  switch (userType) {
    case 'teacher':
      return { style: 'bg-blue-100 text-blue-700', label: 'Teacher' };
    case 'business':
    case 'facility':
      return { style: 'bg-amber-100 text-amber-700', label: 'Business' };
    case 'playgroup':
      return { style: 'bg-purple-100 text-purple-700', label: 'Playgroup' };
    case 'family':
      return { style: 'bg-emerald-100 text-emerald-700', label: 'Family' };
    default:
      return null;
  }
}
