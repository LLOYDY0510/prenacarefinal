/**
 * Reverse geocoding utilities using OpenStreetMap Nominatim API
 * Free to use, no API key required
 * Rate limit: 1 request per second (per Nominatim policy)
 */

export interface ReverseGeocodeResult {
  display_name: string;
  address: {
    barangay?: string;
    suburb?: string;
    village?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    county?: string;
    state?: string;
    country?: string;
    [key: string]: string | undefined;
  };
  lat: string;
  lon: string;
}

export interface ParsedLocation {
  fullAddress: string;
  barangay?: string;
  purok?: string;
  zone?: string;
  city?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Reverse geocode coordinates to get address information
 * @param lat Latitude
 * @param lon Longitude
 * @returns Promise with reverse geocoded data
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<ReverseGeocodeResult | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        signal: AbortSignal.timeout(10_000),
        headers: {
          'User-Agent': 'Prenatrack Health System (prenatrack@health.gov.ph)', // Required by Nominatim policy
        },
      }
    );

    if (!response.ok) {
      console.error('Reverse geocoding failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error during reverse geocoding:', error);
    return null;
  }
}

/**
 * Parse reverse geocoding result to extract barangay and purok/zone information
 * @param result Reverse geocoding result from Nominatim
 * @returns Parsed location with barangay, purok, and confidence level
 */
export function parseLocationFromGeocode(
  result: ReverseGeocodeResult
): ParsedLocation {
  const { address, display_name } = result;

  // Try to extract barangay from various address fields
  const barangay =
    address.barangay ||
    address.suburb ||
    address.village ||
    address.neighbourhood;

  // Try to extract purok/zone from address or display name
  // Philippine addresses often use "Purok", "Zone", or numeric zone indicators
  const purokMatch = display_name.match(/(?:purok|zone)\s*(\d+)/i);
  const zoneMatch = display_name.match(/zone\s*(\d+)/i);
  const purok = purokMatch?.[1] || zoneMatch?.[1];

  // Determine confidence based on available data
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (barangay && purok) {
    confidence = 'high';
  } else if (barangay || purok) {
    confidence = 'medium';
  }

  return {
    fullAddress: display_name,
    barangay: barangay?.replace(/barangay\s*/i, '').trim(),
    purok,
    zone: purok,
    city: address.city || address.town || address.county,
    confidence,
  };
}

/**
 * Debounce function to limit API calls
 */
export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
