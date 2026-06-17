 import { useContext } from 'react';
import { SettingsContext } from '../context/SettingsContextDefinition';

/**
 * Hook to consume the SettingsContext.
 *
 * Kept in a separate file from SettingsContext.jsx so that Vite Fast Refresh
 * is satisfied — each file must export ONLY components or ONLY non-components,
 * never both.
 *
 * Usage:
 *   import { useSettings } from '../context/useSettings';
 */
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default useSettings;