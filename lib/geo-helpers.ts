export function formatDistance(meters: number, unit: "meter" | "km" = "km") {
  if (unit === "meter" && meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} KM`;
}

export interface ReverseGeocode {
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
}

// Reverse geocoding pakai OpenStreetMap Nominatim (gratis, tanpa API key).
// Dipanggil dari browser, hanya untuk melengkapi nama wilayah (kelurahan/
// kecamatan/kota/provinsi) — TIDAK dipakai untuk perhitungan jarak (itu
// pakai koordinat GPS asli lewat PostGIS di database).
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocode> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=id`,
      { headers: { Accept: "application/json" } }
    );
    const data = await res.json();
    const addr = data?.address || {};
    return {
      province: addr.state || null,
      city: addr.city || addr.county || addr.regency || null,
      district: addr.suburb || addr.city_district || addr.district || null,
      village: addr.village || addr.neighbourhood || addr.hamlet || null
    };
  } catch {
    return { province: null, city: null, district: null, village: null };
  }
}
