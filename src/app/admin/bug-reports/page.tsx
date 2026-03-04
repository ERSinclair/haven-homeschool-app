'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BugReportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/feedback'); }, [router]);
  return null;
}
