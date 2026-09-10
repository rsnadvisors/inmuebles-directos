// Synthetic records only. Images are embedded so no image host is contacted.
const image = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const properties = [
  {
    id: "fixture-house", slug: "fixture-house", title: "Casa de prueba",
    status: "published", listing_type: "sale", property_type: "house",
    price: 125000, currency: "USD", area_total_m2: 120,
    address: "Dirección ficticia 100", district: "Distrito de prueba", city: "Piura",
    description: "Inmueble ficticio para smoke tests.", bedrooms: 3, bathrooms: 2,
    parking_spaces: 1, lat: -5.19, lng: -80.63,
    property_images: [{ public_url: image, sort_order: 0, is_cover: true }],
  },
  {
    id: "fixture-apartment", slug: "fixture-apartment", title: "Departamento de prueba",
    status: "published", listing_type: "rent", property_type: "apartment",
    price: 1800, currency: "PEN", area_total_m2: 70,
    address: "Dirección ficticia 200", district: "Distrito de prueba", city: "Piura",
    description: "Departamento ficticio sin fotografías.", bedrooms: 2, bathrooms: 1,
    parking_spaces: 0, lat: -5.20, lng: -80.62, property_images: [],
  },
  {
    id: "fixture-land", slug: "fixture-land", title: "Terreno de prueba",
    status: "published", listing_type: "sale", property_type: "land",
    price: 50000, currency: "USD", area_total_m2: 300,
    address: "Dirección ficticia 300", district: "Distrito de prueba", city: "Piura",
    description: "Terreno ficticio.", bedrooms: null, bathrooms: null,
    parking_spaces: null, lat: -5.21, lng: -80.61, property_images: [],
  },
];

export const emptyInventory: typeof properties = [];
