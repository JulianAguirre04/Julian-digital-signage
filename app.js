let config = [];
let cycleTime = 10;
let rssItems = [];
let staticItems = [];
let currentRssIndex = 0;
let staticRefreshTime = 60;

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
    startStaticRefresh();
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

function startRssDisplay() {
  showRssItem();

  if (rssItems.length <= 1) {
    return;
  }

  setInterval(() => {
    currentRssIndex = (currentRssIndex + 1) % rssItems.length;
    showRssItem();
  }, cycleTime * 1000);
}

function startClock() {
  const clock = document.getElementById('clock');
  // Check if clock element exists to avoid errors
  if (!clock) return; 

  setInterval(() => {
    const now = new Date();
    clock.innerText = now.toLocaleTimeString();
  }, 1000);
}

async function loadWeather(url, title = 'Weather') {
  const res = await fetch(url);
  const data = await res.json();

  return `
    <div>
      <h2>${escapeHtml(title)}</h2>
      <p style="font-size: 2rem; margin: 0;">${data.current.temperature_2m}F</p>
      <p>Wind: ${data.current.wind_speed_10m} mph</p>
    </div>
  `;
}

async function loadCryptoChart(item) {
  const url = `https://api.coingecko.com/api/v3/coins/${item.cryptoId}/market_chart?vs_currency=${item.vs_currency || 'usd'}&days=${item.days || 7}`;

  const res = await fetch(url);
  const data = await res.json();

  const prices = data.prices.map(([timestamp, price]) => ({
    time: new Date(timestamp).toLocaleDateString(),
    price: price.toFixed(2)
  }));

  const chartId = `cryptoChart_${item.cryptoId}`;
  const containerDiv = document.createElement('div');
  containerDiv.style.width = '100%';
  containerDiv.style.height = '300px';
  containerDiv.style.position = 'relative';
  
  const html = `
    <div class="infoCard" style="width: 100%;">
      <h2>${escapeHtml(item.title)}</h2>
      <canvas id="${chartId}" width="400" height="300"></canvas>
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
            borderColor: '#6bff6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: true }
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
  const res = await fetch(url);
  const xmlText = await res.text();
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

  const parserError = xml.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid RSS/Atom XML response');
  }

  const channelTitle =
    xml.querySelector('channel > title')?.textContent?.trim() ||
    xml.querySelector('feed > title')?.textContent?.trim() ||
    'News Feed';

  const rssItems = Array.from(xml.querySelectorAll('item')).map((item) => ({
    title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
    link: item.querySelector('link')?.textContent?.trim() || '#'
  }));

  const atomItems = Array.from(xml.querySelectorAll('entry')).map((entry) => ({
    title: entry.querySelector('title')?.textContent?.trim() || 'Untitled',
    link:
      entry.querySelector('link')?.getAttribute('href') ||
      entry.querySelector('id')?.textContent?.trim() ||
      '#'
  }));

  const items = (rssItems.length > 0 ? rssItems : atomItems).slice(0, maxItems);

  if (!items.length) {
    return `
      <div>
        <h1>${escapeHtml(channelTitle)}</h1>
        <p>No items found in this feed.</p>
      </div>
    `;
  }

  const list = items
    .map(
      (item) =>
        `<li style="margin: 0.5rem 0;"><a href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></li>`
    )
    .join('');

  return `
    <div>
      <h1>${escapeHtml(channelTitle)}</h1>
      <ul style="font-size: 1.5rem; line-height: 1.4;">${list}</ul>
    </div>
  `;
}

function getValuePath(obj, path) {
  return path.split('.').reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, obj);
}

async function loadApiCard(item) {
  const res = await fetch(item.URL);
  const data = await res.json();

  const rawValue = item.valuePath ? getValuePath(data, item.valuePath) : data;
  const value = rawValue === undefined || rawValue === null ? 'N/A' : String(rawValue);

  return `
    <div class="infoCard">
      <h2>${escapeHtml(item.title || item.tile || 'API Data')}</h2>
      <p style="font-size: 1.1rem; margin: 0; line-height: 1.4;">${escapeHtml(item.prefix || '')}${escapeHtml(value)}${escapeHtml(item.suffix || '')}</p>
    </div>
  `;
}

async function loadHarvardArt(item) {
  try {
    const url = `https://api.harvardartmuseums.org/object?apikey=${item.apiKey}&size=1&sort=random&hasImages=1`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.records || data.records.length === 0) {
      return `
        <div class="infoCard">
          <h2>${escapeHtml(item.title)}</h2>
          <p>No artworks found.</p>
        </div>
      `;
    }

    const record = data.records[0];
    let imageHtml = '';

    // Extract image from IIIF if available
    if (record.images && record.images.length > 0) {
      const img = record.images[0];
      if (img.iiifbaseuri) {
        const imageUrl = `${img.iiifbaseuri}/full/400,/0/default.jpg`;
        imageHtml = `<img src="${imageUrl}" alt="${escapeHtml(record.title)}" style="max-width: 100%; height: auto; margin: 10px 0;">`;
      }
    }

    return `
      <div class="infoCard">
        <h2>${escapeHtml(item.title)}</h2>
        <h3>${escapeHtml(record.title || 'Untitled')}</h3>
        ${imageHtml}
        <p style="font-size: 0.9rem; margin: 10px 0;"><strong>Artist:</strong> ${escapeHtml(record.people ? record.people.map(p => p.name).join(', ') : 'Unknown')}</p>
        <p style="font-size: 0.9rem;"><strong>Date:</strong> ${escapeHtml(record.dated || 'Unknown')}</p>
      </div>
    `;
  } catch (err) {
    console.error('Harvard Art error:', err);
    return `
      <div class="infoCard">
        <h2>${escapeHtml(item.title)}</h2>
        <p>Failed to load artwork.</p>
      </div>
    `;
  }
}

