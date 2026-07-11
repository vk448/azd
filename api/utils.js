function detectLangCode(label) {
  const l = String(label).toLowerCase();
  if (/english|eng|en[\s_-]/i.test(l)) return "en";
  if (/japanese|jpn|jp|jap/i.test(l)) return "ja";
  if (/spanish|esp|spa/i.test(l)) return "es";
  if (/portuguese|por|pt/i.test(l)) return "pt";
  if (/french|fra|fre|fr/i.test(l)) return "fr";
  if (/german|deu|ger|de/i.test(l)) return "de";
  if (/arabic|ara|ar/i.test(l)) return "ar";
  if (/hindi|hin|hi/i.test(l)) return "hi";
  if (/russian|rus|ru/i.test(l)) return "ru";
  if (/indonesian|ind|id/i.test(l)) return "id";
  if (/malay|msa|ms/i.test(l)) return "ms";
  if (/turkish|tur|tr/i.test(l)) return "tr";
  if (/italian|ita|it/i.test(l)) return "it";
  if (/korean|kor|ko/i.test(l)) return "ko";
  if (/thai|tha|th/i.test(l)) return "th";
  if (/vietnamese|vie|vi/i.test(l)) return "vi";
  if (/chinese|zho|zh/i.test(l)) return "zh";
  if (/polish|pol|pl/i.test(l)) return "pl";
  if (/dutch|nld|nl/i.test(l)) return "nl";
  return "en";
}

function stableHash(...parts) {
  let h = 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
  }
  return (h >>> 0).toString(36);
}

function encodeHash(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function decodeHash(hash) {
  try {
    return JSON.parse(Buffer.from(hash, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { detectLangCode, stableHash, encodeHash, decodeHash };
