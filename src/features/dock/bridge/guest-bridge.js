/**
 * Polydocks Guest Bridge Preamble
 *
 * Injected into every sandboxed iframe dynamic tab.
 * Implements bidirectional postMessage communication between host and guest.
 */

export const GUEST_BRIDGE_SCRIPT = `
(function() {
  const pendingRequests = new Map();
  let requestId = 0;
  // Default 10s per-request timeout (override with
  // window.__POLYDOCKS_BRIDGE_TIMEOUT_MS). Without this, a host that never
  // replies (e.g. a stale bridge window) strands guest promises forever.
  const REQUEST_TIMEOUT_MS = window.__POLYDOCKS_BRIDGE_TIMEOUT_MS || 10000;
  // Ready-handshake ack window (override with
  // window.__POLYDOCKS_BRIDGE_ACK_TIMEOUT_MS). Shorter than the request
  // timeout so a dead bridge is reported while the host error row is live.
  const READY_ACK_TIMEOUT_MS = window.__POLYDOCKS_BRIDGE_ACK_TIMEOUT_MS || 4000;

  // Active theme: the host owns it. Applied from the ui.ready ack and
  // from live polydocksTheme pushes so the sandbox follows theme changes
  // without a reload. Names are restricted to the known theme ids.
  function applyTheme(name) {
    try {
      if (typeof name === "string" && /^[a-z-]{1,24}$/.test(name)) {
        document.documentElement.dataset.theme = name;
      }
    } catch (e) { /* headless or detached document */ }
  }

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (typeof event.data.polydocksTheme === 'string') {
      applyTheme(event.data.polydocksTheme);
      return;
    }
    const { polydocksResponseId, result, error } = event.data;
    if (polydocksResponseId && pendingRequests.has(polydocksResponseId)) {
      const { resolve, reject, timer } = pendingRequests.get(polydocksResponseId);
      if (timer) clearTimeout(timer);
      pendingRequests.delete(polydocksResponseId);
      if (error) reject(new Error(error));
      else resolve(result);
    }
  });

  function bridgeTimeoutError(action, ms) {
    return new Error(
      "Bridge request '" + action + "' timed out after " + ms + "ms: " +
      "the host did not reply. Reload the tool; if this persists, ask the agent to fix it."
    );
  }

  function sendHostRequest(action, payload, timeoutMs) {
    const ms = timeoutMs || REQUEST_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timer = setTimeout(function() {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(bridgeTimeoutError(action, ms));
        }
      }, ms);
      pendingRequests.set(id, { resolve, reject, timer });
      window.parent.postMessage({
        polydocksAction: action,
        polydocksRequestId: id,
        ...payload
      }, '*');
    });
  }

  function reportBridgeError(message) {
    window.parent.postMessage({
      polydocksAction: 'runtime.error',
      error: {
        message: message,
        timestamp: new Date().toISOString()
      }
    }, '*');
  }

  // Startup handshake. The guest is ready AND learns whether the host is
  // listening: the host replies to the ready message (see host-bridge
  // runtime.ready/ui.ready). The ready post below carries
  // polydocksAction: "ui.ready" so host new-build detection keeps matching.
  // No ack within a few seconds means the bridge is dead: report
  // "bridge not responding" so the host shows its failed-to-load error row
  // ("Ask the agent to fix it") and records the experience error.
  function signalReady() {
    return sendHostRequest('ui.ready', {}, READY_ACK_TIMEOUT_MS).then(
      function(result) {
        if (result && typeof result.theme === "string") applyTheme(result.theme);
        return true;
      },
      function(err) {
        reportBridgeError(
          "Bridge not responding: the tool mounted but the host did not " +
          "acknowledge the ready handshake (" + (err && err.message ? err.message : err) + "). " +
          "Reload the tool; if this persists, ask the agent to fix it."
        );
        return false;
      }
    );
  }

  // Error capture & reporting to host runtime
  window.addEventListener('error', function(event) {
    window.parent.postMessage({
      polydocksAction: 'runtime.error',
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
      polydocksAction: 'runtime.error',
      error: {
        message: reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection',
        stack: reason && reason.stack ? reason.stack : '',
        timestamp: new Date().toISOString()
      }
    }, '*');
  });

    window.polydocks = {
    storage: {
      get: (key) => sendHostRequest('storage.get', { key }),
      set: (key, value) => sendHostRequest('storage.set', { key, value }),
      remove: (key) => sendHostRequest('storage.remove', { key }),
    },
    invoke: (capabilityId, input) => sendHostRequest('capability.invoke', { capabilityId, input }),
    // useCapability calls the existing capability bus (policy, timeout and
    // audit apply host-side). Returns a promise; rejects with the host error.
    useCapability: async (capabilityId, input) => {
      if (!capabilityId) throw new Error('useCapability requires a capabilityId');
      try {
        return await sendHostRequest('capability.invoke', { capabilityId, input });
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    invokeAction: (action, args) => sendHostRequest('capability.invoke', { capabilityId: action, input: args }),
    // task registers background work with the host tab runtime. The host
    // keeps the tab entry (and its iframe) alive while tasks run, surfaces
    // progress, and notifies on completion — work is never tied to the
    // component lifecycle. Payloads are capped; results stay guest-side.
    task: {
      start: (task) => sendHostRequest('task.start', task || {}),
      update: (id, patch) => sendHostRequest('task.update', Object.assign({ taskId: id }, patch || {})),
      done: (id, detail) => sendHostRequest('task.done', { taskId: id, detail: detail }),
    },
    openUrl: (url) => sendHostRequest('openUrl', { url }),
    // openContent opens an article/video in the native in-app Reader
    // (no iframe, so frame-blocking sites still open). Falls back to
    // openUrl behavior when no Reader is wired host-side.
    openContent: (url) => sendHostRequest('openContent', { url }),
    getContext: () => sendHostRequest('getContext', {}),
    submit: (command) => sendHostRequest('submit', { command }),
    ui: {
      expand: () => sendHostRequest('ui.expand', {}),
      collapse: () => sendHostRequest('ui.collapse', {}),
    },
    // __signalReady is called by the srcdoc mount script after guest code
    // runs (see buildFeatureSrcdoc/buildReactSrcdoc). Resolves true on host
    // ack, false + runtime.error report when the bridge is not responding.
    __signalReady: signalReady,
    theme: {
      accent: '#C8FF57',
      bg: '#0A0A0C',
      surface: '#131318',
      text: '#F0F0F5',
      // Live theme name from the host (mount-time ack). Prefer dataset over
      // these static defaults: they only describe the void palette.
      get: () => sendHostRequest('theme.get', {}),
      apply: (name) => { applyTheme(name); return Promise.resolve(true); },
    }
  };
  window.polydocks = window.polydocks;
})();
`;
