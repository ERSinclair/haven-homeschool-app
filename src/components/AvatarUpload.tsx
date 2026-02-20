'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Compressor from 'compressorjs';

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onAvatarChange?: (newAvatarUrl: string | null) => void;
  editable?: boolean;
  showFamilySilhouette?: boolean;
}

export default function AvatarUpload({
  userId,
  currentAvatarUrl,
  name,
  size = 'md',
  onAvatarChange,
  editable = false,
  showFamilySilhouette = true
}: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with prop changes
  useEffect(() => {
    setAvatarUrl(currentAvatarUrl || null);
  }, [currentAvatarUrl]);

  const getSizeInPx = () => {
    switch (size) {
      case 'xl': return 96;
      case 'lg': return 64;
      case 'md': return 48;
      case 'sm': return 32;
      default: return 48;
    }
  };

  const processImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      new Compressor(file, {
        quality: 0.8,
        maxWidth: 400,
        maxHeight: 400,
        mimeType: 'image/jpeg',
        convertTypes: ['image/png', 'image/webp'],
        success: (compressedFile) => {
          resolve(compressedFile as File);
        },
        error: reject,
      });
    });
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError(null);
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be smaller than 10MB');
        return;
      }

      setUploading(true);

      const processedFile = await processImage(file);
      const fileName = `${userId}/avatar.jpg`;

      const { data, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, processedFile, { upsert: true });

      if (uploadError) {
        setError('Failed to upload image. Please try again.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      const newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', userId);

      if (updateError) {
        setError('Failed to update profile. Please try again.');
        return;
      }

      setAvatarUrl(newAvatarUrl);
      onAvatarChange?.(newAvatarUrl);
      
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const removeAvatar = async () => {
    try {
      setUploading(true);
      setError(null);

      const fileName = `${userId}/avatar.jpg`;
      await supabase.storage.from('profile-photos').remove([fileName]);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (updateError) {
        setError('Failed to remove avatar');
        return;
      }

      setAvatarUrl(null);
      onAvatarChange?.(null);
      
    } catch (err) {
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

  const sizeInPx = getSizeInPx();
  
  return (
    <div className="relative">
      {/* Avatar Display - Pure CSS, no Tailwind conflicts */}
      <div 
        style={{
          width: `${sizeInPx}px`,
          height: `${sizeInPx}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          cursor: editable ? 'pointer' : 'default',
          backgroundColor: '#f0fdfa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: size === 'xl' ? '24px' : size === 'lg' ? '20px' : '16px'
        }}
        onClick={handleClick}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
            onError={() => {
              console.log('Avatar image failed to load:', avatarUrl);
              setAvatarUrl(null);
            }}
          />
        ) : (
          <svg 
            viewBox="0 0 64 64" 
            style={{
              width: '100%',
              height: '100%'
            }}
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
        )}
      </div>

      {/* Remove button removed - users can upload new photo to replace */}

      {/* Loading indicator */}
      {uploading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid white',
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        </div>
      )}

      {/* Hidden file input */}
      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={uploadAvatar}
          style={{ display: 'none' }}
        />
      )}

      {/* Error display */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '4px',
          fontSize: '12px',
          color: '#ef4444',
          backgroundColor: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 10,
          whiteSpace: 'nowrap'
        }}>
          {error}
        </div>
      )}

      {/* Add CSS animation */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}