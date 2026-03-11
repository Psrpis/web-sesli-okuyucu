// popup.js — Ayar yönetimi

const elementler = {
  dil:    document.getElementById('dil'),
  alan:   document.getElementById('alan'),
  yavas:  document.getElementById('yavas'),
  hiz:    document.getElementById('hiz'),
  ses:    document.getElementById('ses'),
  hizDeger: document.getElementById('hiz-deger'),
  sesDeger: document.getElementById('ses-deger'),
  kaydedildi: document.getElementById('kaydetme-bildirimi'),
};

// Kayıtlı ayarları yükle
chrome.storage.sync.get(['dil', 'alan', 'yavas', 'hiz', 'ses'], (kayitli) => {
  if (kayitli.dil  !== undefined) elementler.dil.value  = kayitli.dil;
  if (kayitli.alan !== undefined) elementler.alan.value = kayitli.alan;
  if (typeof kayitli.yavas === 'boolean') elementler.yavas.checked = kayitli.yavas;

  const hiz = kayitli.hiz ?? 1.0;
  elementler.hiz.value = hiz;
  elementler.hizDeger.textContent = parseFloat(hiz).toFixed(1) + '×';

  const ses = kayitli.ses ?? 1.0;
  elementler.ses.value = ses;
  elementler.sesDeger.textContent = Math.round(ses * 100) + '%';
});

// Canlı etiket güncellemeleri
elementler.hiz.addEventListener('input', () => {
  elementler.hizDeger.textContent = parseFloat(elementler.hiz.value).toFixed(1) + '×';
});

elementler.ses.addEventListener('input', () => {
  elementler.sesDeger.textContent = Math.round(parseFloat(elementler.ses.value) * 100) + '%';
});

// Kaydet: tüm değişiklikler anında kayıt
let kaydetZamanlayici = null;

function kaydet() {
  clearTimeout(kaydetZamanlayici);
  kaydetZamanlayici = setTimeout(() => {
    const ayarlar = {
      dil:   elementler.dil.value,
      alan:  elementler.alan.value,
      yavas: elementler.yavas.checked,
      hiz:   parseFloat(elementler.hiz.value),
      ses:   parseFloat(elementler.ses.value),
    };

    chrome.storage.sync.set(ayarlar, () => {
      elementler.kaydedildi.style.display = 'block';
      clearTimeout(kaydetZamanlayici);
      setTimeout(() => {
        elementler.kaydedildi.style.display = 'none';
      }, 1500);
    });
  }, 300);
}

['change', 'input'].forEach(olay => {
  elementler.dil.addEventListener(olay,  kaydet);
  elementler.alan.addEventListener(olay, kaydet);
  elementler.yavas.addEventListener(olay, kaydet);
  elementler.hiz.addEventListener(olay,  kaydet);
  elementler.ses.addEventListener(olay,  kaydet);
});
