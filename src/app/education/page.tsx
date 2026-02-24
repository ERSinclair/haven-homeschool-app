'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
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
      <div className="max-w-md mx-auto px-4 pt-2 pb-8">
        <AppHeader backHref="/discover" />

        {/* Section Navigation */}
        <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key as EducationSection)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeSection === section.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Search Controls */}
        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              showSearch || searchTerm ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
                <div className="w-20 h-20 bg-emerald-50 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <svg 
                    viewBox="0 0 64 64" 
                    className="w-16 h-16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Adult head (centered) */}
                    <circle 
                      cx="32" 
                      cy="29" 
                      r="11" 
                      fill="rgba(75, 85, 99, 0.8)"
                      stroke="rgba(75, 85, 99, 0.9)" 
                      strokeWidth="1"
                    />
                    {/* Adult shoulders */}
                    <path 
                      d="M18 52 C18 44, 24 40, 32 40 C40 40, 46 44, 46 52" 
                      fill="rgba(75, 85, 99, 0.8)"
                      stroke="rgba(75, 85, 99, 0.9)" 
                      strokeWidth="1"
                    />
                    
                    {/* Left child head */}
                    <circle 
                      cx="13" 
                      cy="40" 
                      r="7" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                    {/* Left child shoulders */}
                    <path 
                      d="M4 54 C4 50, 7 47, 13 47 C19 47, 22 50, 22 54" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                    
                    {/* Right child head */}
                    <circle 
                      cx="51" 
                      cy="40" 
                      r="7" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                    {/* Right child shoulders */}
                    <path 
                      d="M42 54 C42 50, 45 47, 51 47 C57 47, 60 50, 60 54" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                  </svg>
                </div>
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
                <div className="w-20 h-20 bg-emerald-50 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <svg 
                    viewBox="0 0 64 64" 
                    className="w-16 h-16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Adult head (centered) */}
                    <circle 
                      cx="32" 
                      cy="29" 
                      r="11" 
                      fill="rgba(75, 85, 99, 0.8)"
                      stroke="rgba(75, 85, 99, 0.9)" 
                      strokeWidth="1"
                    />
                    {/* Adult shoulders */}
                    <path 
                      d="M18 52 C18 44, 24 40, 32 40 C40 40, 46 44, 46 52" 
                      fill="rgba(75, 85, 99, 0.8)"
                      stroke="rgba(75, 85, 99, 0.9)" 
                      strokeWidth="1"
                    />
                    
                    {/* Left child head */}
                    <circle 
                      cx="13" 
                      cy="40" 
                      r="7" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                    {/* Left child shoulders */}
                    <path 
                      d="M4 54 C4 50, 7 47, 13 47 C19 47, 22 50, 22 54" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                    
                    {/* Right child head */}
                    <circle 
                      cx="51" 
                      cy="40" 
                      r="7" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                    {/* Right child shoulders */}
                    <path 
                      d="M42 54 C42 50, 45 47, 51 47 C57 47, 60 50, 60 54" 
                      fill="rgba(75, 85, 99, 0.75)"
                      stroke="rgba(75, 85, 99, 0.85)" 
                      strokeWidth="0.8"
                    />
                  </svg>
                </div>
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
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>
    </ProtectedRoute>
  );
}