let config = [];
let cycleTime = 10;
let rssItems = [];
let staticItems = [];
let currentRssIndex = 0;
let staticRefreshTime = 60;
let articleTimer = null;

async function loadConfig() {
  try {
    const res = await fetch('config.json');
    config = await res.json();
    cycleTime = config[0].cycle;

    const allItems = config.slice(1);
    rssItems = allItems.filter((item) => item.type === 'RSS');
    staticItems = allItems.filter((item) => item.type !== 'RSS');

    const staticCycles = staticItems
      .map((item) => Number(item.cycle))
      .filter((value) => Number.isFinite(value) && value > 0);
    staticRefreshTime = staticCycles.length ? Math.min(...staticCycles) : 60;

    startClock();
    await renderStaticItems();
    await renderCrypto();
    await renderChicagoArt();
    startStaticRefresh();
    startCryptoRefresh();
    startChicagoArtRefresh();
    startRssDisplay();

  } catch (err) {
    console.error("Failed to load config:", err);
  }
}

function startStaticRefresh() {
  setInterval(() => {
    renderStaticItems();
  }, staticRefreshTime * 1000);
}

async function renderCrypto() {
  const cryptoBox   = document.getElementById('cryptoContent');
  const cryptoItems = staticItems.filter((item) => item.type === 'Crypto');
  if (!cryptoBox || !cryptoItems.length) return;

  try {
    const cards = await Promise.all(cryptoItems.map((item) => loadCryptoChart(item)));
    cryptoBox.style.display = 'block';
    cryptoBox.innerHTML = cards.join('');
  } catch (err) {
    cryptoBox.innerHTML = '<p>Crypto data unavailable.</p>';
    cryptoBox.style.display = 'block';
  }
}

function startCryptoRefresh() {
  setInterval(renderCrypto, 60 * 60 * 1000);
}

async function renderChicagoArt() {
  const chicagoArtBox   = document.getElementById('chicagoArtContent');
  const chicagoArtItems = staticItems.filter((item) => item.type === 'ChicagoArt');
  if (!chicagoArtBox || !chicagoArtItems.length) return;

  try {
    const cards = await Promise.all(chicagoArtItems.map((item) => loadChicagoArt(item)));
    chicagoArtBox.style.display = 'block';
    chicagoArtBox.innerHTML = cards.join('');
  } catch (err) {
    chicagoArtBox.style.display = 'none';
  }
}

function startChicagoArtRefresh() {
  setInterval(renderChicagoArt, 1 * 60 * 1000);
}

function startRssDisplay() {
  showRssItem();

  if (rssItems.length <= 1) return;

  function scheduleNext() {
    const currentItem = rssItems[currentRssIndex];
    const maxItems = currentItem.maxItems || 5;
    const waitTime = cycleTime * maxItems * 1000;

    setTimeout(() => {
      clearTimeout(articleTimer);
      articleTimer = null;
      currentRssIndex = (currentRssIndex + 1) % rssItems.length;
      showRssItem();
      scheduleNext();
    }, waitTime);
  }

  scheduleNext();
}

function startClock() {
  const clock = document.getElementById('clock');
  if (!clock) return;

  setInterval(() => {
    const now = new Date();
    const time = now.toLocaleTimeString();
    const date = now.toDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    clock.innerHTML = '<span id="time">' + time + '</span><span id="date">' + date + '</span>';
  }, 1000);
}

function getWeatherSymbol(code) {
  if (code === 0)                return '☀️ Clear';
  if (code === 1)                return '🌤️ Mostly Clear';
  if (code === 2)                return '⛅️ Partly Cloudy';
  if (code === 3)                return '☁️ Overcast';
  if (code >= 45 && code <= 48) return '🌫️ Foggy';
  if (code >= 51 && code <= 55) return '🌦️ Drizzle';
  if (code >= 61 && code <= 65) return '🌧️ Rainy';
  if (code >= 71 && code <= 77) return '❄️ Snowy';
  if (code >= 80 && code <= 82) return '🌧️ Showers';
  if (code >= 85 && code <= 86) return '🌨️ Snow Showers';
  if (code >= 95 && code <= 99) return '⛈️ Thunderstorm';
  return '🌡️ Unknown';
}

