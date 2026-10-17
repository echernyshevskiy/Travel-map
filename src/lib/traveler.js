// «Тип путешественника» — шуточный портрет по данным. Чистая функция:
// на входе записи и пара справочников, на выходе — главный образ, две
// дополнительные черты, шкалы «одно ↔ другое» и любопытные факты.
// Считается только посещённое (планы не в счёт). unit/traveler.test.js.
import { dateSpan } from './format.js';

const share = (a, b) => (a + b) ? a / (a + b) : 0.5;

// opts: { homeKey, continentOf(key) → 'Европа'…, regionsVisited — число регионов России }
export function travelerProfile(entries, opts = {}){
  const homeKey = opts.homeKey || 'Russia';
  const continentOf = opts.continentOf || (() => null);
  const all = (entries || []).filter(e => e && e.status !== 'wishlist');
  if(all.length < 3) return null;

  const routes = all.filter(e => e.type === 'route');
  const cities = all.filter(e => e.type === 'city');
  // страна записи: у маршрута — по большинству точек
  const keyOf = e => {
    if(e.countryKey) return e.countryKey;
    const ks = (e.waypointCountryKeys || []).filter(Boolean);
    if(!ks.length) return null;
    const cnt = {}; ks.forEach(k => { cnt[k] = (cnt[k] || 0) + 1; });
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  };
  const keyed = all.map(keyOf).filter(Boolean);
  const abroad = keyed.filter(k => k !== homeKey).length;
  const countries = new Set(keyed.filter(k => k !== homeKey));
  const continents = new Set(keyed.map(continentOf).filter(Boolean));

  const withCompany = all.filter(e => e.company);
  const alone = withCompany.filter(e => e.company === 'alone').length;
  const crowd = withCompany.filter(e => e.company === 'friends' || e.company === 'group').length;

  // природа: походы, вело, трейлы и маршруты с заметным набором высоты
  const steep = e => e.distanceKm > 0 && (e.elevationGain || 0) / e.distanceKm > 15;
  const natureRoutes = routes.filter(e => e.activity === 'hiking' || e.activity === 'cycling' || e.terrain === 'trail' || steep(e));
  const mountain = routes.filter(e => (e.activity === 'hiking' || e.terrain === 'trail') && steep(e));
  const roadtrips = routes.filter(e => e.activity === 'roadtrip');
  const runs = routes.filter(e => e.activity === 'running');
  const sport = all.filter(e => e.purpose === 'sport').length;
  const races = opts.races || 0;

  // поездки: длительность — по точным датам, иначе по дням треков, иначе по числу записей
  const byTrip = new Map();
  all.forEach(e => { if(e.trip){ if(!byTrip.has(e.trip)) byTrip.set(e.trip, []); byTrip.get(e.trip).push(e); } });
  const tripDays = [...byTrip.values()].map(list => {
    const span = dateSpan(list);
    if(span) return span.days;
    const td = list.filter(e => e.type === 'route').reduce((n, e) => n + (e.trackDays || 0), 0);
    return Math.max(td, Math.min(14, list.length));
  });
  const avgTrip = tripDays.length ? tripDays.reduce((a, b) => a + b, 0) / tripDays.length : 1;

  // повторные визиты в один и тот же город
  const cityNames = cities.map(e => (e.name || '').trim().toLowerCase()).filter(Boolean);
  const uniqueCities = new Set(cityNames).size;
  const repeatShare = cityNames.length ? 1 - uniqueCities / cityNames.length : 0;

  // ---------- шкалы ----------
  const axes = [
    { id: 'company', left: 'один', right: 'в компании', value: withCompany.length ? 1 - 2 * share(alone, withCompany.length - alone) : 0 },
    { id: 'abroad', left: 'по своей стране', right: 'за границей', value: keyed.length ? 2 * abroad / keyed.length - 1 : 0 },
    { id: 'nature', left: 'города', right: 'природа', value: 2 * share(natureRoutes.length, cities.length) - 1 },
    { id: 'length', left: 'короткие вылазки', right: 'долгие путешествия', value: Math.max(-1, Math.min(1, (avgTrip - 5) / 5)) },
    { id: 'new', left: 'возвращаюсь в любимые места', right: 'всегда новые места', value: Math.max(-1, Math.min(1, 1 - 4 * repeatShare)) },
  ];

  // ---------- образы ----------
  const n = all.length;
  // насыщение x/(x+k): больше — лучше, но без потолка, иначе у опытного
  // путешественника все образы упирались бы в единицу и побеждал первый по списку
  const sat = (x, k) => x > 0 ? x / (x + k) : 0;
  const roadKm = roadtrips.reduce((s, e) => s + (e.distanceKm || 0), 0);
  const companyN = withCompany.length;
  const scores = {
    mountain: sat(mountain.length, 6) * 0.7 + (routes.length ? natureRoutes.length / routes.length : 0) * 0.3,
    runner: sat(runs.length + races * 2, 20) * 0.6 + Math.min(1, sport / n * 3) * 0.4,
    roadtrip: sat(roadtrips.length, 8) * 0.6 + sat(roadKm, 20000) * 0.4,
    collector: sat(countries.size, 30) * 0.6 + Math.min(1, continents.size / 6) * 0.4,
    urban: (cities.length / n) * sat(uniqueCities, 60),
    homeland: (keyed.length ? 1 - abroad / keyed.length : 0) * sat(opts.regionsVisited || 0, 30),
    social: companyN ? (crowd / companyN) * sat(companyN, 15) : 0,
    soloist: companyN ? (alone / companyN) * sat(companyN, 15) : 0,
  };
  const ARCH = {
    mountain: { title: 'Горный странник', text: 'Перевалы, тропы и набор высоты вам милее городских площадей.' },
    runner: { title: 'Бегущий путешественник', text: 'Новые города вы открываете с беговой дорожки — и со стартового створа.' },
    roadtrip: { title: 'Дорожный романтик', text: 'Лучший вид — в лобовом стекле, а маршрут складывается по пути.' },
    collector: { title: 'Коллекционер стран', text: 'Каждая новая граница — ещё одна страница в паспорте.' },
    urban: { title: 'Городской исследователь', text: 'Улицы, кварталы и вокзалы — города вы знаете в лицо.' },
    homeland: { title: 'Первооткрыватель своей страны', text: 'Свою страну вы изучаете вдоль и поперёк, регион за регионом.' },
    social: { title: 'Душа компании', text: 'Путешествие — это прежде всего люди рядом.' },
    soloist: { title: 'Одиночка-первопроходец', text: 'Вам не нужен попутчик, чтобы отправиться в дорогу.' },
  };
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  const main = ranked[0];

  // ---------- факты ----------
  const count = (arr, key) => { const m = new Map(); arr.forEach(e => { const k = key(e); if(k != null && k !== '') m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const seasons = count(all, e => e.season);
  const months = count(all, e => e.month);
  const years = count(all, e => e.year);
  const facts = {
    favoriteSeason: seasons.length ? seasons[0][0] : null,
    favoriteMonth: months.length ? months[0][0] : null,
    busiestYear: years.length ? { year: years[0][0], count: years[0][1] } : null,
    countries: countries.size, continents: continents.size, trips: byTrip.size,
    longestTrip: tripDays.length ? Math.max(...tripDays) : null,
    avgTripDays: Math.round(avgTrip * 10) / 10,
  };

  return { id: main, ...ARCH[main], score: scores[main], tags: ranked.slice(1, 3).filter(k => scores[k] > 0.15).map(k => ({ id: k, title: ARCH[k].title })), axes, facts, scores };
}
