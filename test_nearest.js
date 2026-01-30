const fs = require("fs");
const haversine = require("./distance");

// ⚠️ position simulée (ex: centre de Nantes)
const myPosition = {
  latitude: 47.218371,
  longitude: -1.553621
};

const pharmacies = JSON.parse(
  fs.readFileSync("./pharmacies.json", "utf8")
);

let nearest = null;
let minDistance = Infinity;

for (const p of pharmacies) {
  if (!p.latitude || !p.longitude) continue;

  const distance = haversine(
    myPosition.latitude,
    myPosition.longitude,
    p.latitude,
    p.longitude
  );

  if (distance < minDistance) {
    minDistance = distance;
    nearest = {
      ...p,
      distanceKm: distance
    };
  }
}

console.log(nearest);

console.log({
  nom: nearest.INTITULE_CLIENT,
  ville: nearest.VILLE,
  matrice: nearest.MATRICE,
  groupement: nearest.GROUPEMENT,
  distance_km: nearest.distanceKm.toFixed(2)
});

