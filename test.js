const BASE = "https://9anime.org.lv/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function slugify(t) {
  return t.toLowerCase().replace(/[:'"()]/g, "").replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function test() {
  // Test 1: slug + fetch page
  const title = "One Piece";
  const slug = slugify(title);
  console.log("Slug:", slug);
  const url = `${BASE}${slug}-episode-1/`;
  console.log("Fetching:", url);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  console.log("Status:", r.status);
  const h = await r.text();
  console.log("HTML length:", h.length);

  // Test 2: find malId
  const m = h.match(/var malId\s*=\s*["'](\d+)/);
  console.log("malId:", m ? m[1] : "NOT FOUND");

  // Test 3: try a different regex
  const m2 = h.match(/malId["'\s:=]+["']?(\d+)/i);
  console.log("malId v2:", m2 ? m2[1] : "NOT FOUND");

  // Test 4: search for any reference to mal
  const malLines = h.split("\n").filter(l => l.toLowerCase().includes("malid") || l.toLowerCase().includes("mal_id"));
  console.log("Lines with malid/mal_id:", malLines.length);
  malLines.forEach(l => console.log("  ", l.substring(0, 200)));
}

test().catch(e => console.error("ERROR:", e.message));
