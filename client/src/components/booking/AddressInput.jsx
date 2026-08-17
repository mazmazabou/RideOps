import { useEffect, useRef } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { loadGoogleMaps } from '../../utils/mapsLoader';

/**
 * Free-text address input backed by Google Places Autocomplete, biased to the
 * campus area. Selecting a suggestion stores a STANDARDIZED string
 * ("Backyard Ale House, 523 Linden St, Scranton, PA") so analytics hotspots
 * stay clean. Degrades to a plain text input if the SDK fails to load.
 */
export default function AddressInput({ id, value, onChange, placeholder, hasError }) {
  const { tenantConfig } = useTenant();
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!tenantConfig?.mapsApiKey || autocompleteRef.current) return;
    let cancelled = false;
    loadGoogleMaps(tenantConfig.mapsApiKey).then(google => {
      if (cancelled || !inputRef.current || autocompleteRef.current) return;
      const options = {
        componentRestrictions: { country: 'us' },
        fields: ['name', 'formatted_address'],
      };
      const c = tenantConfig.placesCenter;
      if (c) {
        options.bounds = new google.maps.Circle({
          center: c,
          radius: tenantConfig.placesRadiusMeters || 8000,
        }).getBounds();
      }
      const ac = new google.maps.places.Autocomplete(inputRef.current, options);
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place) return;
        const address = place.formatted_address || '';
        const name = place.name || '';
        // Prefix the place name when it isn't already the address's street line
        const standardized = name && !address.startsWith(name) ? `${name}, ${address}` : (address || name);
        if (standardized) onChangeRef.current(standardized);
      });
      autocompleteRef.current = ac;
    }).catch(() => { /* plain text input still works — server accepts free text */ });
    return () => { cancelled = true; };
  }, [tenantConfig]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      className="ro-input"
      placeholder={placeholder || 'Start typing an address…'}
      style={hasError ? { borderColor: 'var(--status-no-show)' } : undefined}
      value={value}
      onChange={e => onChange(e.target.value)}
      autoComplete="off"
    />
  );
}
