# External data sources and attribution

## MedlinePlus health-topic web service — implemented

- Official documentation: <https://medlineplus.gov/about/developers/webservices/>
- Endpoint: `https://wsearch.nlm.nih.gov/ws/query`
- Query: English `healthTopics`, user-entered plain query, up to 10 results, `rettype=topic`, and constant `tool=carebridge`.
- Access and terms checked: official documentation says the service is free, requires no registration/license, supports English and Spanish, is updated daily Tuesday–Saturday, requests no more than 85 per minute per IP, and recommends 12–24 hour caching.
- CareBridge calls it only through `GET /api/v1/health-information/search?q=...` (2–100 characters) and `POST /api/v1/health-information/guidance` (up to 600 characters of free text, reduced server-side to at most five plain keywords joined with OR). Requests are limited to 20/minute/IP and time out after 7 seconds. The response XML is size-limited, validated, parsed without enabling entity processing, and rejected if it contains a DTD/entity declaration. Output summaries are converted to bounded plain text; links are accepted only from the HTTPS MedlinePlus hostname. Successful results are held in a bounded in-process cache for 18 hours; if refresh fails, a result may be served stale for up to 48 additional hours and is explicitly labelled stale in the response/UI.
- Symptom guidance is educational matching, not triage: the server flags known warning phrases (for example chest pain, difficulty breathing, unconscious, severe bleeding, stroke, seizure) so the client can show emergency advice even when the upstream lookup fails, and every response states that it is not a diagnosis. The entered description is never stored, logged, echoed back or forwarded — only the derived keywords are sent — and no account, appointment or patient record is included.
- Response/UI identify MedlinePlus.gov and explicitly state that MedlinePlus does not endorse CareBridge. MedlinePlus is free, requires no registration, API key or licence, and the client never receives a credential. The English source is presented as English content and is not presented as translated material.
- Workspace verification: direct HTTPS query returned HTTP 200/XML. Integration test runs the backend endpoint, checks a diabetes result, plain-text output and repeated-query cache behavior. Availability remains dependent on outbound network access and the upstream service.

## Government of India National Health Portal hospital directory — not imported

- Candidate catalogue: <https://www.data.gov.in/catalog/hospital-directory-national-health-portal>
- Inspection from the available workspace returned HTTP 403. Search results did not expose a verifiable resource link or downloadable schema. Therefore the actual file/API, licence, update date, required registration key, available columns and reuse permission could not be confirmed.
- No government-source importer, claimed dataset, or fabricated source/update metadata is included. Do not bulk-download an assumed URL or imply the current admin-entered hospital records originate from this catalogue.
- Until the catalogue is verifiably accessible and its data terms/resource format are reviewed, administrators may manage hospital records manually and record the real source and source-updated date. Data should be labelled as directory information, not a live facility/availability feed.
- To finish a compliant import later: obtain the official current resource URL and licence, inspect its actual column schema, then implement a one-off/reusable import that validates names/locations/coordinates, stores source/update provenance, and uses a stable source identifier for duplicate-safe upserts. A refresh must not overwrite admin data blindly.

## Hospital map — implemented from stored directory coordinates

- Leaflet/React-Leaflet displays published hospital coordinates that an administrator explicitly saved in `[longitude, latitude]` GeoJSON order. Invalid/out-of-range coordinate input is rejected. Records without coordinates remain in the searchable list and are not geocoded or assigned invented map pins.
- Default tiles: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Optional Vite build variable: `VITE_MAP_TILE_URL` (a compatible template). Attribution to OpenStreetMap contributors is shown in the map and links to its copyright page.
- OpenStreetMap tile usage policy: <https://operations.osmfoundation.org/policies/tiles/>. Its public tile service is best-effort, has usage restrictions, and is not a guaranteed production SLA. Standard tiles must use the provider's published correct HTTPS URL; the service requires visible attribution, a valid web Referer, normal browser User-Agent, honored cache headers (or 7-day cache if custom caching), and forbids bulk/offline downloads. The default Vite Referrer-Policy is not overridden to block Referer. Do not bulk-download/pre-cache tiles or bypass the policy. Use a suitable tile provider with its own permission/attribution/caching rules for production.
- Geolocation is optional and only requested after a user presses “Use my location.” The coordinates are used in the browser map only and are not stored or sent by CareBridge to a geocoder. Users can continue with manual district search.
- Map tiles/marker behavior have not been browser-visual-tested in this workspace; the client build and hospital coordinate API are independently checked. The list view is the directory fallback.

## Nearby OSM health facilities — implemented, best-effort

