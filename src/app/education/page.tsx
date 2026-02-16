'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

type EducationSection = 'resources' | 'circles';

export default function EducationPage() {
  const [activeSection, setActiveSection] = useState<EducationSection>('resources');
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  const sections = [
    { key: 'resources', label: 'Resources' },
    { key: 'circles', label: 'Circles' },
  ] as const;

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        <HavenHeader />

        {/* Section Navigation */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key as EducationSection)}
              className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
                activeSection === section.key
                  ? 'bg-emerald-600 text-white shadow-md scale-105'
                  : 'bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Search Controls */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
              showSearch || searchTerm
                ? 'bg-teal-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Search
          </button>
        </div>

        {/* Expandable Search Bar */}
        {showSearch && (
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder={`Search ${activeSection}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Content Sections */}
        <div className="mt-6">
          {/* Resources Section */}
          {activeSection === 'resources' && (
            <div className="space-y-4">
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-emerald-600 rounded-full mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Educational Resources</h3>
                <p className="text-gray-600 mb-6">
                  Discover curated educational materials, curricula, and learning tools for homeschooling families.
                </p>
                <div className="text-sm text-gray-500">
                  Coming soon - Connect with educational resources in your area
                </div>
              </div>
            </div>
          )}

          {/* Circles Section */}
          {activeSection === 'circles' && (
            <div className="space-y-4">
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-emerald-600 rounded-full mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Learning Circles</h3>
                <p className="text-gray-600 mb-6">
                  Join or create educational co-ops, study groups, and collaborative learning opportunities.
                </p>
                <div className="text-sm text-gray-500">
                  Coming soon - Organize learning circles with other families
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}