// Countries and cities, shared by the server and the browser.
// The first country is the default.

export const COUNTRIES = {
  SA: { name: 'Saudi Arabia', currency: 'SAR', locale: 'en-SA', postal: null },
  US: { name: 'United States', currency: 'USD', locale: 'en-US', postal: 'ZIP code' },
  CA: { name: 'Canada', currency: 'CAD', locale: 'en-CA', postal: 'Postal code' },
  GB: { name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', postal: 'Postcode' },
  AU: { name: 'Australia', currency: 'AUD', locale: 'en-AU', postal: 'Postcode' },
  DE: { name: 'Germany', currency: 'EUR', locale: 'de-DE', postal: 'Postleitzahl' },
  FR: { name: 'France', currency: 'EUR', locale: 'fr-FR', postal: 'Code postal' },
  IT: { name: 'Italy', currency: 'EUR', locale: 'it-IT', postal: 'CAP' },
  ES: { name: 'Spain', currency: 'EUR', locale: 'es-ES', postal: 'Código postal' },
};

export const DEFAULT_COUNTRY = Object.keys(COUNTRIES)[0];

// Countries where you pick a city instead of typing a postal code. `haraj` is the
// city's name as Haraj writes it; Haraj groups Dammam, Khobar and Dhahran as the
// Eastern Province.
export const CITIES = {
  SA: [
    { id: 'riyadh', name: 'Riyadh', haraj: 'الرياض' },
    { id: 'jeddah', name: 'Jeddah', haraj: 'جده' },
    { id: 'makkah', name: 'Makkah', haraj: 'مكه' },
    { id: 'madinah', name: 'Madinah', haraj: 'المدينة' },
    { id: 'eastern', name: 'Dammam / Khobar (Eastern Province)', haraj: 'الشرقيه' },
    { id: 'taif', name: 'Taif', haraj: 'الطايف' },
    { id: 'qassim', name: 'Buraidah (Qassim)', haraj: 'القصيم' },
    { id: 'abha', name: 'Abha', haraj: 'أبها' },
    { id: 'tabuk', name: 'Tabuk', haraj: 'تبوك' },
    { id: 'hail', name: 'Hail', haraj: 'حائل' },
    { id: 'jazan', name: 'Jazan', haraj: 'جيزان' },
    { id: 'najran', name: 'Najran', haraj: 'نجران' },
    { id: 'jouf', name: 'Al Jouf', haraj: 'الجوف' },
    { id: 'hafr', name: 'Hafar Al-Batin', haraj: 'حفر الباطن' },
    { id: 'arar', name: 'Arar', haraj: 'عرعر' },
    { id: 'yanbu', name: 'Yanbu', haraj: 'ينبع' },
  ],
};

export function findCity(country, id) {
  return CITIES[country]?.find((city) => city.id === id) ?? null;
}

/** Where results ship to, for display: "10001, United States" or "Riyadh, Saudi Arabia". */
export function describeLocation({ country, zip, city }) {
  const countryName = COUNTRIES[country]?.name ?? country;
  const place = findCity(country, city)?.name ?? zip;
  return place ? `${place}, ${countryName}` : countryName;
}
