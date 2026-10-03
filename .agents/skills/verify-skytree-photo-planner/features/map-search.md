# Map search

Map search lets a user choose a shooting location, review its coordinates and relationship to Skytree, choose a scene and date range, and search for possible Diamond/Pearl Skytree events.

## Sub-features

- `map-open` open the map-search route with its default Skytree-centered location.
- `map-select` select a location by clicking or dragging the map marker.
- `map-address` search an address through the visible address field.
- `map-events` run the event search and filter/sort returned results.
- `map-save-location` save the selected custom location as a favorite.

## How to get to it (user POV)

- Choose `地図検索` in the header navigation (route `/map-search`).
- Choose `地図検索` on the home page to open `/map-search`.
- Choose `日付検索` on the map page to return to `/`.

## Driving it with Chromium

Preconditions:

- Follow the verification skill's Launch and Doctor sections. The Vite UI can render alone, but `map-events` needs the API server at `http://localhost:3001` and its data services.
- Map tiles and marker assets load from external hosts. Address lookup calls `nominatim.openstreetmap.org`; elevation uses the Geospatial Information Authority of Japan service. Record external failures as blocked dependencies, not app success.

- **Open map.** Navigate to `http://127.0.0.1:4173/map-search`. Verify heading `地図検索`, the map, location coordinates, and the `住所を入力（例：東京都墨田区押上 1-1-2）` input.
- **Select a point.** Drag the blue location marker or click a point on the visible map. Wait for the displayed latitude/longitude and elevation state to settle; the selected-location panel exposes the `お気に入り` control. This operation may call external elevation and reverse-geocoding endpoints.
- **Address search.** Fill the address input and choose `住所検索`. Verify the visible map center/coordinates and selected-location panel reflect the returned address. This path depends on live Nominatim; capture its network result and do not fabricate a successful result offline.
- **Search events.** Select the available shooting scene and search mode and set the date range using the visible sidebar controls; choose `検索実行`. Verify `検索結果 (...)` and rendered event rows, or the visible no-results state. Confirm the API request succeeded before treating no results as a valid outcome.
- **Filter and sort.** On a non-empty result list, use the visible scene filter (`すべて`, `ダイヤモンドのみ`, `パールのみ`) and ordering (`時間順`, `精度順`). Verify the rendered result count/order changes consistently with the selected control.
- **Save a location.** From the selected-location card choose `お気に入り`; navigate to `お気に入り` → `保存地点` and verify the computed shooting location and coordinates render. Confirm localStorage contains the same location.
- **Proof.** Capture the user action, route, resulting coordinates/address or result list, screenshot/ARIA snapshot, observed network status for each API/external dependency, and the localStorage side effect for the save flow.

## Gotchas

- Opening the page initializes a Leaflet map and requests external tiles and marker assets; a blank tile layer can be an external-network failure while the app shell itself works.
- The starting location is Skytree coordinates, but it is not marked selected until the user clicks/drags the map or completes address search.
- Search results require both a selected location and the backend event-search path; no results from a failed request are not proof of valid empty results.
- Address lookup and elevation/reverse geocoding depend on third-party network services. Do not stub a live path unless testing through a production boundary that already supports it.
- The selected-location card's `お気に入り` updates browser localStorage; route back to `/favorites` and inspect `保存地点` to prove persistence.