async function loadWeather(url, title = 'Weather') {
  const res = await fetch(url);
  const data = await res.json();

  const temp = data.current.temperature_2m;
  const wind = data.current.wind_speed_10m;
  const symbol = getWeatherSymbol(data.current.weather_code);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let forecastHTML = '';
  for (let i = 1; i <= 3; i++) {
    const parts = data.daily.time[i].split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = days[date.getDay()];
    const high = Math.round(data.daily.temperature_2m_max[i]);
    const low = Math.round(data.daily.temperature_2m_min[i]);
    const icon = getWeatherSymbol(data.daily.weather_code[i]);
    forecastHTML += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-top: 1px solid rgba(148,163,184,0.2);">
        <span style="width: 36px; color: #94a3b8;">${day}</span>
        <span>${icon}</span>
        <span style="color: #f87171;">${high}°</span>
        <span style="color: #7dd3fc;">${low}°</span>
      </div>
    `;
  }

  return `
    <div>
      <h2>${escapeHtml(title)}</h2>
      <p style="font-size: 1.4rem; margin: 4px 0 2px 0;">${symbol}</p>
      <p style="font-size: 2rem; margin: 4px 0 2px 0;">${temp}°F</p>
      <p style="margin: 0;">Wind: ${wind} mph</p>
      <div style="margin-top: 10px;">${forecastHTML}</div>
    </div>
  `;
}

async function loadCryptoChart(item) {
  const url = `https://api.coingecko.com/api/v3/coins/${item.cryptoId}/market_chart?vs_currency=${item.vs_currency || 'usd'}&days=${item.days || 7}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data = await res.json();
  if (!data.prices) throw new Error('No price data in response');

  const prices = data.prices.map(([timestamp, price]) => ({
    time: new Date(timestamp).toLocaleDateString(),
    price: price.toFixed(2)
  }));

  const chartId = `cryptoChart_${item.cryptoId}`;

  const html = `
    <div class="cryptoCard">
      <h3 style="margin:0 0 6px 0; font-size:0.95rem;">${escapeHtml(item.title)}</h3>
      <div class="chartWrapper"><canvas id="${chartId}"></canvas></div>
    </div>
  `;

  setTimeout(() => {
    const ctx = document.getElementById(chartId);
    if (ctx) {
      new Chart(ctx, {
        type: item.chartType || 'line',
        data: {
          labels: prices.map(p => p.time),
          datasets: [{
            label: item.title,
            data: prices.map(p => parseFloat(p.price)),
            borderColor: item.color || '#6bff6b',
            backgroundColor: (item.color || '#6bff6b') + '1a',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: false }
          }
        }
      });
    }
  }, 100);

  return html;
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadRss(url, maxItems = 5) {
  const proxyUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url);
  const res = await fetch(proxyUrl);
  const data = await res.json();

  if (data.status !== 'ok' || !data.items?.length) {
    return '<div><h1>Feed Unavailable</h1><p>' + (data.message || 'No items found.') + '</p></div>';
  }

  const items = data.items.slice(0, maxItems);

  let html = '<div class="article-feed">';
  items.forEach((item, i) => {
    const decoded = item.title
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
    const desc = item.description
      ? stripHtml(item.description).substring(0, 300) + '...'
      : '';
    const date = item.pubDate
      ? new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';

    html += `
      <div class="article-card" style="display: ${i === 0 ? 'flex' : 'none'}" data-index="${i}">
        <div class="article-source">${escapeHtml(data.feed.title)} <span class="article-date">${date}</span></div>
        <h1 class="article-title">${escapeHtml(decoded)}</h1>
        <div class="article-divider"></div>
        <p class="article-desc">${escapeHtml(desc)}</p>
        <div class="article-num">${i + 1} / ${items.length}</div>
      </div>
    `;
  });
  html += '</div>';

  return html;
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function cycleArticles() {
  const cards = document.querySelectorAll('.article-card');
  if (!cards.length) return;

  let visible = 0;
  cards.forEach((c, i) => { if (c.style.display !== 'none') visible = i; });

  cards[visible].style.display = 'none';
  const next = (visible + 1) % cards.length;
  cards[next].style.display = 'flex';

  articleTimer = setTimeout(cycleArticles, cycleTime * 1000);
}

function getValuePath(obj, path) {
  return path.split('.').reduce(
    (current, key) => current && typeof current === 'object' ? current[key] : undefined,
    obj
  );
}

async function loadApiCard(item) {
  const res = await fetch(item.URL);
  const data = await res.json();

  const rawValue = item.valuePath ? getValuePath(data, item.valuePath) : data;
  const value = rawValue === undefined || rawValue === null ? 'N/A' : String(rawValue);

  return `
    <div class="infoCard">
      <h2>${escapeHtml(item.title || 'API Data')}</h2>
      <p style="font-size: 1.1rem; margin: 0; line-height: 1.4;">${escapeHtml(item.prefix || '')}${escapeHtml(value)}${escapeHtml(item.suffix || '')}</p>
    </div>
  `;
}

function probeImages(candidates, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!candidates.length) { resolve(null); return; }

    let failed = 0;
    const timer = setTimeout(() => resolve(null), timeoutMs);

    candidates.forEach(({ url, title }) => {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        resolve({ url, title });
      };
      img.onerror = () => {
        if (++failed === candidates.length) {
          clearTimeout(timer);
          resolve(null);
        }
      };
      img.src = url;
    });
  });
}

