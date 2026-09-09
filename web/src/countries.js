// Country list for player profiles (flag + name shown on leaderboards, and the "1st in {country}"
// scope). Flags are EMOJI here — they render natively on iOS/Android/macOS (the phone-first
// audience) and degrade to the 2-letter code on Windows; a later pass can inline round-flag SVGs
// for full parity. Codes are ISO-3166 alpha-2. Ordered roughly by likelihood for this game's crowd
// (European basketball first), then broader basketball nations — a dropdown can still sort/filter.

export const COUNTRIES = [
  // --- European basketball nations ---
  { code: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "RS", name: "Serbia", flag: "🇷🇸" },
  { code: "LT", name: "Lithuania", flag: "🇱🇹" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮" },
  { code: "HR", name: "Croatia", flag: "🇭🇷" },
  { code: "ME", name: "Montenegro", flag: "🇲🇪" },
  { code: "BA", name: "Bosnia & Herzegovina", flag: "🇧🇦" },
  { code: "IL", name: "Israel", flag: "🇮🇱" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "LV", name: "Latvia", flag: "🇱🇻" },
  { code: "EE", name: "Estonia", flag: "🇪🇪" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "CZ", name: "Czechia", flag: "🇨🇿" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "GE", name: "Georgia", flag: "🇬🇪" },
  { code: "MK", name: "North Macedonia", flag: "🇲🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬" },
  { code: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "HU", name: "Hungary", flag: "🇭🇺" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰" },
  { code: "IS", name: "Iceland", flag: "🇮🇸" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "AL", name: "Albania", flag: "🇦🇱" },
  { code: "CY", name: "Cyprus", flag: "🇨🇾" },
  { code: "MT", name: "Malta", flag: "🇲🇹" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺" },
  // --- Mediterranean / MENA ---
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "SY", name: "Syria", flag: "🇸🇾" },
  { code: "LY", name: "Libya", flag: "🇱🇾" },
  // --- Big / obvious ---
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  // --- Other basketball nations ---
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "AO", name: "Angola", flag: "🇦🇴" },
  { code: "SN", name: "Senegal", flag: "🇸🇳" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲" },
  { code: "ML", name: "Mali", flag: "🇲🇱" },
  { code: "SS", name: "South Sudan", flag: "🇸🇸" },
  { code: "CD", name: "DR Congo", flag: "🇨🇩" },
  { code: "DO", name: "Dominican Republic", flag: "🇩🇴" },
  { code: "PR", name: "Puerto Rico", flag: "🇵🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "CU", name: "Cuba", flag: "🇨🇺" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "IR", name: "Iran", flag: "🇮🇷" },
  { code: "TW", name: "Chinese Taipei", flag: "🇹🇼" },
];

const BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

/** Look up a country by code; returns { code, name, flag } or null. */
export const countryByCode = (code) => (code && BY_CODE[code]) || null;

/** Flag emoji for a code, or "" if unknown/unset. */
export const countryFlag = (code) => (countryByCode(code) ? BY_CODE[code].flag : "");
