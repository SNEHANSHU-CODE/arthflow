/**
 * Settings Context
 *
 * Unified provider for Theme and Currency settings.
 *
 * Key Features:
 * - Single source of truth for all user preferences
 * - localStorage persistence (survives page refresh)
 * - Syncs with Redux store
 * - Forces re-render on any preference change using context key
 * - Applies theme to DOM consistently
 * - Provides locale-aware formatters
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updatePreferences as updateReduxPreferences } from '../app/authSlice';
import { SettingsContext, CURRENCY_CONFIG } from './SettingsContextDefinition';

// Storage keys
const STORAGE_KEY = 'arthflow-preferences';

// Default preferences
const DEFAULT_PREFERENCES = {
  currency: 'INR',
  theme: 'light',
};

/**
 * Load preferences from localStorage
 */
const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load preferences from localStorage:', e);
  }
  return { ...DEFAULT_PREFERENCES };
};

/**
 * Save preferences to localStorage
 */
const saveToStorage = (prefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save preferences to localStorage:', e);
  }
};

/**
 * Apply theme to DOM
 */
const applyThemeToDOM = (theme) => {
  let activeTheme = theme;

  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = prefersDark ? 'dark' : 'light';
  }

  document.body.classList.remove('light', 'dark', 'light-theme', 'dark-theme');
  document.documentElement.classList.remove('light', 'dark', 'light-theme', 'dark-theme');

  document.body.classList.add(activeTheme, `${activeTheme}-theme`);
  document.documentElement.classList.add(activeTheme, `${activeTheme}-theme`);

  document.documentElement.setAttribute('data-theme', activeTheme);
  document.body.setAttribute('data-theme', activeTheme);

  return activeTheme;
};

/**
 * Settings Provider Component
 *
 * NOTE: useSettings hook lives in ./useSettings.js (separate file) to satisfy
 * Vite Fast Refresh — a file must export ONLY components OR ONLY non-components.
 */
const SettingsProvider = ({ children }) => {
  const dispatch = useDispatch();

  const reduxPreferences = useSelector((state) => state.auth?.preferences);
  const isAuthenticated = useSelector((state) => state.auth?.isAuthenticated);

  const [preferences, setPreferences] = useState(() => {
    const stored = loadFromStorage();
    return isAuthenticated && reduxPreferences
      ? { ...stored, ...reduxPreferences }
      : stored;
  });

  const [version, setVersion] = useState(0);
  const [resolvedTheme, setResolvedTheme] = useState('light');

  // Sync with Redux preferences when they change
  useEffect(() => {
    if (isAuthenticated && reduxPreferences) {
      setPreferences(prev => {
        const merged = { ...prev, ...reduxPreferences };
        saveToStorage(merged);
        return merged;
      });
      setVersion(v => v + 1);
    }
  }, [isAuthenticated, reduxPreferences]);

  // Apply theme whenever it changes
  useEffect(() => {
    const active = applyThemeToDOM(preferences.theme);
    setResolvedTheme(active);
  }, [preferences.theme, version]);

  useEffect(() => {
    if (preferences.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
        applyThemeToDOM('auto');
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [preferences.theme]);

  const updatePreference = useCallback((key, value) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      saveToStorage(updated);
      if (isAuthenticated) {
        dispatch(updateReduxPreferences({ [key]: value }));
      }
      return updated;
    });
    setVersion(v => v + 1);
  }, [dispatch, isAuthenticated]);

  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => {
      const updated = { ...prev, ...updates };
      saveToStorage(updated);
      if (isAuthenticated) {
        dispatch(updateReduxPreferences(updates));
      }
      return updated;
    });
    setVersion(v => v + 1);
  }, [dispatch, isAuthenticated]);

  const setTheme = useCallback((theme) => updatePreference('theme', theme), [updatePreference]);
  const setCurrency = useCallback((curr) => updatePreference('currency', curr), [updatePreference]);

  const formatCurrency = useCallback((amount, options = {}) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return (CURRENCY_CONFIG[preferences.currency]?.symbol ?? '₹') + '0';
    }
    const config = CURRENCY_CONFIG[preferences.currency] || CURRENCY_CONFIG.INR;
    const { showSymbol = true } = options;
    try {
      return new Intl.NumberFormat(config.locale, {
        style: showSymbol ? 'currency' : 'decimal',
        currency: config.code,
        minimumFractionDigits: options.decimals ?? config.decimals,
        maximumFractionDigits: options.decimals ?? 2,
      }).format(Number(amount));
    } catch {
      const num = Number(amount).toFixed(2);
      return showSymbol ? `${config.symbol}${num}` : num;
    }
  }, [preferences.currency]);

  const formatNumber = useCallback((amount, options = {}) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0';
    const config = CURRENCY_CONFIG[preferences.currency] || CURRENCY_CONFIG.INR;
    try {
      return new Intl.NumberFormat(config.locale, {
        minimumFractionDigits: options.decimals ?? 0,
        maximumFractionDigits: options.decimals ?? 2,
      }).format(Number(amount));
    } catch {
      return Number(amount).toFixed(2);
    }
  }, [preferences.currency]);

  const formatDate = useCallback((date, options = {}) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', ...options,
      }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  }, []);

  const formatTime = useCallback((date, options = {}) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', ...options,
      }).format(d);
    } catch {
      return d.toLocaleTimeString();
    }
  }, []);

  const formatDateTime = useCallback((date, options = {}) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', ...options,
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  }, []);

  const getCurrencySymbol = useCallback(() => {
    return CURRENCY_CONFIG[preferences.currency]?.symbol || '₹';
  }, [preferences.currency]);

  const contextValue = useMemo(() => ({
    preferences,
    theme: preferences.theme,
    resolvedTheme,
    currency: preferences.currency,
    version,
    setTheme,
    setCurrency,
    updatePreference,
    updatePreferences,
    formatCurrency,
    formatNumber,
    formatDate,
    formatTime,
    formatDateTime,
    getCurrencySymbol,
    isDark: resolvedTheme === 'dark',
    currencyConfig: CURRENCY_CONFIG[preferences.currency] || CURRENCY_CONFIG.INR,
  }), [
    preferences,
    resolvedTheme,
    version,
    setTheme,
    setCurrency,
    updatePreference,
    updatePreferences,
    formatCurrency,
    formatNumber,
    formatDate,
    formatTime,
    formatDateTime,
    getCurrencySymbol,
  ]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsProvider;