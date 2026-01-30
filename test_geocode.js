
async function test() {
  const address = "2 rue de la Paix, 44000 Nantes, France";

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&q=" +
    encodeURIComponent(address);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "pharmacie-proximite/1.0 (contact: julie@test.local)",
      "Accept-Language": "fr"
    }
  });

  const data = await res.json();
  console.log(data);
}

test();