- Data comes from the public Overpass read-only API (`https://overpass-api.de/api/interpreter`) using nearby amenity/healthcare tags; place names are resolved through the end-user-triggered Nominatim search API (`https://nominatim.openstreetmap.org/search`). Overpass reference: <https://wiki.openstreetmap.org/wiki/Overpass_API>. Nominatim policy: <https://operations.osmfoundation.org/policies/nominatim/>.
- No key is required. Public instances are capacity-limited and are not an SLA. CareBridge queries are bounded to 10 km / 60 named facilities, rate-limited to 10 endpoint calls/minute/IP, time out, and cache successful facility searches for 6 hours; resolved address searches cache for 24 hours and are serialized to at most one Nominatim request/second. Cache is process-local and capped; stale facility results are returned with stale state on refresh failure.
- Search contains only a user-entered address/district, or explicit user-approved coordinates; no profile, symptom, or appointment data is sent. Unnamed or coordinate-missing results are excluded, and contacts/address are shown only if present in OSM tags. Facility source object links and OpenStreetMap attribution are displayed. Results are geographic directory data, not open-hours, capacity, services, or live operations.
- Workspace test result: upstream endpoint availability and frontend flow not yet live-tested. The feature must gracefully show failure when public Overpass/Nominatim limits or network access prevent retrieval. Do not scale use without a provider or self-hosted service.

## GDELT DOC 2.0 news — implemented

- Official reference: <https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/>; API: `https://api.gdeltproject.org/api/v2/doc/doc`. Public API, no credential was required by its documented examples. Uses Article List (`mode=artlist`), JSON output, bounded topic templates, 7-day lookback, newest-first sorting, up to 25 upstream/20 returned results, URL deduplication, 8-second timeout and a 15-minute process-local cache. Endpoint request limit: 10/minute/IP. Outbound calls are serialized to at most one every 5.2 seconds, matching the provider's per-IP pacing request (a faster poll returned HTTP 429 in this workspace).
- Response/UI display actual article title, publisher/domain, article URL, source-seen timestamp where supplied, language/country where supplied, and retrieval time. Original source link is always shown. No author, summary, image, or timestamp is fabricated. Labels identify aggregated reporting and warn that articles are not medically verified. No article text is reproduced.
- Verification result: not yet live-tested in this workspace.

## PubMed / NCBI E-utilities — implemented

- Official references: <https://www.ncbi.nlm.nih.gov/books/NBK25497/> and <https://www.nlm.nih.gov/dataguide/eutilities/utilities.html> (legacy guide; follow NCBI's current linked guidance for future changes). Public E-utilities are usable without a key within official anonymous request limits; API key is optional. `tool=carebridge` is sent. Optional `NCBI_EMAIL` and `NCBI_API_KEY` server environment values are supported and never sent to the browser. Calls are serialized to <=3 requests/second, each response timeout is 8 seconds, 10 PubMed records maximum, requests limited at CareBridge API to 10/minute/IP and results cached 12 hours.
- ESearch uses PubMed, query, `sort=pub+date`, `retmax=10`; ESummary retrieves title, available authors, publication date, journal, PMID, official PubMed URL. No abstract is rendered. Results are labeled research citations, not clinical recommendations.
- Verification result: not yet live-tested in this workspace. NCBI terms and limits should be rechecked before production deployment.

## ABDM HFR/HPR — not connected

- Official mission: <https://abdm.gov.in/>. The ABDM integration described in the project brief requires following the official sandbox developer onboarding, app registration, and any approvals/credentials applicable to the selected use case. Public anonymous registry API access was not established by the sources inspected here. No endpoints, credentials, doctors, or facility records are invented or called. CareBridge's own admin-verified MongoDB records remain the only verified CareBridge directory data.
- NMC public doctor register is a manual reference only; CareBridge does not scrape it or present an unofficial wrapper as an NMC API. Registration/verification is separate from schedule/appointment availability.
- Remaining setup: complete ABDM sandbox onboarding and provide approved API documentation/access details before implementation of a real authenticated registry integration.

## WHO official alerts — not connected

- Verified WHO Africa RSS information page: <https://www.afro.who.int/rss-feeds>. The official page lists Regional Office for Africa press releases, emergencies/outbreaks, and speeches and says use is subject to WHO copyright terms; it does not establish a worldwide WHO feed. Extracted page text did not expose the actual feed href/endpoint, so no RSS endpoint was guessed and no WHO content is currently fetched or shown as connected. If added later, label it specifically WHO Africa, confirm the feed URL by inspecting the official link and review WHO copyright terms; do not label regional content as worldwide alerts.

## CareBridge appointments and persisted facility records

Doctor approval, availability slots, appointments, reminders and administrator-entered hospital records remain in MongoDB. Booking checks approved status and published availability and the active appointment unique index prevents concurrent duplicate slot claims. External data cannot create or change these records or claim operational hospital availability. Availability is maintained by CareBridge doctors and remains distinct from external directory data.

## Login layout

The login-only stylesheet uses a dynamic small-viewport height, compact side panel, and hides the global footer only on `/login`; the registration layout and authentication/session logic are unchanged. At very short mobile heights it reduces nonessential branding copy. Layout was build-checked; rendered viewport overflow has not been browser-verified in this workspace.
