// Test script to verify image processing functions work
// This would be run in browser console or as part of component testing

const testImageProcessing = () => {
  console.log('Image processing functions available:');
  
  // Test if Compressor is available
  try {
    console.log('✅ Compressor.js loaded:', typeof Compressor !== 'undefined');
  } catch (e) {
    console.log('❌ Compressor.js not available:', e.message);
  }
  
  // Test canvas functionality
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    console.log('✅ Canvas 2D context available:', !!ctx);
  } catch (e) {
    console.log('❌ Canvas not available:', e.message);
  }
  
  // Test File API
  try {
    const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    console.log('✅ File API available:', testFile instanceof File);
  } catch (e) {
    console.log('❌ File API not available:', e.message);
  }
  
  console.log('Image processing test complete');
};

// Export for browser testing
if (typeof window !== 'undefined') {
  window.testImageProcessing = testImageProcessing;
}

// For Node.js testing
if (typeof module !== 'undefined') {
  module.exports = testImageProcessing;
}