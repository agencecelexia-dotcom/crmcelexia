import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useClientsForMap } from '../hooks/use-clients'
import { Skeleton } from '@/components/ui/skeleton'
import { MapPin } from 'lucide-react'

// Fix default Leaflet marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Violet marker for our brand
const violetIcon = new L.DivIcon({
  className: '',
  html: `<div style="
    width: 28px; height: 28px;
    background: #8B5CF6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
})

interface GeoCache {
  [key: string]: { lat: number; lng: number } | null
}

const CACHE_KEY = 'celexia_geocache'

function loadCache(): GeoCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCache(cache: GeoCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore quota errors */ }
}

async function geocodeCity(city: string, address?: string | null): Promise<{ lat: number; lng: number } | null> {
  const query = address ? `${address}, ${city}, France` : `${city}, France`
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=fr&limit=1`,
      { headers: { 'Accept-Language': 'fr' } }
    )
    const data = await resp.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
    // Fallback: try city only
    if (address) {
      const resp2 = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city + ', France')}&countrycodes=fr&limit=1`,
        { headers: { 'Accept-Language': 'fr' } }
      )
      const data2 = await resp2.json()
      if (data2.length > 0) {
        return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) }
      }
    }
    return null
  } catch {
    return null
  }
}

interface ClientMarker {
  id: string
  company_name: string
  city: string | null
  lat: number
  lng: number
}

export function ClientsMap() {
  const navigate = useNavigate()
  const { data: clients, isLoading } = useClientsForMap()
  const [markers, setMarkers] = useState<ClientMarker[]>([])
  const [geocoding, setGeocoding] = useState(false)
  const geocodedRef = useRef(false)

  const doGeocode = useCallback(async () => {
    if (!clients || clients.length === 0 || geocodedRef.current) return
    geocodedRef.current = true
    setGeocoding(true)

    const cache = loadCache()
    const result: ClientMarker[] = []
    const toGeocode: { id: string; company_name: string; city: string; address: string | null; cacheKey: string }[] = []

    for (const c of clients) {
      if (!c.city) continue
      const cacheKey = (c.address ? `${c.address}|${c.city}` : c.city).toLowerCase()
      if (cacheKey in cache) {
        const coords = cache[cacheKey]
        if (coords) {
          result.push({ id: c.id, company_name: c.company_name, city: c.city, lat: coords.lat, lng: coords.lng })
        }
      } else {
        toGeocode.push({ id: c.id, company_name: c.company_name, city: c.city, address: c.address ?? null, cacheKey })
      }
    }

    // Geocode in batches of 1 (Nominatim rate limit: 1 req/s)
    for (const item of toGeocode) {
      const coords = await geocodeCity(item.city, item.address)
      cache[item.cacheKey] = coords
      if (coords) {
        result.push({ id: item.id, company_name: item.company_name, city: item.city, lat: coords.lat, lng: coords.lng })
      }
      setMarkers([...result])
      // Nominatim requires 1 second between requests
      if (toGeocode.indexOf(item) < toGeocode.length - 1) {
        await new Promise((r) => setTimeout(r, 1100))
      }
    }

    saveCache(cache)
    setMarkers(result)
    setGeocoding(false)
  }, [clients])

  useEffect(() => {
    doGeocode()
  }, [doGeocode])

  if (isLoading) {
    return <Skeleton className="h-[500px] w-full rounded-lg" />
  }

  if (!clients || clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/20">
        <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Aucun client à afficher</p>
        <p className="text-sm text-muted-foreground mt-1">
          Les clients avec une ville renseignée apparaîtront sur la carte.
        </p>
      </div>
    )
  }

  const clientsWithCity = clients.filter((c) => c.city)

  return (
    <div className="relative">
      {geocoding && (
        <div className="absolute top-3 right-3 z-[1000] bg-background/90 backdrop-blur-sm border rounded-md px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          Géolocalisation... ({markers.length}/{clientsWithCity.length})
        </div>
      )}
      <div className="rounded-lg overflow-hidden border shadow-sm" style={{ height: 500 }}>
        <MapContainer
          center={[46.6, 2.5]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]} icon={violetIcon}>
              <Popup>
                <div className="text-sm min-w-[140px]">
                  <p className="font-semibold">{m.company_name}</p>
                  {m.city && <p className="text-muted-foreground text-xs">{m.city}</p>}
                  <button
                    onClick={() => navigate(`/clients/${m.id}`)}
                    className="mt-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium underline cursor-pointer"
                  >
                    Voir la fiche client →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {markers.length} client{markers.length > 1 ? 's' : ''} localisé{markers.length > 1 ? 's' : ''} sur {clientsWithCity.length} avec une ville renseignée
      </p>
    </div>
  )
}
