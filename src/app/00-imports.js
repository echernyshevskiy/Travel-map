// Код приложения разложен по файлам src/app/NN-раздел.js; сборка склеивает их по порядку
// в один модуль (плагин appParts в vite.config.mjs). Справочные данные — JSON-модули.
import COUNTRIES_GEOJSON from '../data/countries.min.json';
// Границы регионов России (упрощённые, ~100 КБ) — для отметок внутри
// домашнего региона. Крым — одним контуром из тех же границ стран.
import RU_REGIONS_GEOJSON from '../data/ru_regions.json';
// Справочник городов для поиска без сети: столицы и крупные города мира (от
// 100 тыс., Natural Earth) и все 1117 городов России с регионом (hflabs/city,
// CC BY-SA 4.0). Строка «название|широта|долгота|страна|население, тыс.|столица|регион»;
// разбирается при первом поиске.
import WORLD_CITIES_TXT from '../data/world_cities.json';
// Подробные границы (Natural Earth 1:10m, регионы — OSM) лежат отдельными файлами
// в папке borders/ рядом с приложением и подгружаются только при приближении
import BORDERS_INDEX from '../data/borders_index.json';
import COUNTRY_RU from '../data/country_ru.json';
import COUNTRY_CONTINENT from '../data/country_continent.json';
import COUNTRY_ISO from '../data/country_iso.json';
import COUNTRY_INFO from '../data/country_info.json';

// Независимая логика — настоящие ES-модули с модульными тестами (src/lib/)
import { haversine, pointInGeometry, trackDistanceKm, encodePolyline, getEntryCoords, downsample, downsampleNumeric, downsampleSegments, gpxDistanceKm, geomAreaKm2, polyLabelPoint, mainRing, decodedCoordsCache, snapToTrack } from '../lib/geo.js';
import { escapeHtml, escapeAttr, safeUrl, normSearch, formatPace, parseRaceTime, formatRaceTime, fmtDelta, daysWord, pluralVisits, monthsWord } from '../lib/format.js';
import { getAllCityVisits, uniqueCityVisits, distinctCityKeys } from '../lib/visits.js';
import { SYNC_META, itemJson, mergeKind, parseTokenExpiry } from '../lib/sync-merge.js';
import { gtlExtract } from '../lib/timeline-parse.js';
