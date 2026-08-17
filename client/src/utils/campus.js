const VALID_SLUGS = ['usc', 'stanford', 'ucla', 'uci', 'scranton'];

export function getCampusSlug() {
  return window.__RIDEOPS_CAMPUS_SLUG__ || null;
}

export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
}

export function shadeHex(hex, amount) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function getCampusParam() {
  const slug = getCampusSlug();
  return slug ? '?campus=' + encodeURIComponent(slug) : '';
}

export function getLoginUrl() {
  const slug = getCampusSlug();
  return slug ? '/' + slug + '/login' : '/login';
}

export function getCampusPalette(campusKey) {
  if (typeof window.getCampusPalette === 'function') {
    return window.getCampusPalette(campusKey);
  }
  return ['#4682B4','#36648B','#B0C4DE','#D2B48C','#C4A067','#8FAF9F','#7A9DBF','#BFA98A'];
}

export { VALID_SLUGS };
