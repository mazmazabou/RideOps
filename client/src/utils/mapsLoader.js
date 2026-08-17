// Lazy loader for the Google Maps JS SDK (Places library).
// Loaded once, on demand, only when a campus has addressAutocomplete enabled
// and a browser key is configured — the app never touches Google otherwise.

let loadPromise = null;

export function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.reject(new Error('No Maps API key'));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => {
      // With loading=async the library may finish init just after onload
      const check = () => {
        if (window.google?.maps?.places) resolve(window.google);
        else setTimeout(check, 50);
      };
      check();
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
