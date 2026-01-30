const fs = require("fs");
const xlsx = require("xlsx");

// 📂 chemin exact vers ton fichier Excel
const workbook = xlsx.readFile("./data/prospects.xlsx");
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// conversion en JSON
const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

console.log("📄 Fichier :", workbook.SheetNames);
console.log("🧩 Colonnes trouvées :", Object.keys(rows[0]));

// mapping propre
const pharmacies = rows.map(r => ({
  cip: r.CIP,
  INTITULE_CLIENT: r.INTITULE_CLIENT,
  MATRICE: r.MATRICE,
  GROUPEMENT: r.GROUPEMENT,
  adresse: r.ADRESSE,
  cp: r.CP,
  VILLE: r.VILLE,
  PAYS: r.PAYS
}));

fs.writeFileSync(
  "./pharmacies_raw.json",
  JSON.stringify(pharmacies, null, 2)
);

console.log(`✅ pharmacies_raw.json créé (${pharmacies.length} lignes)`);
