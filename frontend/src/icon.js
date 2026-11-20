function drawIcon(n) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), s = n / 1024;
  x.fillStyle = '#1a0911'; x.fillRect(0, 0, n, n);
  const g = x.createLinearGradient(0, 0, 0, n);
  g.addColorStop(0, '#ff7d94'); g.addColorStop(1, '#8e1b3a');
  x.beginPath();
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const px = 16 * Math.sin(t) ** 3;
    const py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const X = n / 2 + px * 19.5 * s, Y = n / 2 + py * 19.5 * s - 20 * s;
    i ? x.lineTo(X, Y) : x.moveTo(X, Y);
  }
  x.closePath(); x.fillStyle = g; x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `italic 700 ${250 * s}px Georgia, serif`;
  x.fillText('PV', n / 2, n / 2 - 30 * s);
  return c.toDataURL('image/png');
}

function setLink(rel, href, sizes) {
  document.querySelectorAll(`link[rel="${rel}"]`).forEach(l => l.remove());
  const l = document.createElement('link'); l.rel = rel; l.href = href;
  if (sizes) l.sizes = sizes; document.head.append(l);
}

try {
  setLink('apple-touch-icon', drawIcon(180), '180x180');
  setLink('icon', drawIcon(192), '192x192');
  const manifest = {
    name: 'P&V · Prince & Victory', short_name: 'P&V', start_url: location.origin + '/',
    display: 'standalone', background_color: '#1a0911', theme_color: '#1a0911',
    icons: [192, 512].map(n => ({ src: drawIcon(n), sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' })),
  };
  setLink('manifest', URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })));
} catch (e) { /* icons are optional */ }
