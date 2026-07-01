import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const THEME_MODE_KEY = 'theme-mode';
const LEGACY_THEME_KEY = 'theme';
const THEME_CHANGED_EVENT = 'sx-theme-mode-changed';

const ThemeContext = createContext('auto');
const ActualThemeContext = createContext('light');
const SetThemeContext = createContext(() => {});

export const useTheme = () => useContext(ThemeContext);
export const useActualTheme = () => useContext(ActualThemeContext);
export const useSetTheme = () => useContext(SetThemeContext);

function canUseDOM() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getSystemTheme() {
  if (canUseDOM() && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
}

function readStoredThemeMode() {
  if (!canUseDOM()) return 'auto';

  try {
    const storedMode = localStorage.getItem(THEME_MODE_KEY);
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'auto') {
      return storedMode;
    }

    const legacyMode = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacyMode === 'light' || legacyMode === 'dark') {
      return legacyMode;
    }
  } catch {
    // Ignore storage access errors and fall back to auto mode.
  }

  return 'auto';
}

function syncThemeDom(themeMode, actualTheme) {
  if (!canUseDOM()) return;

  const isDark = actualTheme === 'dark';
  document.body.setAttribute('theme-mode', isDark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', isDark);

  try {
    localStorage.setItem(THEME_MODE_KEY, themeMode);
    localStorage.setItem(LEGACY_THEME_KEY, actualTheme);
  } catch {
    // Keep the UI usable even if storage is unavailable.
  }

  window.dispatchEvent(
    new CustomEvent(THEME_CHANGED_EVENT, {
      detail: {
        theme: themeMode,
        actualTheme,
        isDark,
      },
    }),
  );
}

export function applyThemePreference(isDark) {
  const nextTheme = isDark ? 'dark' : 'light';
  syncThemeDom(nextTheme, nextTheme);
}

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => readStoredThemeMode());
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());

  const actualTheme = useMemo(
    () => (theme === 'auto' ? systemTheme : theme),
    [systemTheme, theme],
  );

  useEffect(() => {
    if (!canUseDOM() || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    syncThemeDom(theme, actualTheme);
  }, [actualTheme, theme]);

  useEffect(() => {
    if (!canUseDOM()) return undefined;

    const handleStorage = () => {
      setThemeState((prevTheme) => {
        const nextTheme = readStoredThemeMode();
        return prevTheme === nextTheme ? prevTheme : nextTheme;
      });
      setSystemTheme(getSystemTheme());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(THEME_CHANGED_EVENT, handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(THEME_CHANGED_EVENT, handleStorage);
    };
  }, []);

  const setTheme = useCallback((nextTheme) => {
    if (typeof nextTheme === 'function') {
      setThemeState((previousTheme) => {
        const resolved = nextTheme(previousTheme);
        if (resolved === true) return 'dark';
        if (resolved === false) return 'light';
        if (resolved === 'light' || resolved === 'dark' || resolved === 'auto') {
          return resolved;
        }
        return previousTheme;
      });
      return;
    }

    if (typeof nextTheme === 'boolean') {
      setThemeState(nextTheme ? 'dark' : 'light');
      return;
    }

    if (nextTheme === 'light' || nextTheme === 'dark' || nextTheme === 'auto') {
      setThemeState(nextTheme);
    }
  }, []);

  return (
    <SetThemeContext.Provider value={setTheme}>
      <ActualThemeContext.Provider value={actualTheme}>
        <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
      </ActualThemeContext.Provider>
    </SetThemeContext.Provider>
  );
};

export function useThemePreference() {
  const actualTheme = useActualTheme();
  const setTheme = useSetTheme();
  const isDark = actualTheme === 'dark';

  const setIsDark = useCallback(
    (nextValue) => {
      if (typeof nextValue === 'function') {
        setTheme((previousTheme) => {
          const previousIsDark =
            (previousTheme === 'auto' ? getSystemTheme() : previousTheme) === 'dark';
          return nextValue(previousIsDark) ? 'dark' : 'light';
        });
        return;
      }
      setTheme(nextValue ? 'dark' : 'light');
    },
    [setTheme],
  );

  return [isDark, setIsDark];
}
