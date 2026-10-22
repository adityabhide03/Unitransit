# UniTransit (frontend prototype)
Open the `unitransit` folder in VS Code and run `index.html` with the Live Server extension (or double-click it).
Needs internet once for the QR library and font; everything else works offline.

- `css/style.css` - all styling
- `js/data.js` - sample stations and transport modes (edit this to change routes, fares, times)
- `js/app.js` - auth, search, booking, ticket and profile logic (one function per page)

Accounts and bookings are kept in localStorage. Replace the `Auth` object in `app.js` with API calls when you add a backend.

## Cab and Bike Taxi
Rides are on-demand and use `VEHICLES` in `js/data.js` (rates are invented). Fare = base + per-km + per-minute, x1.3 at peak hours (8-11, 17-21). Promo codes (sample): UNI10, WELCOME30. Drivers, vehicle numbers and PINs are fictional and no real ride is booked. SmartRoute can now suggest train/metro + bike taxi for places without a station.
