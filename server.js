require("dotenv").config();

const express = require("express");
const pharmacies = require("./pharmacies.json");
const fs = require('fs');

function getVisited() {
  const data = fs.readFileSync('./visited.json');
  return JSON.parse(data).visited;
}

const app = express();
app.use(express.static('public'));
const PORT = 3000;

/* =======================
   Formule Haversine
======================= */
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/*
========================
ORS
========================
*/

async function getTravelTimeMinutes(fromLat, fromLon, toLat, toLon) {

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OSRM error ${response.status}`);
  }

  const data = await response.json();

  const seconds = data.routes[0].duration;
  const minutes = seconds / 60;
const totalSeconds = data.routes[0].duration;
const totalMinutes = Math.round(totalSeconds / 60);

  return Math.max(1, Math.round(minutes));
}

/* =======================
   /nearest
======================= */
app.get("/nearest", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({
      error: "Paramètres lat et lon requis"
    });
  }

  let nearest = null;

  pharmacies.forEach(p => {
    if (!p.latitude || !p.longitude) return;

    const d = distanceKm(lat, lon, p.latitude, p.longitude);

    if (!nearest || d < nearest.distanceKm) {
      nearest = { ...p, distanceKm: d };
    }
  });

  if (!nearest) {
    return res.status(404).json({
      error: "Aucune pharmacie trouvée"
    });
  }

  res.json({
    nom: nearest.INTITULE_CLIENT,
    ville: nearest.VILLE,
    matrice: nearest.MATRICE,
    groupement: nearest.GROUPEMENT,
    distance_km: Number(nearest.distanceKm.toFixed(2)),
    waze_url: `https://waze.com/ul?ll=${nearest.latitude},${nearest.longitude}&navigate=yes&from=Current+Location`
  });
});

/* =======================
   /nearest-route
======================= */
app.get("/nearest-route", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({
      error: "Paramètres lat et lon requis"
    });
  }

  const withDistance = pharmacies
    .filter(p => p.latitude && p.longitude)
    .map(p => ({
      ...p,
      distanceKm: distanceKm(lat, lon, p.latitude, p.longitude)
    }));

  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

  const candidates = withDistance.slice(0, 5);

res.json({
  position: { lat, lon },
  candidates: candidates.map(p => ({
    nom: p.INTITULE_CLIENT,
    ville: p.VILLE,
    latitude: p.latitude,
    longitude: p.longitude,
    distance_km: Number(p.distanceKm.toFixed(2))
  }))
});

});

/* =======================
   /nearest-route-test
   (avec fallback ORS)
======================= */
app.get("/nearest-route-test", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        error: "Paramètres lat et lon requis"
      });
    }

    let nearest = null;

    pharmacies.forEach(p => {
      if (!p.latitude || !p.longitude) return;

      const d = distanceKm(lat, lon, p.latitude, p.longitude);

      if (!nearest || d < nearest.distanceKm) {
        nearest = { ...p, distanceKm: d };
      }
    });

    if (!nearest) {
      return res.status(404).json({
        error: "Aucune pharmacie trouvée"
      });
    }

    let travelMinutes = null;

    try {
      travelMinutes = await getTravelTimeMinutes(
        lat,
        lon,
        nearest.latitude,
        nearest.longitude
      );
    } catch (e) {
      console.log("ORS indisponible, fallback distance simple");
    }

    res.json({
      nom: nearest.INTITULE_CLIENT,
      ville: nearest.VILLE,
      matrice: nearest.MATRICE,
      groupement: nearest.GROUPEMENT,
      distance_km: Number(nearest.distanceKm.toFixed(2)),
      temps_minutes: travelMinutes,
      waze_url: `https://waze.com/ul?ll=${nearest.latitude},${nearest.longitude}&navigate=yes&from=Current+Location`
    });

  } catch (err) {
    res.status(500).json({
      error: "Impossible de calculer le temps de trajet",
      details: err.message
    });
  }
});

/* =======================
   /go (page mobile)
======================= */
app.get("/", (req, res) => {
  res.redirect("/go");
});

