require("dotenv").config();

const express = require("express");
const pharmacies = require("./pharmacies.json");

const app = express();
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

/* =======================
   ORS (optionnel)
======================= */
async function getTravelTimeMinutes(fromLat, fromLon, toLat, toLon) {
  const url =
    "https://api.openrouteservice.org/v2/directions/driving-car" +
    "?api_key=" + process.env.ORS_API_KEY;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [
        [fromLon, fromLat],
        [toLon, toLat]
      ]
    })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`ORS error ${response.status}: ${txt}`);
  }

  const data = await response.json();
  return Math.round(data.routes[0].summary.duration / 60);
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
app.get("/go", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pharmacies les plus proches</title>
      <style>
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #2c3e50, #4ca1af);
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          text-align: center;
        }
        .card {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          padding: 30px;
          border-radius: 20px;
          width: 90%;
          max-width: 400px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .btn {
          display: block;
          padding: 12px;
          background: #00c853;
          color: white;
          text-decoration: none;
          border-radius: 12px;
          font-weight: bold;
          font-size: 16px;
          margin-top: 10px;
        }
        .loading {
          font-size: 18px;
        }
        .pharma {
          margin-bottom: 20px;
        }
        hr {
          opacity: 0.3;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div id="content" class="loading">
          📍 Recherche de votre position...
        </div>
      </div>

      <script>
        function showError(message) {
          document.getElementById("content").innerHTML =
            "<p>" + message + "</p>";
        }

        function loadPharmacy(lat, lon) {
          fetch("/nearest-route?lat=" + lat + "&lon=" + lon)
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                showError(data.error);
                return;
              }

              const top3 = data.candidates.slice(0, 3);

              let html = "<h2>Pharmacies proches</h2>";

              top3.forEach(p => {
                const wazeUrl =
                  "https://waze.com/ul?ll=" +
                  p.latitude + "," +
                  p.longitude +
                  "&navigate=yes&from=Current+Location";

                html += \`
                  <div class="pharma">
                    <strong>\${p.nom}</strong><br>
                    \${p.ville}<br>
                    📏 \${p.distance_km} km
                    <a class="btn" href="\${wazeUrl}">
                      🚗 Ouvrir dans Waze
                    </a>
                  </div>
                  <hr>
                \`;
              });

              document.getElementById("content").innerHTML = html;
            })
            .catch(() => {
              showError("Erreur lors de la recherche.");
            });
        }

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            position => {
              const lat = position.coords.latitude;
              const lon = position.coords.longitude;
              loadPharmacy(lat, lon);
            },
            () => {
              showError("Impossible d'obtenir la position GPS.");
            },
            { enableHighAccuracy: true }
          );
        } else {
          showError("Géolocalisation non supportée.");
        }
      </script>
    </body>
    </html>
  `);
});



/* =======================
   Démarrage serveur
======================= */
app.listen(PORT, () => {
  console.log(`🚀 API démarrée sur http://localhost:${PORT}`);
});
