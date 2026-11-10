'use client';

import ZoneAreaLayer from './ZoneAreaLayer';
import {ZoneLocationLabel} from './ZoneLegend';
import { useLocationSelection, openLocation } from '@/utils/maps/useLocationSelection';

import Modal from '@/components/ui/Modal';
import { useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { X, MapPin, Loader2, AlertCircle, Map as MapIcon, Navigation } from 'lucide-react';
import type { LocationData } from './LocationPicker';

// Fix default marker icon paths (Leaflet + Next.js quirk)
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Sankanan, Manolo Fortich, Bukidnon
const DEFAULT_CENTER: [number, number] = [8.315242, 124.860898];

interface FullscreenMapModalProps {
  isOpen: boolean;
  zone?: string | null;
  onClose: () => void;
  initialPosition: [number, number] | null;
  onLocationSelected: (data: LocationData) => void;
}

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function FullscreenMapModal({
  isOpen,
  zone,
  onClose,
  initialPosition,
  onLocationSelected,
}: FullscreenMapModalProps) {
  const { position, setPosition, locationData, isGeocoding, geocodeError, performGeocoding } = useLocationSelection(initialPosition);
  const markerRef = useRef<L.Marker>(null);
  const mapRef = useRef<L.Map>(null);

  // Reset position when modal opens
  if (isOpen && !position && initialPosition) {
    setPosition(initialPosition);
  }

  // Debounced geocoding function
  function selectPosition(lat: number, lng: number) {
    setPosition([lat, lng]);

    performGeocoding(lat, lng);
  }

  function handlePick(lat: number, lng: number) { selectPosition(lat, lng); }

  function handleDragEnd(lat: number, lng: number) { selectPosition(lat, lng); }

  function handleApplyLocation() {
    if (position) {
      onLocationSelected(locationData??{lat:position[0],lng:position[1]});
      onClose();
    }
  }

  function handleOpenGoogleMaps() { openLocation(locationData); }

  function handleOpenStreetView() { openLocation(locationData, true); }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Location" maxWidth="xl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 bg-white">
          <div className="flex items-center gap-3">
            <MapPin size={20} className="text-[var(--brand)]" />
            <div>
              <h2 className="text-base font-bold text-neutral-900">Select Location</h2>
              <p className="text-xs text-neutral-500">Click on the map or drag the pin to set the location</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-neutral-600" />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <MapContainer
            center={position ?? DEFAULT_CENTER}
            zoom={17}
            style={{ height: '100%', width: '100%' }}
            ref={(map) => {
              if (map) {
                mapRef.current = map;
                // Auto-pan to position when set
                if (position) {
                  map.setView(position, 17, { animate: true });
                }
              }
            }}
          >
            <TileLayer className="satellite-tiles" maxNativeZoom={19} maxZoom={20}
              attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <MapClickHandler onPick={handlePick} />
            {position&&<ZoneAreaLayer records={[{id:"draft",purok:zone??null,latitude:position[0],longitude:position[1]}]}/>}
            {position && (
              <Marker
                ref={markerRef}
                position={position}
                icon={defaultIcon}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const newPos = e.target.getLatLng();
                    handleDragEnd(newPos.lat, newPos.lng);
                  },
                }}
              />
            )}
          </MapContainer>

          {/* Location Info Panel - Floating on Map */}
          <div className="absolute bottom-4 left-4 right-4 z-[1000] max-w-md max-h-[45%] overflow-y-auto">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-neutral-200 p-4 space-y-3">
              {position&&<ZoneLocationLabel zone={zone}/>}
              {/* Loading state */}
              {isGeocoding && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={14} className="animate-spin text-[var(--brand)]" />
                  <span className="text-xs font-semibold text-neutral-600">Detecting location...</span>
                </div>
              )}

              {/* Error state */}
              {geocodeError && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <AlertCircle size={12} className="text-green-600 shrink-0" />
                  <span className="error-message text-[11px] font-semibold text-green-800">{geocodeError}</span>
                </div>
              )}

              {/* Location data */}
              {locationData && !isGeocoding && (
                <div className="space-y-2">
                  {/* Coordinates */}
                  <div className="bg-neutral-50 rounded-lg p-2">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Coordinates</p>
                    <p className="text-xs font-mono text-neutral-700">
                      {locationData.lat.toFixed(6)}, {locationData.lng.toFixed(6)}
                    </p>
                  </div>

                  {/* Address */}
                  {locationData.address && (
                    <div>
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Address</p>
                      <p className="text-xs text-neutral-700 line-clamp-2">{locationData.address}</p>
                    </div>
                  )}

                  {/* Barangay and Zone */}
                  {(locationData.barangay || locationData.purok) && (
                    <div className="flex flex-wrap gap-1.5">
                      {locationData.barangay && (
                        <span className="px-2 py-1 bg-green-50 rounded-lg text-[11px] font-semibold text-green-800 border border-green-200">
                          Barangay: {locationData.barangay}
                        </span>
                      )}
                      {locationData.purok && (
                        <span className="px-2 py-1 bg-green-50 rounded-lg text-[11px] font-semibold text-green-800 border border-green-200">
                          Zone {locationData.purok}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {position && !isGeocoding && (
                <div className="space-y-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={handleApplyLocation}
                    className="w-full px-3 py-2 bg-[var(--brand)] hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <MapPin size={14} />
                    Apply Location to Form
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleOpenGoogleMaps}
                      className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <MapIcon size={14} />
                      Google Maps
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenStreetView}
                      className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Navigation size={14} />
                      Street View
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
