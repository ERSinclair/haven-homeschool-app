'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Compressor from 'compressorjs';

interface Photo {
  id: string;
  url: string;
  thumbnail_url?: string;
  uploaded_at: string;
  file_name: string;
}

interface PhotoGalleryProps {
  userId: string;
  editable?: boolean;
  maxPhotos?: number;
  viewingUserId?: string; // ID of the user viewing the gallery
}

export default function PhotoGallery({
  userId,
  editable = false,
  maxPhotos = 12,
  viewingUserId
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [longPressing, setLongPressing] = useState<string | null>(null);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [galleryPrivacy, setGalleryPrivacy] = useState<'public' | 'private' | 'connections' | 'selected'>('public');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [connections, setConnections] = useState<any[]>([]);
  // Temporary state for the modal
  const [tempPrivacy, setTempPrivacy] = useState<'public' | 'private' | 'connections' | 'selected'>('public');
  const [tempSelectedUsers, setTempSelectedUsers] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load photos and privacy settings on mount
  useEffect(() => {
    loadPhotos();
    if (editable) {
      loadConnections();
    }
    const loadAndCheck = async () => {
      await loadPrivacySettings();
      await checkGalleryAccess();
    };
    loadAndCheck();
  }, [userId, viewingUserId]);

  // Re-check access when privacy settings change
  useEffect(() => {
    checkGalleryAccess();
  }, [galleryPrivacy, selectedUsers, viewingUserId]);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
      setLongPressing(null);
    };
  }, [longPressTimer]);

  const loadPhotos = async () => {
    try {
      setLoading(true);
      
      // Get photos from database (we'll create this table)
      const { data, error } = await supabase
        .from('profile_photos')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Error loading photos:', error);
        // If table doesn't exist, we'll get photos from storage directly
        await loadPhotosFromStorage();
        return;
      }

      setPhotos(data || []);
    } catch (err) {
      console.error('Error loading photos:', err);
      await loadPhotosFromStorage();
    } finally {
      setLoading(false);
    }
  };

  const loadPhotosFromStorage = async () => {
    try {
      // List files in user's folder
      const { data, error } = await supabase.storage
        .from('profile-photos')
        .list(userId, {
          limit: maxPhotos,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        console.error('Storage error:', error);
        return;
      }

      // Filter out avatar.jpg and convert to Photo objects
      const photoFiles = (data || [])
        .filter(file => file.name !== 'avatar.jpg' && !file.name.startsWith('.'))
        .map(file => {
          const { data: urlData } = supabase.storage
            .from('profile-photos')
            .getPublicUrl(`${userId}/${file.name}`);

          return {
            id: file.id || file.name,
            url: urlData.publicUrl,
            uploaded_at: file.created_at || new Date().toISOString(),
            file_name: file.name
          };
        });

      setPhotos(photoFiles);
    } catch (err) {
      console.error('Error loading from storage:', err);
    }
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      new Compressor(file, {
        quality: 0.8,
        maxWidth: 1200,
        maxHeight: 1200,
        mimeType: 'image/jpeg',
        convertTypes: ['image/png', 'image/webp'],
        success: (compressedFile) => {
          resolve(compressedFile as File);
        },
        error: reject,
      });
    });
  };

  const createThumbnail = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      new Compressor(file, {
        quality: 0.6,
        maxWidth: 300,
        maxHeight: 300,
        mimeType: 'image/jpeg',
        convertTypes: ['image/png', 'image/webp'],
        success: (thumbnailFile) => {
          resolve(thumbnailFile as File);
        },
        error: reject,
      });
    });
  };

  const uploadPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError(null);
      const files = event.target.files;
      if (!files || files.length === 0) return;

      // Check if adding these photos would exceed the limit
      if (photos.length + files.length > maxPhotos) {
        setError(`Maximum ${maxPhotos} photos allowed. You can add ${maxPhotos - photos.length} more.`);
        return;
      }

      setUploading(true);
      const newPhotos: Photo[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          setError(`${file.name} is not an image file`);
          continue;
        }

        // Validate file size (20MB limit before processing)
        if (file.size > 20 * 1024 * 1024) {
          setError(`${file.name} is too large (max 20MB)`);
          continue;
        }

        setUploadProgress(`Processing ${file.name}...`);

        try {
          // Compress the image
          const compressedFile = await compressImage(file);
          
          // Create thumbnail
          const thumbnailFile = await createThumbnail(file);

          // Generate unique filename
          const timestamp = Date.now();
          const fileExt = 'jpg'; // Always use jpg after compression
          const fileName = `photo_${timestamp}_${i}.${fileExt}`;
          const thumbnailName = `thumb_${timestamp}_${i}.${fileExt}`;

          setUploadProgress(`Uploading ${file.name}...`);

          // Upload main image
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-photos')
            .upload(`${userId}/${fileName}`, compressedFile);

          if (uploadError) {
            console.error('Upload error:', uploadError);
            setError(`Failed to upload ${file.name}`);
            continue;
          }

          // Upload thumbnail
          const { error: thumbnailError } = await supabase.storage
            .from('profile-photos')
            .upload(`${userId}/${thumbnailName}`, thumbnailFile);

          // Get public URLs
          const { data: urlData } = supabase.storage
            .from('profile-photos')
            .getPublicUrl(`${userId}/${fileName}`);

          const { data: thumbUrlData } = supabase.storage
            .from('profile-photos')
            .getPublicUrl(`${userId}/${thumbnailName}`);

          const newPhoto: Photo = {
            id: `${userId}-${timestamp}-${i}`,
            url: `${urlData.publicUrl}?t=${timestamp}`,
            thumbnail_url: thumbnailError ? undefined : `${thumbUrlData.publicUrl}?t=${timestamp}`,
            uploaded_at: new Date().toISOString(),
            file_name: fileName
          };

          // Try to save to database (if table exists)
          try {
            await supabase.from('profile_photos').insert({
              id: newPhoto.id,
              user_id: userId,
              url: newPhoto.url,
              thumbnail_url: newPhoto.thumbnail_url,
              uploaded_at: newPhoto.uploaded_at,
              file_name: newPhoto.file_name
            });
          } catch (dbError) {
            console.log('Database insert failed (table may not exist):', dbError);
          }

          newPhotos.push(newPhoto);
        } catch (processError) {
          console.error('Error processing file:', processError);
          setError(`Failed to process ${file.name}`);
        }
      }

      // Update state with new photos
      setPhotos(prev => [...newPhotos, ...prev]);
      setUploadProgress('');

    } catch (err) {
      console.error('Upload error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress('');
      // Reset the file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // deletePhoto function removed - now using batch selection system

  const openModal = (photo: Photo) => {
    setSelectedPhoto(photo);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPhoto(null);
  };

  // Long hold selection handlers
  const handleLongPressStart = (photoId: string, event: React.MouseEvent | React.TouchEvent) => {
    setLongPressing(photoId);
    
    const timer = setTimeout(() => {
      setSelectionMode(true);
      setSelectedPhotos([photoId]);
      setLongPressing(null);
    }, 1000); // 1 second long press

    setLongPressTimer(timer);
    // Removed preventDefault() to avoid passive event listener warning
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setLongPressing(null);
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedPhotos([]);
    setLongPressing(null);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const deleteSelectedPhotos = async () => {
    if (selectedPhotos.length === 0) return;

    const confirmed = confirm(`Delete ${selectedPhotos.length} photo${selectedPhotos.length > 1 ? 's' : ''}?`);
    if (!confirmed) return;

    try {
      setError(null);
      
      // Get photos to delete
      const photosToDelete = photos.filter(p => selectedPhotos.includes(p.id));
      
      // Delete from storage
      for (const photo of photosToDelete) {
        const filesToDelete = [photo.file_name];
        if (photo.thumbnail_url) {
          const thumbFileName = photo.file_name.replace('photo_', 'thumb_');
          filesToDelete.push(thumbFileName);
        }

        await supabase.storage
          .from('profile-photos')
          .remove(filesToDelete.map(name => `${userId}/${name}`));

        // Delete from database if exists
        try {
          await supabase.from('profile_photos').delete().eq('id', photo.id);
        } catch (dbError) {
          console.log('Database delete failed (table may not exist):', dbError);
        }
      }

      // Update state
      setPhotos(prev => prev.filter(p => !selectedPhotos.includes(p.id)));
      exitSelectionMode();

    } catch (err) {
      console.error('Batch delete error:', err);
      setError('Failed to delete photos');
    }
  };

  // Privacy-related functions
  const loadPrivacySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('gallery_privacy, gallery_selected_users')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setGalleryPrivacy(data.gallery_privacy || 'public');
        setSelectedUsers(data.gallery_selected_users || []);
      } else if (error && error.code === 'PGRST204') {
        // Columns don't exist yet - use defaults
        console.log('Gallery privacy columns not yet added to database, using defaults');
        setGalleryPrivacy('public');
        setSelectedUsers([]);
      }
    } catch (err) {
      console.error('Error loading privacy settings:', err);
      // Fallback to public if there's any error
      setGalleryPrivacy('public');
      setSelectedUsers([]);
    }
  };

  const savePrivacySettings = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          gallery_privacy: tempPrivacy,
          gallery_selected_users: tempSelectedUsers
        })
        .eq('id', userId);

      if (error) {
        if (error.code === 'PGRST204') {
          // Columns don't exist - show helpful message
          alert('Gallery privacy features require a database update. Please contact support to enable this feature.');
          return;
        }
        console.error('Error saving privacy settings:', error);
        alert('Failed to save privacy settings. Please try again.');
        return;
      }

      // Update actual state with temp values
      setGalleryPrivacy(tempPrivacy);
      setSelectedUsers(tempSelectedUsers);
      setShowPrivacySettings(false);
    } catch (err) {
      console.error('Error saving privacy settings:', err);
      alert('Failed to save privacy settings. Please try again.');
    }
  };

  const openPrivacySettings = () => {
    // Initialize temp state with current values
    setTempPrivacy(galleryPrivacy);
    setTempSelectedUsers([...selectedUsers]);
    setShowPrivacySettings(true);
  };

  const loadConnections = async () => {
    try {
      const { data, error } = await supabase
        .from('connections')
        .select(`
          *,
          requester:profiles!connections_requester_id_fkey(id, family_name, display_name),
          receiver:profiles!connections_receiver_id_fkey(id, family_name, display_name)
        `)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

      if (!error && data) {
        const processedConnections = data.map((conn: any) => {
          const otherUser = conn.requester_id === userId ? conn.receiver : conn.requester;
          return {
            id: otherUser.id,
            name: otherUser.family_name || otherUser.display_name || 'Unknown'
          };
        });
        setConnections(processedConnections);
      }
    } catch (err) {
      console.error('Error loading connections:', err);
    }
  };

  const checkGalleryAccess = async () => {
    // If viewing your own gallery, always have access
    if (!viewingUserId || viewingUserId === userId) {
      setHasAccess(true);
      return;
    }

    // If privacy columns don't exist yet, default to public access
    if (galleryPrivacy === 'public') {
      setHasAccess(true);
      return;
    }

    if (galleryPrivacy === 'private') {
      setHasAccess(false);
      return;
    }

    if (galleryPrivacy === 'selected') {
      setHasAccess(selectedUsers.includes(viewingUserId));
      return;
    }

    if (galleryPrivacy === 'connections') {
      // Check if viewing user is a connection
      try {
        const { data, error } = await supabase
          .from('connections')
          .select('id')
          .eq('status', 'accepted')
          .or(`
            and(requester_id.eq.${userId},receiver_id.eq.${viewingUserId}),
            and(requester_id.eq.${viewingUserId},receiver_id.eq.${userId})
          `)
          .limit(1);

        setHasAccess(!error && data && data.length > 0);
      } catch (err) {
        console.error('Error checking connection:', err);
        // Default to public access if there's an error
        setHasAccess(true);
      }
      return;
    }

    // Default fallback - allow access
    setHasAccess(true);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Photo Gallery</h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  // Access control check
  if (!hasAccess && viewingUserId && viewingUserId !== userId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Photo Gallery</h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          <div className="w-16 h-16 bg-gray-100 rounded-lg mx-auto mb-3 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-sm">This gallery is private</p>
          <p className="text-xs text-gray-400 mt-1">
            {galleryPrivacy === 'connections' ? 'Only connections can view' : 'Access restricted'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Photo Gallery</h3>
          <div className="flex gap-2">
            {editable && (
              <button
                onClick={openPrivacySettings}
                className="px-2 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Privacy
              </button>
            )}
            {editable && photos.length < maxPhotos && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-2 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 transition-colors"
              >
                {uploading ? 'Uploading...' : 'Add Photos'}
              </button>
            )}
          </div>
        </div>

        {/* Upload progress */}
        {uploadProgress && (
          <div className="mb-4 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded">
            {uploadProgress}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </div>
        )}

        {/* Photo grid */}
        {photos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="w-16 h-16 bg-gray-100 rounded-lg mx-auto mb-3 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm">No photos yet</p>
            {editable && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-emerald-600 text-sm font-medium hover:text-emerald-700"
              >
                Add your first photo
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Selection mode header */}
            {selectionMode && (
              <div className="flex items-center justify-between mb-4 p-3 bg-emerald-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <button
                    onClick={exitSelectionMode}
                    className="text-emerald-600 font-medium"
                  >
                    Cancel
                  </button>
                  <span className="text-sm text-emerald-700">
                    {selectedPhotos.length} selected
                  </span>
                </div>
                {selectedPhotos.length > 0 && (
                  <button
                    onClick={deleteSelectedPhotos}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Delete {selectedPhotos.length} photo{selectedPhotos.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )}

            {/* Photo grid */}
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className={`aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-all relative ${
                    selectedPhotos.includes(photo.id) ? 'ring-2 ring-emerald-600' : ''
                  } ${selectionMode ? 'hover:ring-2 hover:ring-emerald-300' : ''} ${
                    longPressing === photo.id ? 'ring-2 ring-orange-400 scale-95' : ''
                  }`}
                  onClick={(e) => {
                    if (selectionMode) {
                      togglePhotoSelection(photo.id);
                    } else {
                      openModal(photo);
                    }
                  }}
                  onMouseDown={(e) => {
                    if (!selectionMode) {
                      handleLongPressStart(photo.id, e);
                    }
                  }}
                  onMouseUp={handleLongPressEnd}
                  onMouseLeave={handleLongPressEnd}
                  onTouchStart={(e) => {
                    if (!selectionMode) {
                      handleLongPressStart(photo.id, e);
                    }
                  }}
                  onTouchEnd={handleLongPressEnd}
                  onTouchCancel={handleLongPressEnd}
                >
                  <img
                    src={photo.thumbnail_url || photo.url}
                    alt="Gallery photo"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to main image if thumbnail fails
                      if (photo.thumbnail_url && e.currentTarget.src !== photo.url) {
                        e.currentTarget.src = photo.url;
                      }
                    }}
                  />
                  {/* Selection indicator */}
                  {selectionMode && (
                    <div className="absolute top-2 right-2">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedPhotos.includes(photo.id)
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-gray-300'
                      }`}>
                        {selectedPhotos.includes(photo.id) && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Photo count indicator */}
        {editable && (
          <div className="mt-4 text-xs text-gray-500 text-center">
            {photos.length} of {maxPhotos} photos
          </div>
        )}

        {/* Hidden file input */}
        {editable && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={uploadPhotos}
            className="hidden"
          />
        )}
      </div>

      {/* Photo Modal */}
      {showModal && selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={selectedPhoto.url}
              alt="Full size photo"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={closeModal}
            />
          </div>
        </div>
      )}

      {/* Privacy Settings Modal */}
      {showPrivacySettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Gallery Privacy</h3>
              <button
                onClick={() => setShowPrivacySettings(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Public */}
              <button
                onClick={() => setTempPrivacy('public')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  tempPrivacy === 'public' 
                    ? 'border-emerald-600 bg-emerald-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 text-green-600">🌍</div>
                  <div>
                    <div className="font-medium text-gray-900">Public</div>
                    <div className="text-sm text-gray-600">Everyone can see your photos</div>
                  </div>
                  {tempPrivacy === 'public' && (
                    <div className="ml-auto text-emerald-600">✓</div>
                  )}
                </div>
              </button>

              {/* Connections Only */}
              <button
                onClick={() => setTempPrivacy('connections')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  tempPrivacy === 'connections' 
                    ? 'border-emerald-600 bg-emerald-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 text-blue-600">👥</div>
                  <div>
                    <div className="font-medium text-gray-900">Connections Only</div>
                    <div className="text-sm text-gray-600">Only your connections can see your photos</div>
                  </div>
                  {tempPrivacy === 'connections' && (
                    <div className="ml-auto text-emerald-600">✓</div>
                  )}
                </div>
              </button>

              {/* Selected Users */}
              <div className={`border-2 rounded-xl transition-colors ${
                tempPrivacy === 'selected' 
                  ? 'border-emerald-600 bg-emerald-50' 
                  : 'border-gray-200'
              }`}>
                <button
                  onClick={() => setTempPrivacy('selected')}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 text-purple-600">👤</div>
                    <div>
                      <div className="font-medium text-gray-900">Selected People</div>
                      <div className="text-sm text-gray-600">Choose who can see your photos</div>
                    </div>
                    {tempPrivacy === 'selected' && (
                      <div className="ml-auto text-emerald-600">✓</div>
                    )}
                  </div>
                </button>

                {tempPrivacy === 'selected' && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                      {connections.map((connection) => (
                        <label key={connection.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tempSelectedUsers.includes(connection.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTempSelectedUsers([...tempSelectedUsers, connection.id]);
                              } else {
                                setTempSelectedUsers(tempSelectedUsers.filter(id => id !== connection.id));
                              }
                            }}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-gray-700">{connection.name}</span>
                        </label>
                      ))}
                      {connections.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-2">
                          No connections yet
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Private */}
              <button
                onClick={() => setTempPrivacy('private')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  tempPrivacy === 'private' 
                    ? 'border-emerald-600 bg-emerald-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 text-red-600">🔒</div>
                  <div>
                    <div className="font-medium text-gray-900">Private</div>
                    <div className="text-sm text-gray-600">Only you can see your photos</div>
                  </div>
                  {tempPrivacy === 'private' && (
                    <div className="ml-auto text-emerald-600">✓</div>
                  )}
                </div>
              </button>
            </div>

            {/* Save/Cancel Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPrivacySettings(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePrivacySettings}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}