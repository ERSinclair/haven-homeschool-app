'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getAvatarColor } from '@/lib/colors';

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onAvatarChange?: (newAvatarUrl: string | null) => void;
  editable?: boolean;
  showFamilySilhouette?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-xl'
};

export default function AvatarUpload({
  userId,
  currentAvatarUrl,
  name,
  size = 'md',
  onAvatarChange,
  editable = false,
  showFamilySilhouette = true
}: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    // Only set avatarUrl if it's a valid, non-empty string
    return (currentAvatarUrl && currentAvatarUrl.trim() !== '') ? currentAvatarUrl : null;
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with prop changes
  useEffect(() => {
    const validUrl = (currentAvatarUrl && currentAvatarUrl.trim() !== '') ? currentAvatarUrl : null;
    setAvatarUrl(validUrl);
    setImageLoadError(false);
  }, [currentAvatarUrl]);

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setError(null);

      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be smaller than 5MB');
        return;
      }

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/avatar.${fileExt}`;

      // Delete existing avatar if any
      if (avatarUrl) {
        const oldPath = avatarUrl.split('/').slice(-2).join('/'); // Get userId/filename
        await supabase.storage.from('profile-photos').remove([oldPath]);
      }

      // Upload new avatar
      const { data, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        setError('Failed to upload image. Please try again.');
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      const newAvatarUrl = urlData.publicUrl;

      // Update profile in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setError('Failed to update profile. Please try again.');
        return;
      }

      // Success
      setAvatarUrl(newAvatarUrl);
      onAvatarChange?.(newAvatarUrl);
      
    } catch (err) {
      console.error('Avatar upload error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      setUploading(true);
      setError(null);

      // Remove from storage if exists
      if (avatarUrl) {
        const path = avatarUrl.split('/').slice(-2).join('/');
        await supabase.storage.from('profile-photos').remove([path]);
      }

      // Update profile in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setError('Failed to remove avatar');
        return;
      }

      // Success
      setAvatarUrl(null);
      setImageLoadError(false);
      onAvatarChange?.(null);
      
    } catch (err) {
      console.error('Avatar removal error:', err);
      setError('Failed to remove avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    if (editable && !uploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="relative">
      {/* Avatar Display */}
      <div 
        className={`relative ${sizeClasses[size]} rounded-full overflow-hidden ${
          editable ? 'cursor-pointer' : ''
        }`}
        onClick={handleClick}
      >
        {avatarUrl && !imageLoadError && avatarUrl.trim() !== '' ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => {
              // Fallback when image fails to load
              setImageLoadError(true);
              setAvatarUrl(null);
            }}
            onLoad={() => {
              setImageLoadError(false);
            }}
          />
        ) : (
          <div className="w-full h-full bg-teal-50 flex items-center justify-center">
            <svg 
              viewBox="0 0 64 64" 
              className="w-full h-full"
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
        )}
        
        {/* Upload overlay - only show for existing images */}
        {editable && avatarUrl && !imageLoadError && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
            <div className="opacity-0 hover:opacity-100 transition-opacity duration-200">
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={uploadAvatar}
          className="hidden"
        />
      )}

      {/* Remove button for uploaded photos - only show for successfully loaded images */}
      {editable && avatarUrl && avatarUrl.trim() !== '' && !uploading && !imageLoadError && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeAvatar();
          }}
          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
          title="Remove photo"
        >
          ×
        </button>
      )}

      {/* Error display */}
      {error && (
        <div className="absolute top-full left-0 mt-1 text-xs text-red-600 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}