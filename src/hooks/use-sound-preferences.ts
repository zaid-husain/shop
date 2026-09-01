import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "bharatautoparts_sound_prefs";

export interface SoundPreferences {
  soundEnabled: boolean;
  volume: number;
}

const DEFAULT_PREFS: SoundPreferences = {
  soundEnabled: true,
  volume: 50,
};

export function useSoundPreferences() {
  const [preferences, setPreferences] = useState<SoundPreferences>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as SoundPreferences;
      }
    } catch (e) {
      console.warn("Failed to read sound preferences from localStorage", e);
    }
    return DEFAULT_PREFS;
  });

  const updatePreferences = useCallback((newPrefs: Partial<SoundPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...newPrefs };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        // Dispatch custom event to notify SoundManager of the change
        window.dispatchEvent(new CustomEvent("sound-preferences-changed", { detail: updated }));
      } catch (e) {
        console.warn("Failed to save sound preferences to localStorage", e);
      }
      return updated;
    });
  }, []);

  return { preferences, updatePreferences };
}

// Helper to read synchronously outside of React (used by SoundManager)
export function getSoundPreferencesSync(): SoundPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SoundPreferences;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_PREFS;
}
