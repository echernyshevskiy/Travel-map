// Испорченные и злонамеренные данные для теста устойчивости: битые даты и
// координаты, мусор в полях, неизвестные типы, повторяющиеся id и внедрённый
// код в каждом текстовом поле. Используется в tests/regress-robust.spec.js.
function brokenData(enc){
  const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
  const T = [[55.75, 37.6], [56.3, 38.1], [57.6, 39.9]];
  const base = { photos: [], status: 'visited', purpose: 'tourism' };
  const entries = [
    // нормальные — чтобы экраны вообще было с чем рисовать
    { ...base, id: 'ok_c', type: 'country', name: 'Грузия', countryKey: 'Georgia', year: 2023, month: 5, trip: 'Норм' },
    { ...base, id: 'ok_t', type: 'city', name: 'Тбилиси', lat: 41.69, lng: 44.8, countryKey: 'Georgia', year: 2023, month: 5, trip: 'Норм' },
    { ...base, id: 'ok_r', type: 'route', name: 'Москва — Ярославль', year: 2024, month: 6, trip: 'Норм', coordsEncoded: enc(T), distanceKm: 260,
      waypointNames: ['Москва', 'Сергиев Посад', 'Ярославль'], waypointCoords: T, waypointCountryKeys: ['Russia', 'Russia', 'Russia'] },
    // даты
    { ...base, id: 'd1', type: 'city', name: 'Даты-1', lat: 50, lng: 30, year: 2020, month: 1, dateFrom: '2020-02-31', dateTo: 'завтра' },
    { ...base, id: 'd2', type: 'city', name: 'Даты-2', lat: 50.1, lng: 30.1, year: 2020, dateFrom: 20200101, dateTo: null },
    { ...base, id: 'd3', type: 'city', name: 'Даты-3', lat: 50.2, lng: 30.2, year: 2020, dateFrom: '2020-05-10', dateTo: '2019-01-01' },
    { ...base, id: 'd4', type: 'city', name: 'Даты-4', lat: 50.3, lng: 30.3, year: '2021', month: '13', dateFrom: '2021-03-01', dateTo: '2021-03-01' },
    // год/месяц мусор
    { ...base, id: 'y1', type: 'city', name: 'Год-мусор', lat: 51, lng: 31, year: 'давно', month: 'май' },
    { ...base, id: 'y2', type: 'country', name: 'Без года', countryKey: 'Armenia', year: null, month: 0 },
    // координаты
    { ...base, id: 'c1', type: 'city', name: 'Без координат', lat: null, lng: null, year: 2019, countryKey: 'Russia' },
    { ...base, id: 'c2', type: 'city', name: 'NaN-город', lat: 'abc', lng: NaN, year: 2019 },
    { ...base, id: 'c3', type: 'city', name: 'За полюсом', lat: 200, lng: -500, year: 2019 },
    { ...base, id: 'c4', type: 'city', name: 'Строки', lat: '55.5', lng: '37.5', year: 2019, countryKey: 'Russia' },
    // маршруты
    { ...base, id: 'r1', type: 'route', name: 'Мусорный трек', year: 2022, coordsEncoded: '%%%не полилиния%%%', distanceKm: 'много' },
    { ...base, id: 'r2', type: 'route', name: 'Пустой трек', year: 2022, coordsEncoded: '', distanceKm: 0 },
    { ...base, id: 'r3', type: 'route', name: 'Разная длина массивов', year: 2022, trip: 'Битая', coordsEncoded: enc(T), distanceKm: 10,
      waypointNames: ['A', 'B', 'C', 'D', 'E'], waypointCoords: [[55, 37], null, ['x', 'y']], waypointCountryKeys: 'Russia' },
    { ...base, id: 'r4', type: 'route', name: 'Точки без трека', year: 2022, trip: 'Битая', waypointNames: ['Казань'], waypointCoords: [[55.79, 49.12]] },
    { ...base, id: 'r5', type: 'route', name: 'Профиль-мусор', year: 2021, trip: 'Битая', coordsEncoded: enc(T), distanceKm: 100, profile: 'высоко', elevationGain: '500', durationMin: -5, trackDays: 'три', segBreaks: [0, -1, 'x'] },
    { ...base, id: 'r6', type: 'route', name: 'Профиль-объекты', year: 2021, coordsEncoded: enc(T), distanceKm: 100, profile: [{ a: 1 }, null, [1]], activity: 'running', durationMin: 0 },
    { ...base, id: 'r7', type: 'route', name: 'Один трек-точка', year: 2021, coordsEncoded: enc([[55, 37]]), distanceKm: 0, waypointNames: [null, ''], waypointCoords: [[55, 37], [55, 37]] },
    // страны
    { ...base, id: 'k1', type: 'country', name: 'Атлантида', countryKey: 'Atlantis', year: 2018 },
    { ...base, id: 'k2', type: 'country', name: 'Без ключа', year: 2018 },
    // внедрение кода в каждое текстовое поле
    { ...base, id: 'x1', type: 'city', name: XSS, lat: 48.85, lng: 2.35, countryKey: 'France', year: 2017, month: 4, trip: XSS, notes: XSS, company: XSS, purpose: XSS, season: XSS,
      instagramUrl: 'javascript:window.__xss=1', mapLinkUrl: 'javascript:window.__xss=1', docLinkUrl: 'data:text/html,' + XSS, photos: ['javascript:window.__xss=1', '"><script>window.__xss=1</script>'] },
    { ...base, id: 'x2', type: 'route', name: XSS, year: 2017, trip: XSS, coordsEncoded: enc(T), distanceKm: 5, waypointNames: [XSS, '"\'><b>', XSS], waypointCoords: T, waypointCountryKeys: ['Russia', XSS, null], activity: XSS },
    { ...base, id: 'x3', type: 'country', name: XSS, countryKey: XSS, year: 2017, color: 'red;background:url(javascript:alert(1))' },
    // странные типы и поля
    { ...base, id: 'w1', type: 'planet', name: 'Марс', year: 2030 },
    { ...base, id: 'w2', type: 'city', name: 'x'.repeat(5000), lat: 40, lng: 40, year: 2016 },
    { ...base, id: 'w3', type: 'city', name: '', lat: 41, lng: 41, year: 2016 },
    { ...base, id: 'w4', type: 'city', name: 12345, lat: 42, lng: 42, year: 2016, photos: 'не массив', tripOrder: 'первый' },
    { ...base, id: 'w5', type: 'city', name: 'Эмодзи 🏔️ и עברית', lat: 43, lng: 43, year: 2016, trip: '🏔️ ‮RTL' },
    { ...base, id: 'w6', type: 'city', name: 'Дубль id', lat: 44, lng: 44, year: 2016 },
    { ...base, id: 'w6', type: 'city', name: 'Дубль id 2', lat: 44.1, lng: 44.1, year: 2016 },
    { ...base, id: 'w7', type: 'city', name: 'Статус-мусор', lat: 45, lng: 45, year: 2016, status: 'maybe', favorite: 'да' },
    null, 'строка вместо записи', 42,
    { ...base, id: 'w8', type: 'city', name: 'Хочу', lat: 46, lng: 46, year: 2099, status: 'wishlist', dateFrom: '2099-01-01' },
  ];
  const tripMeta = {
    [XSS]: { cover: 'javascript:window.__xss=1', description: XSS },
    'Битая': 'не объект',
    '__collection:bad1': { kind: 'collection', name: XSS, items: [{ kind: 'city', name: XSS, lat: 'x', lng: null }, { kind: 'country', key: XSS }, null, 5] },
    '__collection:bad2': { kind: 'collection', name: 'Без items', items: 'нет' },
  };
  const races = [{ id: 'rc1', name: XSS, time: 'быстро', distance: null, date: '2024-13-45', city: XSS }, null, { id: 'rc2', name: 'Будущий', date: '2099-01-01', distance: 'марафон' }];
  return { entries, tripMeta, races, XSS };
}
module.exports = { brokenData };
