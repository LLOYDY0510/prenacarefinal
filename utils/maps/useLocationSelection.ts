'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { reverseGeocode, parseLocationFromGeocode } from './reverseGeocode';

export type LocationData = {
  lat: number; lng: number; address?: string; barangay?: string; purok?: string;
  confidence?: 'high' | 'medium' | 'low';
};

export function useLocationSelection(initial: [number, number] | null, onDetected?: (data: LocationData) => void) {
  const [position, setPosition] = useState(initial);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const callback = useRef(onDetected);
  useEffect(() => { callback.current = onDetected; }, [onDetected]);
  useEffect(() => () => { revision.current++; if (timer.current) clearTimeout(timer.current); }, []);

  const performGeocoding = useCallback((lat: number, lng: number) => {
    const current = ++revision.current;
    setLocationData(null);setIsGeocoding(true);setGeocodeError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setIsGeocoding(true); setGeocodeError(null);
      const result = await reverseGeocode(lat, lng);
      if (current !== revision.current) return;
      if (!result) { setGeocodeError('Could not retrieve location details.'); setIsGeocoding(false); return; }
      const parsed = parseLocationFromGeocode(result);
      const data = { lat, lng, address: parsed.fullAddress, barangay: parsed.barangay,
        purok: parsed.purok, confidence: parsed.confidence };
      setLocationData(data); setIsGeocoding(false); callback.current?.(data);
    }, 1000);
  }, []);
  return { position, setPosition, locationData, setLocationData, isGeocoding, geocodeError, performGeocoding };
}

export function openLocation(data: LocationData | null, streetView = false) {
  if (!data) return;
  const url = streetView
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${data.lat},${data.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
