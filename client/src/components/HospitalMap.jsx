import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { MapPin } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useLanguage from '../i18n/useLanguage';

/*
 * Leaflet and react-leaflet are the heaviest dependencies in CareBridge and only the
 * hospital directory needs them, so App.jsx loads this module on demand through
 * React.lazy/Suspense. That keeps the map out of the initial bundle.
 *
 * Each hospital arrives as a ready-to-plot point: the coordinate helper stays in
 * App.jsx, which keeps this module free of UI imports from App.jsx.
 */

let nextMapId = 0;

function MapBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 12);
    } else if (points.length > 1) {
      map.fitBounds(points.map((point) => [point.latitude, point.longitude]), { padding: [24, 24], maxZoom: 12 });
    }
  }, [points, map]);
  return null;
}
MapBounds.propTypes = { points: PropTypes.arrayOf(PropTypes.object).isRequired };

function LocationListener({ mapId }) {
  const map = useMap();
  useEffect(() => {
    const move = (event) => map.flyTo(event.detail, Math.max(map.getZoom(), 10));
    const eventName = `carebridge-map-location-${mapId}`;
    window.addEventListener(eventName, move);
    return () => window.removeEventListener(eventName, move);
  }, [map, mapId]);
  return null;
}
LocationListener.propTypes = { mapId: PropTypes.number.isRequired };

function HospitalMap({ points }) {
  const { t } = useLanguage();
  const [mapId] = useState(() => { nextMapId += 1; return nextMapId; });
  const [locationError, setLocationError] = useState('');
  const locate = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError(t('hospitals.locationUnavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => window.dispatchEvent(new CustomEvent(`carebridge-map-location-${mapId}`, { detail: [coords.latitude, coords.longitude] })),
      () => setLocationError(t('hospitals.locationDenied')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <section className="panel map-panel" aria-labelledby="map-heading">
      <div className="section-head">
        <div>
          <h2 id="map-heading">{t('hospitals.mapTitle')}</h2>
          <p>{t('hospitals.mapDescription')}</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={locate}><MapPin size={15} aria-hidden="true" /> {t('hospitals.useMyLocation')}</button>
      </div>
      {locationError && <p className="muted" role="status">{locationError}</p>}
      <div className="map-frame">
        <MapContainer className="hospital-map" center={[11.0168, 76.9558]} zoom={8} scrollWheelZoom={false}>
          <TileLayer
            url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          />
          <MapBounds points={points} />
          {points.map((point) => (
            <Marker key={point.id} position={[point.latitude, point.longitude]}>
              <Popup>
                <strong>{point.name}</strong><br />{point.address}
                {point.district ? <><br />{point.district}</> : null}
              </Popup>
            </Marker>
          ))}
          <LocationListener mapId={mapId} />
        </MapContainer>
      </div>
      <p className="map-attribution">{t('hospitals.mapAttribution')} <a href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener noreferrer">{t('hospitals.tilePolicy')}</a>.</p>
    </section>
  );
}
HospitalMap.propTypes = {
  points: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    address: PropTypes.string,
    district: PropTypes.string,
    longitude: PropTypes.number.isRequired,
    latitude: PropTypes.number.isRequired,
  })).isRequired,
};

export default HospitalMap;
