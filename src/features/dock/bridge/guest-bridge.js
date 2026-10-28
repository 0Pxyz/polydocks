/**
 * Polymax Guest Bridge Preamble
 *
 * Injected into every sandboxed iframe dynamic tab.
 * Implements bidirectional postMessage communication between host and guest.
 */

export const GUEST_BRIDGE_SCRIPT = `
(function() {
  const pendingRequests = new Map();
  let requestId = 0;

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    const { polymaxResponseId, result, error } = event.data;
    if (polymaxResponseId && pendingRequests.has(polymaxResponseId)) {
      const { resolve, reject } = pendingRequests.get(polymaxResponseId);
      pendingRequests.delete(polymaxResponseId);
      if (error) reject(new Error(error));
      else resolve(result);
    }
  });

  function sendHostRequest(action, payload) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });
      window.parent.postMessage({
        polymaxAction: action,
        polymaxRequestId: id,
        ...payload
      }, '*');
    });
  }

  // Error capture & reporting to host runtime
  window.addEventListener('error', function(event) {
    window.parent.postMessage({
      polymaxAction: 'runtime.error',
      error: {
        message: event.message || 'Unknown error',
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        stack: event.error ? event.error.stack : '',
        timestamp: new Date().toISOString()
      }
    }, '*');
  });

  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    window.parent.postMessage({
      polymaxAction: 'runtime.error',
      error: {
        message: reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection',
        stack: reason && reason.stack ? reason.stack : '',
        timestamp: new Date().toISOString()
      }
    }, '*');
  });

    window.polymax = {
    storage: {
      get: (key) => sendHostRequest('storage.get', { key }),
      set: (key, value) => sendHostRequest('storage.set', { key, value }),
      remove: (key) => sendHostRequest('storage.remove', { key }),
    },
    invoke: (capabilityId, input) => sendHostRequest('capability.invoke', { capabilityId, input }),
    invokeAction: (action, args) => sendHostRequest('capability.invoke', { capabilityId: action, input: args }),
    openUrl: (url) => sendHostRequest('openUrl', { url }),
    getContext: () => sendHostRequest('getContext', {}),
    submit: (command) => sendHostRequest('submit', { command }),
    ui: {
      expand: () => sendHostRequest('ui.expand', {}),
      collapse: () => sendHostRequest('ui.collapse', {}),
    },
    theme: {
      accent: '#C8FF57',
      bg: '#0A0A0C',
      surface: '#131318',
      text: '#F0F0F5',
    }
  };
  window.polydocks = window.polymax;
})();
`;
