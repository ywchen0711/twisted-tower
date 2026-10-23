# Twisted Tower 扭曲大樓

A co-op survival game for up to 8 players, inspired by Roblox horror-survival games: go down the tower floor by floor, fix machines with skill checks, dodge the Twisteds, and make it back to the elevator before it leaves. All characters and names are original.

和最多 8 位朋友一起往下闖：修好機器、躲開扭曲怪、在電梯關門前回來。

Play: https://ywchen0711.github.io/twisted-tower/

- **Rooms:** public, private (4-letter code or an invite link `?room=ABCD`), or solo.
- **Networking:** Supabase Realtime (broadcast and presence), with no game server. The player who has been in the room longest runs the Twisteds and machines (`js/host.js`). If they leave, the next player takes over.
- **Toons:** six, each with different stats and an ability. There are six kinds of Twisted. A shop between floors sells items, paid for with ichor.
- **Tests:** `node tools/test.mjs` checks map connectivity and plays whole runs with bots through the host.
