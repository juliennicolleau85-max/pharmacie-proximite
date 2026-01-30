const fs = require("fs");

// ⚠️ fetch est NATIF dans Node 18+ (tu es en Node 24)
const pharmacies = JSON.parse(
  fs.readFileSync("./pharmacies_raw.json", "utf8")
);

// Nettoyage des champs texte
function clean(text) {
  if (!text) return "";
  return text
    .replace(/CEDEX.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Appel Nominatim
async function fetchGeo(query) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=json" +
    "&addressdetails=1" +
    "&limit=5" +
    "&q=" + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "pharmacie-proximite/1.0 (contact: julie@test.local)",
      "Accept-Language": "fr"
    }
  });

  return await res.json();
}

async function geocode() {
  const results = [];
  const errors = [];

  for (const p of pharmacies) {
    const fullAddress = `${clean(p.adresse)}, ${p.cp} ${clean(p.ville)}, France`;
    console.log("📍", fullAddress);

    let data = [];

    try {
      // 1️⃣ tentative adresse complète
      data = await fetchGeo(fullAddress);

      // 2️⃣ fallback : CP + ville
      if (!data.length) {
        const fallback = `${p.cp} ${clean(p.ville)}, France`;
        data = await fetchGeo(fallback);
      }

      // 3️⃣ sélection du meilleur résultat
      const best =
        data.find(d =>
          d.type === "house" ||
          d.type === "building" ||
          d.class === "amenity"
        ) || data[0];

      if (best) {
        results.push({
          ...p,
          latitude: parseFloat(best.lat),
          longitude: parseFloat(best.lon)
        });
      } else {
        results.push({ ...p, latitude: null, longitude: null });
        errors.push(fullAddress);
      }

      // ⏱️ pause obligatoire pour Nominatim
      await new Promise(resolve => setTimeout(resolve, 1200));

    } catch (e) {
      results.push({ ...p, latitude: null, longitude: null });
      errors.push(fullAddress);
    }
  }

  // Écriture des résultats
  fs.writeFileSync(
    "./pharmacies.json",
    JSON.stringify(results, null, 2)
  );

  fs.writeFileSync(
    "./geocode_errors.txt",
    errors.join("\n")
  );

  console.log("✅ pharmacies.json recréé");
  console.log(`⚠️ ${errors.length} adresses non géocodées`);
}

geocode();
