const cache = new Map();
const CACHE_LIMIT = 250;
let nominatimQueue = Promise.resolve();
let lastNominatimRequest = 0;
let ncbiQueue = Promise.resolve();
let lastNcbiRequest = 0;
let gdeltQueue = Promise.resolve();
let lastGdeltRequest = 0;

function cacheGet(key) {
  const entry = cache.get(key);
  return entry ? { ...entry, fresh: entry.expiresAt > Date.now() } : null;
}
function cacheSet(key, value, ttlMs) {
  if (cache.size >= CACHE_LIMIT) {
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(entryKey);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs, cachedAt: new Date().toISOString() });
}
function staleOrThrow(key, error) {
  const entry = cacheGet(key);
  if (entry) return { ...entry.value, cached: true, stale: true, cachedAt: entry.cachedAt };
  throw error;
}
async function fetchJson(url, { timeout = 8000, headers = {}, body, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { method, body, headers, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream service returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 3_000_000) throw new Error('Upstream response exceeded the allowed size.');
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}

function queueNominatim() {
  const current = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimRequest = Date.now();
  });
  nominatimQueue = current.catch(() => {});
  return current;
}
async function geocodePlace(query) {
  const key = `nominatim:${query.toLocaleLowerCase('en')}`;
  const cached = cacheGet(key);
  if (cached?.fresh) return { result: cached.value, cached: true };
  await queueNominatim();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', addressdetails: '1' }).toString();
  try {
    const results = await fetchJson(url, { timeout: 7000, headers: { accept: 'application/json', 'user-agent': 'CareBridge/1.0 (nearby healthcare directory)' } });
    if (!Array.isArray(results)) throw new Error('Location search returned an invalid response.');
    const place = results[0];
    if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) throw new Error('No matching location was found. Try a district or address.');
    const result = { lat: Number(place.lat), lon: Number(place.lon), label: typeof place.display_name === 'string' ? place.display_name.slice(0, 300) : query };
    cacheSet(key, result, 24 * 60 * 60 * 1000);
    return { result, cached: false };
  } catch (error) {
    const stale = cacheGet(key);
    if (stale) return { result: stale.value, cached: true, stale: true, cachedAt: stale.cachedAt };
    throw error;
  }
}
function osmAddress(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:suburb'], tags['addr:city'] || tags['addr:town'] || tags['addr:village'], tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(', ');
}
function mapOsmFacility(element) {
  const tags = element.tags || {};
  const lat = Number.isFinite(element.lat) ? element.lat : element.center?.lat;
  const lon = Number.isFinite(element.lon) ? element.lon : element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = typeof tags.name === 'string' && tags.name.trim() ? tags.name.trim().slice(0, 200) : '';
  if (!name) return null;
  const address = osmAddress(tags);
  const contacts = ['phone', 'contact:phone', 'email', 'contact:email', 'website', 'contact:website'].filter((key) => typeof tags[key] === 'string' && tags[key].trim()).map((key) => ({ type: key.includes('phone') ? 'phone' : key.includes('email') ? 'email' : 'website', value: tags[key].trim().slice(0, 300) }));
  const facilityType = tags.amenity || tags.healthcare || 'healthcare';
  return { id: `osm-${element.type}-${element.id}`, name, address, latitude: lat, longitude: lon, facilityType, contacts, source: 'OpenStreetMap contributors', sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}` };
}
async function nearbyFacilities({ lat, lon, query }) {
  const place = query ? await geocodePlace(query) : { result: { lat, lon, label: 'User-approved location' }, cached: false };
  const center = place.result;
  const key = `overpass:${center.lat.toFixed(4)},${center.lon.toFixed(4)}`;
  const cached = cacheGet(key);
  if (cached?.fresh) return { ...cached.value, cached: true, cachedAt: cached.cachedAt };
  const radius = 10000;
  const overpassQuery = `[out:json][timeout:20];(node[amenity~"^(hospital|clinic|doctors|health_post)$"](around:${radius},${center.lat},${center.lon});way[amenity~"^(hospital|clinic|doctors|health_post)$"](around:${radius},${center.lat},${center.lon});relation[amenity~"^(hospital|clinic|doctors|health_post)$"](around:${radius},${center.lat},${center.lon});node[healthcare~"^(hospital|clinic|doctor|health_centre|health_post|medical_centre)$"](around:${radius},${center.lat},${center.lon});way[healthcare~"^(hospital|clinic|doctor|health_centre|health_post|medical_centre)$"](around:${radius},${center.lat},${center.lon});relation[healthcare~"^(hospital|clinic|doctor|health_centre|health_post|medical_centre)$"](around:${radius},${center.lat},${center.lon}););out center 60;`;
  try {
    const data = await fetchJson('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(overpassQuery)}`, timeout: 25000, headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'CareBridge/1.0 (nearby healthcare directory)' } });
    if (!Array.isArray(data.elements)) throw new Error('OpenStreetMap returned an invalid facility response.');
    const facilities = data.elements.map(mapOsmFacility).filter(Boolean).slice(0, 60);
    const result = { location: center, facilities, source: 'OpenStreetMap contributors', sourceUrl: 'https://www.openstreetmap.org/copyright', retrievedAt: new Date().toISOString(), stale: false };
    cacheSet(key, result, 6 * 60 * 60 * 1000);
    return { ...result, cached: false };
  } catch (error) { return staleOrThrow(key, error); }
}

