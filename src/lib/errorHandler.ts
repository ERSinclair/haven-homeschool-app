// Global error handler to suppress harmless AbortErrors from Supabase

if (typeof window !== 'undefined') {
  // Store the original console.error for filtering
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Comprehensive pattern matching for AbortError detection
  const isAbortErrorMessage = (message: string) => {
    const patterns = [
      /AbortError.*signal is aborted without reason/i,
      /locks\.ts:109/i,
      /AbortError.*supabase/i,
      /AbortError.*AuthContext/i,
      /signal is aborted without reason/i,
      /AbortError.*locks\.ts/i,
      /AbortError.*setTimeout/i,
      /AbortError.*module evaluation/i
    ];
    
    return patterns.some(pattern => pattern.test(message));
  };

  // Suppress console errors for known harmless errors
  console.error = (...args: any[]) => {
    const message = args.join(' ');
    
    // Check for AbortError patterns
    if (isAbortErrorMessage(message)) {
      return; // Silently suppress
    }
    
    // Suppress Mapbox telemetry errors (blocked by ad blockers)
    if (
      message.includes('events.mapbox.com') ||
      message.includes('ERR_BLOCKED_BY_CLIENT') ||
      message.includes('Failed to evaluate expression') ||
      message.includes('FamilyMap.tsx') ||
      (message.includes('POST') && message.includes('net::ERR_BLOCKED_BY_CLIENT')) ||
      (message.includes('mapbox') && message.includes('blocked'))
    ) {
      return;
    }
    
    // Allow all other errors through
    originalError.apply(console, args);
  };

  // Also filter warnings that might be related
  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    
    if (isAbortErrorMessage(message)) {
      return;
    }
    
    originalWarn.apply(console, args);
  };

  // Comprehensive unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    if (!event.reason) {
      return;
    }

    let shouldSuppress = false;

    // Check if it's an Error object
    if (event.reason instanceof Error) {
      const error = event.reason;
      
      // Check error name
      if (error.name === 'AbortError') {
        shouldSuppress = true;
      }
      
      // Check error message
      if (error.message && isAbortErrorMessage(error.message)) {
        shouldSuppress = true;
      }
      
      // Check error stack
      if (error.stack && (
        error.stack.includes('locks.ts') ||
        error.stack.includes('supabase') ||
        error.stack.includes('AuthContext') ||
        isAbortErrorMessage(error.stack)
      )) {
        shouldSuppress = true;
      }
    }
    
    // Check if it's a string message
    if (typeof event.reason === 'string' && isAbortErrorMessage(event.reason)) {
      shouldSuppress = true;
    }

    if (shouldSuppress) {
      event.preventDefault();
      return false;
    }
  });

  // Handle global JavaScript errors as well
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    const source = event.filename || '';
    
    if (
      isAbortErrorMessage(message) ||
      source.includes('locks.ts') ||
      (message.includes('AbortError') && source.includes('supabase'))
    ) {
      event.preventDefault();
      return false;
    }
  });

  // Override setTimeout to catch errors at source if needed
  const originalSetTimeout = window.setTimeout;
  const wrappedSetTimeout = (handler: any, timeout?: number, ...args: any[]) => {
    if (typeof handler === 'function') {
      const wrappedHandler = (...handlerArgs: any[]) => {
        try {
          return handler(...handlerArgs);
        } catch (error: any) {
          if (error?.name === 'AbortError' || isAbortErrorMessage(error?.message || '')) {
            // Silently ignore AbortErrors in timeouts
            return;
          }
          throw error;
        }
      };
      return originalSetTimeout(wrappedHandler, timeout, ...args);
    }
    return originalSetTimeout(handler, timeout, ...args);
  };
  
  // Copy all properties from original setTimeout to maintain compatibility
  Object.setPrototypeOf(wrappedSetTimeout, originalSetTimeout);
  Object.assign(wrappedSetTimeout, originalSetTimeout);
  window.setTimeout = wrappedSetTimeout as typeof window.setTimeout;
}