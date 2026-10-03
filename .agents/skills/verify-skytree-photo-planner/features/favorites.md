# Favorites

Favorites lets a user manage saved shooting locations and events, inspect upcoming or past events, and import or export the saved collection. The collection persists in browser localStorage.

## Sub-features

- `favorites-open` open and inspect upcoming-event, past-event, and saved-location tabs.
- `favorites-import` import a JSON collection using the visible dialog.
- `favorites-export` export the current collection as a JSON download.
- `favorites-remove` remove selected or all favorites through visible controls.
- `favorites-persist` confirm a saved value survives route navigation/reload and confirm UI removal updates storage.

## How to get to it (user POV)

- Choose `お気に入り` in the header navigation (route `/favorites`).
- Add a location from map search with the selected-location `お気に入り` control, then return to the favorites route.
- Add an event from the calendar event detail or map-search results using the displayed `お気に入り` or `予定に追加` control, then return to favorites.

## Driving it with Chromium

Preconditions:

- Follow the verification skill's Launch and Doctor sections.
- Use a fresh, isolated browser origin/context whose `skytree-photo-planner-favorites` key is absent or contains exactly the disposable fixture. Never overwrite a user's existing favorites.
- No backend or seed records are needed for import/export and favorites route interactions.
- Open the managed browser with a confirm-accept policy (`browser.open({ dialogs: "accept" })`) so the `全削除` confirmation dialog is accepted deterministically.

- **Open favorites.** Navigate to `http://127.0.0.1:4173/favorites`. Verify the heading `お気に入り管理`, statistics, and default `今後の撮影イベント` tab.
- **Import fixture.** Choose `インポート`, paste the disposable JSON `{"locations":[{"id":987654321,"name":"Verification Site","latitude":35.68,"longitude":139.76,"addedAt":"2026-10-02T00:00:00.000Z","accessInfo":"Verification only"}],"events":[]}` into the `または直接貼り付け` textarea, then choose the dialog `インポート`. The dialog's `インポート` submit button stays disabled until the textarea has content; pasting enables it. Accept the app's completion alert. This uses the normal visible import form, not an internal setter.
- **Confirm rendered result.** Choose `保存地点`. Verify statistics show `1` saved location, `Verification Site` appears, and its coordinates are visible.
- **Confirm persistence.** Read—not write—the origin's `localStorage['skytree-photo-planner-favorites']`; verify `locations[0].id` is `987654321` and the stored name is `Verification Site`. Reload or navigate away and back, then verify it still renders.
- **Export (separate optional flow).** Choose `エクスポート`, wait for the browser download, and inspect the downloaded JSON's `locations` and `events`. Do not assume a click proves a valid download.
- **Cleanup via 全削除.** In the isolated context, choose `全削除`. The page shows a `confirm` dialog with the message `全てのお気に入りデータを削除します。この操作は取り消せません。本当に削除しますか？`; the open-with-dialogs-accept configuration handles it. Then verify the visible count is zero, the empty-state line `お気に入り地点はありません` renders under the `保存地点` tab, and the key contains empty arrays. Keep the import screenshot, ARIA snapshot, action log, and storage snapshots after removing fixture data.

## Gotchas

- Favorites are scoped to each browser origin; use the same scheme/host/port when confirming persistence.
- The import dialog's completion message is an alert; a success alert alone is insufficient proof. Verify the location in the saved-location tab and in localStorage.
- `全削除` is destructive for all favorites in the current origin. Use a fresh disposable context and verify its initial state before accepting.
- Favorites event data and location data are separate arrays. Check both when proving cleanup.
- The saved-location tab can display asynchronous address lookup for custom negative-ID locations. The imported positive-ID fixture avoids requiring reverse-geocoding for this test.
