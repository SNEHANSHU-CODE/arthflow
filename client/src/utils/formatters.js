/**
 * Currency formatting utility
 */
export const currencySymbols = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$'
};

export const currencyNames = {
  INR: 'Indian Rupee',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar'
};

export const currencyLocales = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  CAD: 'en-CA',
  AUD: 'en-AU'
};

/**
 * Format amount as currency
 * @param {number} amount - The amount to format
 * @param {string} currency - Currency code (INR, USD, etc.)
 * @param {boolean} showSymbol - Show currency symbol (default: true)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = 'INR', showSymbol = true) => {
  if (amount === null || amount === undefined) {
    const symbol = currencySymbols[currency] || '₹';
    return showSymbol ? `${symbol}0` : '0';
  }
  
  const locale = currencyLocales[currency] || 'en-IN';
  const symbol = currencySymbols[currency] || '₹';
  
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    
    return formatter.format(Number(amount));
  } catch (error) {
    // Fallback if Intl not supported
    const num = Number(amount).toFixed(2);
    return showSymbol ? `${symbol}${num}` : num;
  }
};

/**
 * Format amount without currency symbol
 * @param {number} amount - The amount to format
 * @param {string} currency - Currency code (INR, USD, etc.)
 * @returns {string} Formatted number string
 */
export const formatNumber = (amount, currency = 'INR') => {
  if (amount === null || amount === undefined) return '0';
  
  const locale = currencyLocales[currency] || 'en-IN';
  
  try {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    
    return formatter.format(Number(amount));
  } catch (error) {
    return Number(amount).toFixed(2);
  }
};

/**
 * Format date
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch (error) {
    return d.toLocaleDateString();
  }
};

/**
 * Format time
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted time string
 */
export const formatTime = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(d);
  } catch (error) {
    return d.toLocaleTimeString();
  }
};

/**
 * Format a number as a percentage
 * @param {number} value - The decimal or whole number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercent = (value, decimals = 1) => {
  if (value === null || value === undefined) return '0%';
  
  try {
    return Number(value).toFixed(decimals) + '%';
  } catch (error) {
    return value + '%';
  }
};