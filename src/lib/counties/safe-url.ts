/** Only approved public data hosts may be fetched by the server. */
export function allowedCountyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
      (host === 'www.arcgis.com' || host.endsWith('.arcgis.com') ||
        host === 'maps.wake.gov' || host === 'geo.sandag.org');
  } catch { return false; }
}