app.get("/go", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


/* =======================
   Fonction calcul détour
======================= */
async function calculateDetourMinutes(start, pharmacy, end, directMinutes) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${start.lng},${start.lat};` +
      `${pharmacy.lng},${pharmacy.lat};` +
      `${end.lng},${end.lat}?overview=false`;

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const durationSeconds = data.routes[0].duration;
    const viaMinutes = Math.round(durationSeconds / 60);

// 🔥 vrai détour = durée via pharmacie - durée trajet direct
const detour = viaMinutes - directMinutes;

return detour > 0 ? detour : 0;


    }

    return null;

  } catch (error) {
    console.error("Erreur OSRM détour:", error.message);
    return null;
  }
}

/* =======================
   /route-pharmacies
======================= */
app.get('/route-pharmacies', async (req, res) => {

  const { fromLat, fromLon, toLat, toLon } = req.query;

  if (!fromLat || !fromLon || !toLat || !toLon) {
    return res.status(400).json({ error: 'Coordonnées manquantes' });
  }

  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OSRM error ${response.status}`);
    }

    const data = await response.json();

    const totalSeconds = data.routes[0].duration;
    const totalMinutes = Math.round(totalSeconds / 60);

    if (!data.routes || !data.routes[0] || !data.routes[0].geometry) {
      return res.status(500).json({
        error: "Route non trouvée"
      });
    }

    const routePoints = data.routes[0].geometry.coordinates.map(coord => ({
      lon: coord[0],
      lat: coord[1]
    }));

    const thresholdKm = 10;
    
    const visitedList = getVisited();

    // 🔥 IMPORTANT : Promise.all pour permettre await
    const pharmaciesOnRoute = await Promise.all(

      pharmacies.map(async (pharmacy) => {

        let minDistance = Infinity;
        let closestIndex = -1;

        routePoints.forEach((point, index) => {

          const dist = distanceKm(
            pharmacy.latitude,
            pharmacy.longitude,
            point.lat,
            point.lon
          );

          if (dist < minDistance) {
            minDistance = dist;
            closestIndex = index;
          }

        });

        if (minDistance <= thresholdKm) {

          const isVisited = visitedList.includes(String(pharmacy.cip));

          // 🔥 NOUVEAU : calcul détour
          const detourMinutes = await calculateDetourMinutes(
  { lat: fromLat, lng: fromLon },
  { lat: pharmacy.latitude, lng: pharmacy.longitude },
  { lat: toLat, lng: toLon },
  totalMinutes
);

const etaMinutes = Math.round((closestIndex / routePoints.length) * totalMinutes);

          return {
  ...pharmacy,
  distance_to_route_km: Number(minDistance.toFixed(2)),
  route_index: closestIndex,
  visited: isVisited,
  detour_minutes: detourMinutes,
  eta_minutes: etaMinutes   // ← AJOUTE CETTE LIGNE
};
        }

        return null;

      })

    );

  const finalPharmacies = pharmaciesOnRoute
  .filter(p => p !== null)
  .slice(0, 5);

res.json({
  total: finalPharmacies.length,
  total_trajet_minutes: totalMinutes,
  pharmacies: finalPharmacies
});


  } catch (error) {
    console.error("ERREUR COMPLETE :", error);
    res.status(500).json({
      error: "Erreur OSRM route",
      details: error.message
    });
  }

});

/* =======================
   TEST VISITE (temporaire)
======================= */
app.get('/test-visit', (req, res) => {

  const cip = req.query.cip;

  const data = JSON.parse(fs.readFileSync('./visited.json'));

  if (!data.visited.includes(String(cip))) {
    data.visited.push(String(cip));
    fs.writeFileSync('./visited.json', JSON.stringify(data, null, 2));
  }

  res.json({ success: true });

});


/* =======================
   MARK VISITED (propre)
======================= */
app.post('/mark-visited', express.json(), (req, res) => {

  const { cip } = req.body;

  if (!cip) {
    return res.status(400).json({ error: "CIP manquant" });
  }

  const data = JSON.parse(fs.readFileSync('./visited.json'));

  if (!data.visited.includes(String(cip))) {
    data.visited.push(String(cip));
    fs.writeFileSync('./visited.json', JSON.stringify(data, null, 2));
  }

  res.json({ success: true });

});


/* =======================
   Démarrage serveur
======================= */
app.listen(PORT, "0.0.0.0", () => {

  console.log(`🚀 API démarrée sur http://localhost:${PORT}`);

});
