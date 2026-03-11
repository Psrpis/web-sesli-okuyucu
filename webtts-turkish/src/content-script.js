// content-script.js — Metin seçimi, yüzen buton ve ses çalma

(function () {
  'use strict';

  // ── Durum ───────────────────────────────────────────────────────────────────
  let ayarlar = { dil: 'tr', alan: 'translate.google.com', yavas: false, hiz: 1.0, ses: 1.0 };
  let secilenMetin = '';
  let butonGorunu = false;
  let caliniyor = false;
  let durdurmaTalep = false;
  let audioCtx = null;
  let mevcutKaynak = null;

  // ── Shadow DOM ──────────────────────────────────────────────────────────────
  const konteynir = document.createElement('div');
  konteynir.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
  document.documentElement.appendChild(konteynir);
  const golge = konteynir.attachShadow({ mode: 'closed' });

  golge.innerHTML = `
    <style>
      #btn {
        display: none;
        position: fixed;
        width: 40px; height: 40px;
        border-radius: 50%;
        border: none;
        background: #4a90e2;
        color: #fff;
        font-size: 16px;
        line-height: 40px;
        text-align: center;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transition: background .15s, transform .1s;
        padding: 0;
        user-select: none;
      }
      #btn:hover { background: #357abd; transform: scale(1.08); }
      #btn.yukleniyor { background: #f0a500; animation: nabiz .7s infinite alternate; }
      #btn.caliniyor  { background: #e74c3c; }
      #btn.caliniyor:hover { background: #c0392b; }
      @keyframes nabiz { to { transform: scale(1.13); } }
    </style>
    <button id="btn" title="Seçili metni sesli oku">▶</button>
  `;

  const buton = golge.getElementById('btn');

  // ── Ayarlar ─────────────────────────────────────────────────────────────────
  chrome.storage.sync.get(['dil','alan','yavas','hiz','ses'], (k) => {
    if (k.dil)  ayarlar.dil  = k.dil;
    if (k.alan) ayarlar.alan = k.alan;
    if (typeof k.yavas === 'boolean') ayarlar.yavas = k.yavas;
    if (k.hiz)  ayarlar.hiz  = Number(k.hiz);
    if (k.ses)  ayarlar.ses  = Number(k.ses);
  });
  chrome.storage.onChanged.addListener((c) => {
    for (const [k, { newValue }] of Object.entries(c)) {
      if (k in ayarlar) ayarlar[k] = newValue;
    }
  });

  // ── Dil tespiti ─────────────────────────────────────────────────────────────
  function dilTespit(metin) {
    if (ayarlar.dil !== 'oto') return ayarlar.dil;
    const s = metin.slice(0, 200);
    if (/[şğüöçıİŞĞÜÖÇ]/.test(s)) return 'tr';
    if (/[\u0400-\u04FF]/.test(s)) return 'ru';
    if (/[\uAC00-\uD7AF]/.test(s)) return 'ko';
    if (/[\u3040-\u30FF]/.test(s)) return 'ja';
    if (/[\u4E00-\u9FFF]/.test(s)) return 'zh-CN';
    return 'tr';
  }

  // ── Buton göster/gizle ───────────────────────────────────────────────────────
  let gizleTimer = null;

  function butunuGoster(x, y) {
    clearTimeout(gizleTimer);
    buton.style.left = Math.min(x + 12, window.innerWidth - 52) + 'px';
    buton.style.top  = Math.max(y - 52, 8) + 'px';
    buton.style.display = 'block';
    butonGorunu = true;
  }

  function butunuGizle(ms = 400) {
    gizleTimer = setTimeout(() => {
      if (!caliniyor) { buton.style.display = 'none'; butonGorunu = false; }
    }, ms);
  }

  // ── AudioContext ile çalma ──────────────────────────────────────────────────
  function audioCtxAl() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buffer;
  }

  async function parcaCal(base64) {
    const ctx = audioCtxAl();

    // Kullanıcı etkileşiminden sonra resume gerekebilir
    if (ctx.state === 'suspended') await ctx.resume();

    const arrayBuffer = base64ToArrayBuffer(base64);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    return new Promise((coz, red) => {
      const kaynak = ctx.createBufferSource();
      kaynak.buffer = audioBuffer;
      kaynak.playbackRate.value = ayarlar.hiz;

      const gain = ctx.createGain();
      gain.gain.value = ayarlar.ses;

      kaynak.connect(gain);
      gain.connect(ctx.destination);

      mevcutKaynak = kaynak;
      kaynak.onended = coz;
      kaynak.start(0);
    });
  }

  async function mp3ListesiCal(mp3Listesi) {
    for (const base64 of mp3Listesi) {
      if (durdurmaTalep) break;
      await parcaCal(base64);
    }
  }

  // ── Durdur ──────────────────────────────────────────────────────────────────
  function durdurmaSesi() {
    durdurmaTalep = true;
    if (mevcutKaynak) {
      try { mevcutKaynak.stop(); } catch (_) {}
      mevcutKaynak = null;
    }
    caliniyor = false;
    butonuSifirla();
    if (!secilenMetin) butunuGizle(500);
  }

  function butonuSifirla() {
    buton.textContent = '▶';
    buton.title = 'Seçili metni sesli oku';
    buton.classList.remove('caliniyor', 'yukleniyor');
  }

  // ── Ana okuma fonksiyonu ─────────────────────────────────────────────────────
  async function sesliOku() {
    if (caliniyor) { durdurmaSesi(); return; }

    const metin = secilenMetin.trim();
    if (!metin) return;

    caliniyor = true;
    durdurmaTalep = false;
    buton.textContent = '⏳';
    buton.title = 'Yükleniyor…';
    buton.classList.add('yukleniyor');

    try {
      const yanit = await chrome.runtime.sendMessage({
        tur: 'TTS_SENTEZLE',
        metin,
        dil: dilTespit(metin),
        alan: ayarlar.alan,
        yavas: ayarlar.yavas,
      });

      if (!yanit || !yanit.basarili) {
        throw new Error(yanit?.hata || 'Ses verisi alınamadı');
      }

      buton.textContent = '■';
      buton.title = 'Okumayı durdur';
      buton.classList.remove('yukleniyor');
      buton.classList.add('caliniyor');

      await mp3ListesiCal(yanit.mp3Listesi);

    } catch (hata) {
      console.error('[WebTTS]', hata);
      // Kullanıcıya bildiri göster (alert yerine daha nazik)
      const eski = buton.textContent;
      buton.textContent = '✗';
      buton.style.background = '#c0392b';
      setTimeout(() => {
        buton.style.background = '';
        butonuSifirla();
      }, 2000);
    } finally {
      caliniyor = false;
      durdurmaTalep = false;
      mevcutKaynak = null;
      butonuSifirla();
      if (!secilenMetin) butunuGizle(800);
    }
  }

  // ── Olay dinleyiciler ────────────────────────────────────────────────────────
  buton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    sesliOku();
  });
  buton.addEventListener('mouseenter', () => clearTimeout(gizleTimer));

  document.addEventListener('mouseup', (e) => {
    // Butonun kendisine tıklanmışsa seçimi değiştirme
    setTimeout(() => {
      const secim = window.getSelection();
      const metin = secim?.toString().trim() ?? '';
      if (metin.length > 0) {
        secilenMetin = metin;
        butunuGoster(e.clientX, e.clientY);
      } else if (!caliniyor) {
        secilenMetin = '';
        butunuGizle();
      }
    }, 10);
  });

  document.addEventListener('keyup', () => {
    const metin = window.getSelection()?.toString().trim() ?? '';
    if (metin.length > 0) {
      secilenMetin = metin;
      if (!butonGorunu) {
        try {
          const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
          butunuGoster(r.right, r.top);
        } catch (_) {}
      }
    } else if (!caliniyor) {
      secilenMetin = '';
      butunuGizle();
    }
  });

  document.addEventListener('selectionchange', () => {
    if (!(window.getSelection()?.toString().trim()) && !caliniyor) {
      secilenMetin = '';
      butunuGizle(600);
    }
  });

  window.addEventListener('scroll', () => {
    if (!caliniyor) butunuGizle(200);
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && caliniyor) durdurmaSesi();
  });

})();
