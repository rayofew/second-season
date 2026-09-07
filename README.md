# Second Season

A private postseason fantasy game for a home league: pick nine players, keep the ones who survive,
and score more for every round you hold them. It recreates the retired NFL.com Playoff Challenge
multiplier format, scored under Eastside FFL rules.

Not for sale, not public, no entry fees, no wagering.

## The game

Nine slots, all of which score. There is no bench.

| QB | RB | RB | WR | WR | TE | FLEX | K | DEF |
|----|----|----|----|----|----|------|---|-----|

FLEX takes a running back, receiver or tight end.

**The multiplier is the game.** A player is worth `1x` in his first round on your roster, `2x` in
his second, `3x` in his third and `4x` in his fourth. Credited points are `raw x multiplier`, so a
player held since Wild Card weekend is worth four of himself by the Super Bowl.

- **Shared pool.** Any number of managers may hold the same player. There is no draft.
- **Swap anyone, any round.** The replacement starts again at `1x`. That reset is the only brake on
  transfers, and it is enough: to justify dropping a living player in round *N* he has to project
  below `1/N` of his replacement, so in practice only the eliminated and the badly injured move.
- **Do nothing and nothing changes.** Rosters carry over, and every streak advances.
- **First-round byes.** A player whose team is resting scores nothing during Wild Card weekend but
  starts his streak anyway, so he returns at `2x`. With only nine scoring slots that is a real price
  for a real edge.
- **Elimination.** A player whose team is out stays on your roster scoring zero until you replace him.
- **The winner** is whoever has the most credited points after the Super Bowl.

## Where the numbers come from

Statistics come from Sleeper, which covers the postseason; fantasy points are computed here from the
league's own scoring rules rather than taken from anyone's platform. Fleaflicker was investigated and
cannot help — its scoring periods stop at week 18, before the postseason begins.

A player whose team did not play has no stat line at all. Elimination and byes therefore need no
scoring code: both are simply an absence.

## Running it

```
npm test        # the engine, against real 2024 postseason stat lines
npm run typecheck
```

Requires Node 22 or newer, which runs TypeScript without a build step.

## The commissioner scripts

Anything under `scripts/` writes to Firestore with the Admin SDK, which bypasses the security
rules completely. It needs a service account key, which is not in this repository and never will
be — the repository is public, and a key committed to a public repository is harvested by bots
within minutes.

Generate one at **Firebase console → Project settings → Service accounts → Generate new private
key**:

  https://console.firebase.google.com/project/second-season-app-2cf68/settings/serviceaccounts/adminsdk

It downloads a JSON file. Keep it outside the repository, then point the scripts at it:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:UsersRaykeyssecond-season-admin.json"
node scripts/score.ts --dry-run
```

That variable lasts as long as the terminal window. To set it once and for all, use
`[Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', '...', 'User')` and open
a new terminal.

GitHub Actions has no filesystem worth writing a key to, so there it goes in the
`FIREBASE_SERVICE_ACCOUNT` secret as the JSON itself. `scripts/admin.ts` accepts either.

A key grants total access to the league's data. If one ever leaks, revoke it in the same console
screen — the old key stops working the moment it is deleted, and generating a replacement takes a
few seconds.
