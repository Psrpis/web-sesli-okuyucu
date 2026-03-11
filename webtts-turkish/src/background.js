// background.js — gTTS ses sentezi isteklerini yönetir

function metniParcala(metin, maxUzunluk = 200) {
  const bolumler = metin.match(/[^.!?。！？\n]+[.!?。！？\n]?/g) || [metin];
  let mevcutParca = '';
  const parcalar = [];

  for (const bolum of bolumler) {
    if ((mevcutParca + bolum).length > maxUzunluk) {
      if (mevcutParca.trim()) parcalar.push(mevcutParca.trim());
      mevcutParca = bolum;
    } else {
      mevcutParca += bolum;
    }
  }
  if (mevcutParca.trim()) parcalar.push(mevcutParca.trim());

  const sonuc = [];
  for (const p of parcalar) {
    if (p.length <= maxUzunluk) {
      sonuc.push(p);
    } else {
      const kelimeler = p.split(' ');
      let tmp = '';
      for (const k of kelimeler) {
        if ((tmp + ' ' + k).length > maxUzunluk) {
          if (tmp.trim()) sonuc.push(tmp.trim());
          tmp = k;
        } else {
          tmp += (tmp ? ' ' : '') + k;
        }
      }
      if (tmp.trim()) sonuc.push(tmp.trim());
    }
  }
  return sonuc.filter(p => p.length > 0);
}

async function gttsArrayBuffer(metin, dil, alan, yavas) {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    q: metin,
    tl: dil,
    client: 'tw-ob',
    ttsspeed: yavas ? '0.24' : '1',
  });
  const url = `https://${alan}/translate_tts?${params}`;

  const yanit = await fetch(url, {
    headers: {
      'Referer': `https://${alan}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    },
  });

  if (!yanit.ok) {
    throw new Error(`HTTP ${yanit.status}: ${yanit.statusText}`);
  }

  return yanit.arrayBuffer();
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((mesaj, _gonderen, yanit) => {
  if (mesaj.tur !== 'TTS_SENTEZLE') return false;

  const { metin, dil, alan, yavas } = mesaj;

  (async () => {
    try {
      const parcalar = metniParcala(metin);
      const mp3Listesi = [];

      for (const parca of parcalar) {
        const buffer = await gttsArrayBuffer(parca, dil, alan, yavas);
        const base64 = bufferToBase64(buffer);
        mp3Listesi.push(base64);
      }

      yanit({ basarili: true, mp3Listesi });
    } catch (hata) {
      console.error('[WebTTS background]', hata);
      yanit({ basarili: false, hata: hata.message });
    }
  })();

  return true;
});
