/**
 * Location Service
 * Uses ip-api.com (free, no API key needed, 45 req/min)
 * to derive country, city, lat/lon from an IP address.
 * Falls back gracefully if unavailable.
 */

const cache = new Map(); // simple in-memory cache

async function getLocationFromIp(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168') || ip.startsWith('10.')) {
    return { country: 'Local', countryCode: 'LO', city: 'localhost', region: '', lat: 0, lon: 0, timezone: '', isp: 'local' };
  }

  // Check cache (24hr TTL)
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.ts < 86400000) return cached.data;

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();

    if (data.status === 'success') {
      const loc = {
        country:     data.country     || '',
        countryCode: data.countryCode || '',
        region:      data.regionName  || '',
        city:        data.city        || '',
        lat:         data.lat         || 0,
        lon:         data.lon         || 0,
        timezone:    data.timezone    || '',
        isp:         data.isp         || '',
      };
      cache.set(ip, { data: loc, ts: Date.now() });
      return loc;
    }
  } catch (err) {
    // silently fail — location is non-critical
  }

  return { country: 'Unknown', countryCode: '', city: '', region: '', lat: 0, lon: 0, timezone: '', isp: '' };
}

function parseUserAgent(ua = '') {
  const device  = /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : /tablet/i.test(ua) ? 'tablet' : 'desktop';
  const browser = /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : /firefox/i.test(ua) ? 'Firefox' : /edge/i.test(ua) ? 'Edge' : 'Other';
  const os      = /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : /android/i.test(ua) ? 'Android' : /ios|iphone|ipad/i.test(ua) ? 'iOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
  return { device, browser, os };
}

module.exports = { getLocationFromIp, parseUserAgent };