async function loadChicagoArt() {
  try {
    const page = Math.floor(Math.random() * 1200) + 1;
    const url = `https://api.artic.edu/api/v1/artworks?fields=id,title,image_id&limit=10&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`AIC error: ${res.status}`);
    const data = await res.json();

    if (!data.data || !data.data.length) return '';

    const candidates = data.data
      .filter((record) => record.image_id)
      .map((record) => ({
        url: `https://www.artic.edu/iiif/2/${record.image_id}/full/843,/0/default.jpg`,
        title: record.title || ''
      }));

    const winner = await probeImages(candidates);
    if (!winner) return '';

    return `<img src="${winner.url}" alt="${escapeHtml(winner.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;">`;
  } catch (err) {
    console.error('Chicago Art error:', err);
    return '';
  }
}

async function renderStaticItems() {
  const weatherBox = document.getElementById('weather');
  const imageBox   = document.getElementById('imageContent');
  const apiBox     = document.getElementById('apiContent');

  const weatherItems = staticItems.filter((item) => item.type === 'Weather');
  const imageItems   = staticItems.filter((item) => item.type === 'Image');
  const apiItems     = staticItems.filter((item) => item.type === 'API');

  // Weather
  if (weatherItems.length) {
    try {
      const markup = await Promise.all(
        weatherItems.map((item) => loadWeather(item.URL, item.title || 'Denver Weather'))
      );
      weatherBox.innerHTML = markup.join('');
    } catch (err) {
      weatherBox.innerHTML = '<p>Weather unavailable.</p>';
    }
  }

  // Image
  if (imageItems.length) {
    imageBox.style.display = 'block';
    imageBox.innerHTML = imageItems.map((item) =>
      `<img class="staticImage" src="${item.URL}" alt="Static signage image">`
    ).join('');
  }

  // API
  if (apiItems.length) {
    try {
      const cards = await Promise.all(apiItems.map((item) => loadApiCard(item)));
      apiBox.style.display = 'block';
      apiBox.innerHTML = cards.map(c =>
        c.replace('<div class="infoCard">', '').replace(/<\/div>\s*$/, '')
      ).join('');
    } catch (err) {
      apiBox.innerHTML = '<p>API data unavailable.</p>';
      apiBox.style.display = 'block';
    }
  }

}

async function showRssItem() {
  const feedContent = document.getElementById('feedContent');

  if (!rssItems.length) {
    feedContent.innerHTML = '<h1>No RSS items configured.</h1>';
    return;
  }

  if (articleTimer) {
    clearTimeout(articleTimer);
    articleTimer = null;
  }

  const item = rssItems[currentRssIndex];
  try {
    feedContent.innerHTML = await loadRss(item.URL, item.maxItems || 5);
    articleTimer = setTimeout(cycleArticles, cycleTime * 1000);
  } catch (err) {
    console.error('Failed to load RSS feed:', err);
    feedContent.innerHTML = `
      <div>
        <h1>Feed Unavailable</h1>
        <p>This RSS URL could not be loaded in-browser.</p>
        <p style="font-size: 1rem;">Check URL, CORS policy, and HTTPS.</p>
      </div>
    `;
  }
}

loadConfig();