const NEWS_TOPICS = {
  healthcare: 'healthcare OR "public health" OR hospital OR medicine',
  hospitals: 'hospital OR hospitals OR "healthcare system"',
  research: '"medical research" OR "health research" OR "healthcare innovation"',
  public_health: '"public health" OR outbreak OR vaccination OR WHO',
  india: 'India AND (healthcare OR hospital OR "public health" OR medicine)',
};
function mapGdeltArticle(article) {
  if (!article || typeof article.url !== 'string' || !/^https?:\/\//i.test(article.url) || typeof article.title !== 'string') return null;
  let url;
  try { url = new URL(article.url); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const publishedAt = typeof article.seendate === 'string' && /^\d{14}$/.test(article.seendate)
    ? `${article.seendate.slice(0, 4)}-${article.seendate.slice(4, 6)}-${article.seendate.slice(6, 8)}T${article.seendate.slice(8, 10)}:${article.seendate.slice(10, 12)}:${article.seendate.slice(12, 14)}Z`
    : null;
  return { title: article.title.slice(0, 400), publisher: typeof article.domain === 'string' ? article.domain.slice(0, 200) : url.hostname, url: url.toString(), publishedAt, language: typeof article.language === 'string' ? article.language : null, sourceCountry: typeof article.sourcecountry === 'string' ? article.sourcecountry : null, source: 'GDELT DOC 2.0' };
}
// GDELT asks clients to send at most one request every five seconds per IP.
function queueGdeltRequest() {
  const current = gdeltQueue.then(async () => {
    const wait = Math.max(0, 5200 - (Date.now() - lastGdeltRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastGdeltRequest = Date.now();
  });
  gdeltQueue = current.catch(() => {});
  return current;
}
async function medicalNews(topic = 'healthcare') {
  if (!Object.hasOwn(NEWS_TOPICS, topic)) throw new Error('Choose a supported news topic.');
  const key = `gdelt:${topic}`;
  const cached = cacheGet(key);
  if (cached?.fresh) return { ...cached.value, cached: true, cachedAt: cached.cachedAt };
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({ query: NEWS_TOPICS[topic], mode: 'artlist', format: 'json', sort: 'datedesc', maxrecords: '25', timespan: '7d' }).toString();
  try {
    await queueGdeltRequest();
    const data = await fetchJson(url, { timeout: 8000, headers: { accept: 'application/json' } });
    if (!Array.isArray(data.articles)) throw new Error('GDELT returned an invalid article response.');
    const deduped = new Map();
    for (const article of data.articles) {
      const mapped = mapGdeltArticle(article);
      if (mapped && !deduped.has(mapped.url)) deduped.set(mapped.url, mapped);
    }
    const articles = [...deduped.values()].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 20);
    const result = { topic, articles, source: 'GDELT DOC 2.0', sourceUrl: 'https://www.gdeltproject.org/', retrievedAt: new Date().toISOString(), note: 'Aggregated media reporting; GDELT does not medically verify articles.', stale: false };
    cacheSet(key, result, 15 * 60 * 1000);
    return { ...result, cached: false };
  } catch (error) { return staleOrThrow(key, error); }
}

async function queueNcbiRequest() {
  const current = ncbiQueue.then(async () => {
    const wait = Math.max(0, 350 - (Date.now() - lastNcbiRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNcbiRequest = Date.now();
  });
  ncbiQueue = current.catch(() => {});
  return current;
}
async function recentResearch(query) {
  const key = `pubmed:${query.toLocaleLowerCase('en')}`;
  const cached = cacheGet(key);
  if (cached?.fresh) return { ...cached.value, cached: true, cachedAt: cached.cachedAt };
  const common = { db: 'pubmed', tool: 'carebridge', retmode: 'json' };
  if (process.env.NCBI_EMAIL) common.email = process.env.NCBI_EMAIL;
  if (process.env.NCBI_API_KEY) common.api_key = process.env.NCBI_API_KEY;
  try {
    const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
    searchUrl.search = new URLSearchParams({ ...common, term: query, sort: 'pub+date', retmax: '10' }).toString();
    await queueNcbiRequest();
    const search = await fetchJson(searchUrl, { timeout: 8000, headers: { accept: 'application/json' } });
    const ids = search.esearchresult?.idlist;
    if (!Array.isArray(ids)) throw new Error('PubMed returned an invalid search response.');
    let publications = [];
    if (ids.length) {
      const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
      summaryUrl.search = new URLSearchParams({ ...common, id: ids.join(','), retmax: '10' }).toString();
      await queueNcbiRequest();
      const summary = await fetchJson(summaryUrl, { timeout: 8000, headers: { accept: 'application/json' } });
      const records = summary.result || {};
      publications = ids.map((id) => records[id]).filter((record) => record && typeof record.title === 'string').map((record) => ({ pmid: record.uid || record.articleids?.find((item) => item.idtype === 'pubmed')?.value || '', title: record.title, authors: Array.isArray(record.authors) ? record.authors.map((author) => author.name).filter(Boolean).slice(0, 8) : [], publicationDate: record.pubdate || null, journal: record.fulljournalname || record.source || null, url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(record.uid || '')}/`, source: 'PubMed' }));
    }
    const result = { query, publications, source: 'PubMed / NCBI', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/', retrievedAt: new Date().toISOString(), note: 'Research records are not clinical recommendations.', stale: false };
    cacheSet(key, result, 12 * 60 * 60 * 1000);
    return { ...result, cached: false };
  } catch (error) { return staleOrThrow(key, error); }
}

module.exports = { nearbyFacilities, medicalNews, recentResearch };
