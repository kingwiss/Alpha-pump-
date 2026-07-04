function parseOriginFromUrl(urlString: string): string {
  if (!urlString || urlString.startsWith("about:") || urlString.startsWith("data:")) return "";
  try {
    const match = urlString.match(/^(https?:\/\/([^/?#]+))/i);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {
    // Ignored
  }
  return "";
}

export function getAbsoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // NOTE: We don't return the relative path natively because Safari throws "The string did not match the expected pattern."
  // when `fetch()` is called with a relative path in certain iframe environments where the base URL is invalid (e.g. data URI or about:blank).
  // We MUST explicitly resolve the absolute URL.

  let origin = "";
  
  // 1. First, ALWAYS prefer the actual browser environment location to avoid CORS on Vercel aliases
  if (!origin) {
    try {
      if (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("about:") && !window.location.origin.startsWith("data:")) {
        origin = window.location.origin;
      }
    } catch (e) {}
  }
  
  // 2. Try injected APP_URL (set in vite.config.ts) if window location is unavailable or sandbox blocked
  if (!origin) {
    try {
      const envUrl = process.env.APP_URL || "";
      if (envUrl) {
        origin = parseOriginFromUrl(envUrl);
      }
    } catch (e) {}
  }
  
  // 2.5 Try import.meta.url
  if (!origin) {
    try {
      if (import.meta && import.meta.url) {
        origin = parseOriginFromUrl(import.meta.url);
      }
    } catch (e) {}
  }
  
  // 4. Fallback to document.referrer (helps in nested preview situations)
  if (!origin) {
    try {
      if (typeof document !== "undefined" && document.referrer) {
        origin = parseOriginFromUrl(document.referrer);
      }
    } catch (e) {}
  }

  // 5. Fallback to window.location.href / document.URL
  if (!origin) {
    try {
      if (typeof window !== "undefined" && window.location && window.location.href) {
        origin = parseOriginFromUrl(window.location.href);
      } else if (typeof document !== "undefined" && document.URL) {
        origin = parseOriginFromUrl(document.URL);
      }
    } catch (e) {}
  }

  // 6. Manual construction from window.location.host as a bulletproof sandbox fallback
  if (!origin) {
    try {
      if (typeof window !== "undefined" && window.location && window.location.host) {
        const proto = window.location.protocol && window.location.protocol.startsWith("http") ? window.location.protocol : "https:";
        origin = `${proto}//${window.location.host}`;
      }
    } catch (e) {}
  }

  // Final fallback if absolutely nothing else worked (safeguard)
  if (!origin && typeof window !== "undefined") {
    // If we couldn't resolve any absolute URL, we will return the relative path as a very last resort,
    // though this might fail on Safari if the document base is invalid.
    return path;
  }
  
  const cleanOrigin = origin ? origin.replace(/\/$/, "") : "";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  return cleanOrigin ? `${cleanOrigin}${cleanPath}` : cleanPath;
}

let sharedCtx: AudioContext | null = null;
function getSharedContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedCtx) {
    sharedCtx = new AudioContextClass();
  }
  return sharedCtx;
}

// Automatically unlock and resume AudioContext on first user interaction
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = getSharedContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          window.removeEventListener("click", unlock);
          window.removeEventListener("touchstart", unlock);
          window.removeEventListener("keydown", unlock);
        }).catch(err => {
          console.warn("Error resuming AudioContext on user interaction:", err);
        });
      } else {
        window.removeEventListener("click", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("keydown", unlock);
      }
    }
  };
  window.addEventListener("click", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

export function playCuteUpdateSound() {
  try {
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }
    const ctx = getSharedContext();
    if (!ctx) return;
    
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12);
    
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(293.66, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(440.00, ctx.currentTime + 0.12);
    
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.2);
  } catch (err) {
    console.warn("Web Audio sound playback failed:", err);
  }
}
