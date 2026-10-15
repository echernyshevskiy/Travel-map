// Leaflet и плагин кластеров написаны в расчёте на глобальную переменную L:
// плагин дописывает в неё L.MarkerClusterGroup, а код приложения обращается
// к L напрямую. Поэтому Leaflet подключаем первым и кладём в window.
import L from 'leaflet';
window.L = L;
export default L;
