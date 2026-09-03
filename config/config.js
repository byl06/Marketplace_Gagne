// ============================================================
//  CONFIGURATION GAGNE
// ============================================================

const CONFIG = {
  CURRENCY: {
    CODE: 'XOF',
    SYMBOL: 'FCFA',
    RATE: 655.96,
    LOCALE: 'fr-BJ',
    DECIMALS: 0
  },
  PAYDUNYA: {
    MASTER_KEY: 'VOTRE_MASTER_KEY',
    PUBLIC_KEY: 'VOTRE_PUBLIC_KEY',
    PRIVATE_KEY: 'VOTRE_PRIVATE_KEY',
    TOKEN: 'VOTRE_TOKEN',
    MODE: 'sandbox',
    RETURN_URL: window.location.origin + window.location.pathname + '?payment=success',
    CANCEL_URL: window.location.origin + window.location.pathname + '?payment=cancel',
  },
  ADMIN: {
    EMAIL: 'admin@gagne.com',
    PASSWORD: 'admin123'
  }
};

// ============================================================
//  FONCTIONS DE DEVISE (utilisées par tous les fichiers)
// ============================================================
const CURRENCY_RATE = 655.96;

function convertToFCFA(euro) {
  return Math.round(euro * CURRENCY_RATE);
}

function fmtPrice(priceInEuro) {
  const amount = convertToFCFA(priceInEuro);
  return amount.toLocaleString('fr-BJ') + ' FCFA';
}

function fmtPriceForPayDunya(priceInEuro) {
  return convertToFCFA(priceInEuro);
}

// ============================================================
//  PAYMENT METHODS (Bénin)
// ============================================================
const PAYMENT_METHODS = [
  { id: 'mtn', name: 'MTN Mobile Money', code: 'MTN_MONEY' },
  { id: 'moov', name: 'Moov Money', code: 'MOOV_MONEY' },
  { id: 'orange', name: 'Orange Money', code: 'ORANGE_MONEY' },
  { id: 'wave', name: 'Wave', code: 'WAVE' }
];

// ============================================================
//  COLORS
// ============================================================
const COLOR_KEYS = ['accent', 'gold', 'ink', 'forest', 'plum'];
const COLOR_LABELS = {
  accent: '#2440FF',
  gold: '#AD7E22',
  ink: '#15161F',
  forest: '#1F6E5C',
  plum: '#5B2A6F'
};
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=600&h=400&fit=crop';