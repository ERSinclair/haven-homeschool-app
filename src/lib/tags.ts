const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface AppTag {
  value: string;
  label: string;
  sort_order: number;
}

// Simple in-memory cache per category
const cache: Record<string, AppTag[]> = {};

export async function fetchTags(category: string): Promise<AppTag[]> {
  if (cache[category]) return cache[category];
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_tags?category=eq.${encodeURIComponent(category)}&active=eq.true&order=sort_order.asc&select=value,label,sort_order`,
      { headers: { apikey: supabaseKey } }
    );
    if (!res.ok) throw new Error('Failed to fetch tags');
    const data: AppTag[] = await res.json();
    cache[category] = data;
    return data;
  } catch {
    // Fallback to hardcoded if fetch fails
    return FALLBACKS[category] ?? [];
  }
}

// Fallbacks if DB is unreachable
const FALLBACKS: Record<string, AppTag[]> = {
  homeschool_approach: [
    { value: 'Unschooling', label: 'Unschooling', sort_order: 1 },
    { value: 'Eclectic', label: 'Eclectic', sort_order: 2 },
    { value: 'Montessori', label: 'Montessori', sort_order: 3 },
    { value: 'Waldorf/Steiner', label: 'Waldorf/Steiner', sort_order: 4 },
    { value: 'Charlotte Mason', label: 'Charlotte Mason', sort_order: 5 },
    { value: 'Relaxed', label: 'Relaxed', sort_order: 6 },
    { value: 'Classical', label: 'Classical', sort_order: 7 },
    { value: 'Other', label: 'Other', sort_order: 99 },
  ],
};