async function renderStaticItems() {
  const weatherBox = document.getElementById('weather');
  const staticContent = document.getElementById('staticContent');

  const weatherItems = staticItems.filter((item) => item.type === 'Weather');
  const imageItems = staticItems.filter((item) => item.type === 'Image');
  const apiItems = staticItems.filter((item) => item.type === 'API');
  const cryptoItems = staticItems.filter((item) => item.type === 'Crypto');
  const harvardItems = staticItems.filter((item) => item.type === 'Harvard');

  if (weatherItems.length) {
    try {
      const weatherMarkup = await Promise.all(
        weatherItems.map((item) => loadWeather(item.URL, item.title || 'Denver Weather'))
      );
      weatherBox.innerHTML = weatherMarkup.join('');
    } catch (err) {
      console.error('Failed to load weather:', err);
      weatherBox.innerHTML = '<p>Weather unavailable.</p>';
    }
  } else {
    weatherBox.innerHTML = '<p>No weather source configured.</p>';
  }

  const imageMarkup = imageItems
    .map((item) => `<img class="staticImage" src="${item.URL}" alt="Static signage image">`)
    .join('');

  let apiMarkup = '';
  if (apiItems.length) {
    try {
      const apiCards = await Promise.all(apiItems.map((item) => loadApiCard(item)));
      apiMarkup = apiCards.join('');
    } catch (err) {
      console.error('Failed to load API data:', err);
      apiMarkup = '<div class="infoCard"><p>API data unavailable.</p></div>';
    }
  }

  let cryptoMarkup = '';
  if (cryptoItems.length) {
    try {
      const cryptoCards = await Promise.all(cryptoItems.map((item) => loadCryptoChart(item)));
      cryptoMarkup = cryptoCards.join('');
    } catch (err) {
      console.error('Failed to load crypto data:', err);
      cryptoMarkup = '<div class="infoCard"><p>Crypto data unavailable.</p></div>';
    }
  }

  let harvardMarkup = '';
  if (harvardItems.length) {
    try {
      const harvardCards = await Promise.all(harvardItems.map((item) => loadHarvardArt(item)));
      harvardMarkup = harvardCards.join('');
    } catch (err) {
      console.error('Failed to load Harvard Art data:', err);
      harvardMarkup = '<div class="infoCard"><p>Harvard Art data unavailable.</p></div>';
    }
  }

  staticContent.innerHTML = imageMarkup || apiMarkup || cryptoMarkup || harvardMarkup
    ? `${imageMarkup}${apiMarkup}${cryptoMarkup}${harvardMarkup}`
    : '<p>Add Image, API, Crypto, or Harvard items in config.json for pinned visuals.</p>';
}

async function showRssItem() {
  const feedContent = document.getElementById('feedContent');

  if (!rssItems.length) {
    feedContent.innerHTML = '<h1>No RSS items configured.</h1>';
    return;
  }

  const item = rssItems[currentRssIndex];
  try {
    feedContent.innerHTML = await loadRss(item.URL, item.maxItems || 5);
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