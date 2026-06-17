import { createContext } from 'react';

// Currency configuration — exported from context definition
export const CURRENCY_CONFIG = {
  INR: { symbol: '₹', locale: 'en-IN', code: 'INR', decimals: 0 },
  USD: { symbol: '$', locale: 'en-US', code: 'USD', decimals: 2 },
  EUR: { symbol: '€', locale: 'de-DE', code: 'EUR', decimals: 2 },
  GBP: { symbol: '£', locale: 'en-GB', code: 'GBP', decimals: 2 },
  CAD: { symbol: 'C$', locale: 'en-CA', code: 'CAD', decimals: 2 },
  AUD: { symbol: 'A$', locale: 'en-AU', code: 'AUD', decimals: 2 },
};

// Context — exported from context definition
export const SettingsContext = createContext(null);
