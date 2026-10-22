/* Sample data for demonstration only - NOT live transport information.
   x/y are rough positions in km, used to estimate distance, duration and fare. */
const STATIONS = [
  { name: 'Churchgate', x: 0, y: 0 }, { name: 'CSMT', x: 3, y: 0 }, { name: 'Dadar', x: 6, y: 7 },
  { name: 'Bandra', x: 5, y: 12 }, { name: 'Kurla', x: 12, y: 10 }, { name: 'Ghatkopar', x: 16, y: 12 },
  { name: 'Andheri', x: 9, y: 18 }, { name: 'Thane', x: 22, y: 18 }, { name: 'Borivali', x: 12, y: 30 },
  { name: 'BKC', x: 7, y: 12 }, { name: 'Colaba', x: 1, y: -4 }, { name: 'Juhu', x: 6, y: 20 }, { name: 'Powai', x: 16, y: 17 }, { name: 'Vashi', x: 27, y: 11 }, { name: 'Worli', x: 3, y: 6 }
];
const TYPES = [['all', 'All types'], ['local', 'Local Train'], ['express', 'Express Train'], ['metro', 'Metro'], ['bus', 'Bus'], ['cab', 'Cab'], ['bike', 'Bike Taxi']];
const RAIL = ['Churchgate', 'CSMT', 'Dadar', 'Bandra', 'Kurla', 'Ghatkopar', 'Andheri', 'Thane', 'Borivali']; // places with a railway station
// stops: null = serves every place. seatable: true = reserved seats can be picked.
const MODES = {
  local:   { label: 'Local Train',   icon: '🚆', speed: 40, base: 5,  perKm: 0.8, seatable: false, stops: RAIL, times: ['06:10', '08:25', '11:40', '14:05', '17:30', '20:15'] },
  express: { label: 'Express Train', icon: '🚄', speed: 60, base: 15, perKm: 1.2, seatable: true,  stops: ['Churchgate', 'CSMT', 'Dadar', 'Borivali', 'Thane'], times: ['06:45', '09:10', '12:30', '15:00', '18:20', '21:00'] },
  metro:   { label: 'Metro',         icon: '🚇', speed: 38, base: 10, perKm: 2,   seatable: false, stops: ['Andheri', 'Ghatkopar', 'Borivali', 'Thane'], times: ['06:00', '08:00', '10:30', '13:15', '16:40', '19:30'] },
  bus:     { label: 'Bus',           icon: '🚌', speed: 22, base: 5,  perKm: 1.5, seatable: true,  stops: null, times: ['06:30', '09:00', '12:00', '15:30', '18:00', '21:30'] },
  // On-demand rides: no timetable. Vehicle types and rates are in VEHICLES below.
  bike:    { label: 'Bike Taxi',     icon: '🏍️', ride: true, seatable: false, stops: null, times: [] },
  cab:     { label: 'Cab',           icon: '🚕', ride: true, seatable: false, stops: null, times: [] }
};
// Sample ride vehicles and rates (invented for the demo). Fare = base + perKm * km + perMin * minutes.
const VEHICLES = [
  { key: 'bike',  type: 'bike', prov: 'QuickBike (sample)', label: 'Bike Taxi', cap: 1, base: 15, perKm: 6,  perMin: 0.8, speed: 28 },
  { key: 'mini',  type: 'cab',  prov: 'CityCab (sample)',   label: 'Cab Mini',  cap: 4, base: 40, perKm: 13, perMin: 1.5, speed: 24 },
  { key: 'sedan', type: 'cab',  prov: 'CityCab (sample)',   label: 'Cab Sedan', cap: 4, base: 50, perKm: 16, perMin: 2,   speed: 24 },
  { key: 'suv',   type: 'cab',  prov: 'CityCab (sample)',   label: 'Cab SUV',   cap: 6, base: 70, perKm: 20, perMin: 2.5, speed: 24 }
];
