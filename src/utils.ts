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
  
  let origin = "";
  
  // 1. Try injected APP_URL first (set in vite.config.ts)
  try {
    // We use a direct reference so Vite's define plugin can replace it statically
    const envUrl = process.env.APP_URL || "";
    if (envUrl) {
      origin = parseOriginFromUrl(envUrl);
    }
  } catch (e) {
    // Ignored (process might be not defined if Vite didn't replace it)
  }
  
  // 2. Try import.meta.url (the most reliable source of actual host domain in sandboxed iframes)
  if (!origin) {
    try {
      if (import.meta && import.meta.url) {
        origin = parseOriginFromUrl(import.meta.url);
      }
    } catch (e) {
      // Ignored
    }
  }
  
  // 3. Fallback to window.location.origin
  if (!origin) {
    try {
      if (window.location.origin && window.location.origin !== "null") {
        origin = window.location.origin;
      }
    } catch (e) {
      // Ignored
    }
  }
  
  // 4. Fallback to document.referrer (helps in nested preview situations)
  if (!origin) {
    try {
      if (document.referrer) {
        origin = parseOriginFromUrl(document.referrer);
      }
    } catch (e) {
      // Ignored
    }
  }
  
  // 5. Fallback to window.location.href / document.URL
  if (!origin) {
    try {
      const href = window.location.href || document.URL;
      if (href) {
        origin = parseOriginFromUrl(href);
      }
    } catch (e) {
      // Ignored
    }
  }

  // 6. Manual construction from window.location.host as a bulletproof sandbox fallback
  if (!origin) {
    try {
      if (window.location && window.location.host) {
        const proto = window.location.protocol && window.location.protocol.startsWith("http") ? window.location.protocol : "https:";
        origin = `${proto}//${window.location.host}`;
      }
    } catch (e) {
      // Ignored
    }
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
          // Clean up listeners once unlocked
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
    // Respect the user's active attention: Do not play sounds if the tab is hidden or backgrounded
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    const ctx = getSharedContext();
    if (!ctx) return;
    
    // Attempt to resume context if it remains suspended
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // A clean, bright, sweet frequency sweep for a modern retro chime
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12); // A5
    
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(293.66, ctx.currentTime); // D4
    osc2.frequency.exponentialRampToValueAtTime(440.00, ctx.currentTime + 0.12); // A4
    
    // Soft, pleasant volume envelope
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

