// Точка входа. Порядок важен: сначала Leaflet (он становится глобальным L),
// затем плагин кластеров, который на него опирается, стили и само приложение.
import './vendor/leaflet-global.js';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './styles/app.css';
import 'virtual:app'; // src/app/*.js — по порядку, одним модулем
