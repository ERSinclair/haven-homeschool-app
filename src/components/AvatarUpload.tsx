'use client';

import { useState, useRef, useEffect } from 'react';
import Compressor from 'compressorjs';
import { getStoredSession } from '@/lib/session';
import ImageCropModal from './ImageCropModal';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onAvatarChange?: (newAvatarUrl: string | null) => void;
  editable?: boolean;
  showFamilySilhouette?: boolean;
  viewable?: boolean;
}

export default function AvatarUpload({
  userId,
  currentAvatarUrl,
  name,
  size = 'md',
  onAvatarChange,
  editable = false,
  showFamilySilhouette = true,
  viewable = false,
}: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingFullscreen, setViewingFullscreen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
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

      // Show crop modal instead of uploading directly
      const reader = new FileReader();
      reader.onload = () => setCropSrc(reader.result as string);
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setCropSrc(null);
    try {
      setUploading(true);
      setError(null);

      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const processedFile = await processImage(file);
      const session = getStoredSession();
      if (!session) { setError('Not logged in'); return; }

      const fileName = `${userId}/avatar.jpg`;

      // Upload to storage
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/profile-photos/${fileName}`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'x-upsert': 'true',
          },
          body: processedFile,
        }
      );

      if (!uploadRes.ok) {
        setError('Failed to upload image. Please try again.');
        return;
      }

      // Build public URL
      const newAvatarUrl = `${supabaseUrl}/storage/v1/object/public/profile-photos/${fileName}?t=${Date.now()}`;

      // Save URL to profile
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ avatar_url: newAvatarUrl }),
        }
      );

      if (!updateRes.ok) {
        setError('Failed to update profile. Please try again.');
        return;
      }

      setAvatarUrl(newAvatarUrl);
      onAvatarChange?.(newAvatarUrl);
      
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      setUploading(true);
      setError(null);

      const session = getStoredSession();
      if (!session) return;

      const fileName = `${userId}/avatar.jpg`;

      await fetch(
        `${supabaseUrl}/storage/v1/object/profile-photos/${fileName}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ avatar_url: null }),
        }
      );

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
    } else if (viewable && avatarUrl && !editable) {
      setViewingFullscreen(true);
    }
  };

  const sizeInPx = getSizeInPx();
  
  return (
    <div className="relative">
      {/* Image crop modal */}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspect={1}
          circular={true}
          title="Crop profile photo"
          onConfirm={handleCropConfirm}
          onCancel={() => { setCropSrc(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
        />
      )}

      {/* Fullscreen photo overlay */}
      {viewingFullscreen && avatarUrl && (
        <div
          onClick={() => setViewingFullscreen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
          }}
        >
          <img
            src={avatarUrl}
            alt={name}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '12px',
            }}
          />
          <button
            onClick={() => setViewingFullscreen(false)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Avatar Display - Pure CSS, no Tailwind conflicts */}
      <div 
        style={{
          width: `${sizeInPx}px`,
          height: `${sizeInPx}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          cursor: editable ? 'pointer' : (viewable && avatarUrl) ? 'zoom-in' : 'default',
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