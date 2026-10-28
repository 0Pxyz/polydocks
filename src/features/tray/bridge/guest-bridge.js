/**
 * Polymax Guest Bridge Preamble
 *
 * Injected into every sandboxed iframe feature tab.
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

  window.polymax = {
    storage: {
      get: (key) => sendHostRequest('storage.get', { key }),
      set: (key, value) => sendHostRequest('storage.set', { key, value }),
      remove: (key) => sendHostRequest('storage.remove', { key }),
    },
    openUrl: (url) => sendHostRequest('openUrl', { url }),
    getContext: () => sendHostRequest('getContext', {}),
    submit: (command) => sendHostRequest('submit', { command }),
    ui: {
      expand: () => sendHostRequest('ui.expand', {}),
      collapse: () => sendHostRequest('ui.collapse', {}),
    }
  };
})();
`;
