const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const MAPBOX_STYLES = {
  dark: 'mapbox/navigation-night-v1',
  light: 'mapbox/outdoors-v12'
};

export function getMapTiles(style = 'dark') {
  if (!MAPBOX_ACCESS_TOKEN) {
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
    };
  }

  return {
    url: `https://api.mapbox.com/styles/v1/${MAPBOX_STYLES[style] || MAPBOX_STYLES.dark}/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`,
    options: {
      attribution: '&copy; Mapbox &copy; OpenStreetMap',
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 20
    }
  };
}
