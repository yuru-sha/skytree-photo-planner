# Calendar planning

The home calendar lets a user browse months, see dates marked with Diamond/Pearl Skytree events, select a date, and inspect event/location details when the API returns data.

## Sub-features

- `calendar-open` open the home page at `/`.
- `calendar-month` move backward or forward one month.
- `calendar-day` select a date and request that day's event list.
- `calendar-details` inspect mapped events and their shooting locations when data exists.

## How to get to it (user POV)

- Choose `ホーム` in the header navigation (route `/`).
- Choose a day in the displayed calendar on `/` to request events for that date.
- Choose `地図検索` from the home page to enter the map-search route; this is a separate map workflow.

## Driving it with Chromium

Preconditions:

- Follow the verification skill's Launch and Doctor sections; use only the current run's Vite instance.
- For month navigation alone, the UI can render without event data. To prove a selected date's results or details, the backend proxy at `http://localhost:3001/api` must be reachable, and API data must include the selected date/location.

- **Open home.** Navigate to `http://127.0.0.1:4173/`. Wait for the heading `日付検索` and the calendar heading matching the regex `/^\d+年\d+月$/` inside the calendar region.
- **Change month.** In the calendar, use the left or right chevron button beside the month heading. Verify the heading changes by one calendar month, including year rollover. The chevrons have no text accessible name in source; inspect the live accessibility tree and scope to the calendar rather than relying on button order.
- **Select date.** Choose a day button from the displayed calendar grid. Verify the selected day gains the `選択中の情報` panel with its selected date. This selection triggers the API day-event request; verify loading settles to either a visible result set or the explicit `検索結果がありません` state. A failed API call is not an empty result.
- **Inspect event.** When the result set has events, verify event count and shooting-location details in the rendered user interface. If the visible event row offers `お気に入り` or `予定に追加`, record that route and resulting state separately; do not treat changing a calendar cell alone as proof of event data.
- **Proof.** Save the before/after month or date action, URL, accessibility snapshot and screenshot under the run's evidence directory. For API-backed results, retain the observed API status/body as network evidence without changing the response.

## Gotchas

- Date selection invokes the API; backend failure can leave a loading state or show an error rather than a legitimate no-events result.
- Calendar day cells are buttons without source-defined `aria-label`s. Locate them from the calendar grid and inspect the live accessible name before acting.
- Adjacent-month days are present in the grid. Confirm the selected date against the `選択中の情報` panel.
- The month arrows are icon-only buttons and lack source-defined accessible names; document the specific live element used.
