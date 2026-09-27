# Progressive Coach Hints & Motif-Aware Baits — Plan

## 1. Where things stand today


All in `js/coach-manager.js` unless noted.

| Area | Current behavior | Problem |

|---|---|---|
| Bait announcement (`_generateCoachBubbles`, ~L1790) | Always `"Wait, take a close look at the board! " + pickRandom(challengeBlunderBait)` | Same generic line for every bait, even though `_findInstructiveBlunder` already knows the motif (`type: 'hanging' \| 'fork' \| 'pin' \| 'kingSafety'`). |
| Bait detection (`_findInstructiveBlunder`, ~L1471) | Checks hanging piece, fork, pin, exposed king on PV 2–5 | No skewer, discovered attack, mate threat or trapped piece, even though `SituationRecognizer` already exports `detectSkewer` and `detectDiscoveredAttack`. The challenge object doesn't store the key squares (the attacking piece, the target squares). |
| Hint (`generateHint`, ~L2061) | Stateless. Returns the first match from a fixed chain: pending challenge → SEE-positive capture → takeback suggestion → *any* check → first fork found → cached best move → center move → `legalMoves[0]` | Pressing it again gives the same text. There's no escalation and no per-move count. "Any check" and "first legal move" hints are often wrong or misleading. The challenge hint highlights the **coach's** piece (`pendingChallenge.move.to`), not the piece the player should move. |
| Hint UI (`index.html`, `#btnCoachHint` handler ~L8957) | Writes the text to the bubble, highlights squares for 3s | No hint-level indicator and no arrow. `#arrow-svg` and `drawMoveArrows` already exist for analysis mode and can be reused. |
| Detector outputs (`js/situation-recognizer.js`) | `detectFork` → `{attacker, targets:[names]}`, `detectPin` → `{pinned}` | They return piece **names** only, not **squares**, so the coach can't highlight "the two pieces you're forking". |

## 2. Goals

1. **Motif-specific baits.** When the coach slips up on purpose, the line names the tactic at the right difficulty: *"Can you spot the fork?"*, *"Something's pinned here…"*, *"Oops, is my rook loose?"*
2. **Progressive hint ladder.** Each hint press on the same position reveals one more layer, from the idea, to the piece, to the target, to the full move.

3. **Hint tracking.** Count presses for each player move, store the count on the move record, and use it in feedback, the learner model and the end-of-game summary.
4. **Opportunity nudges.** When the player has a real tactic that the coach did *not* set up, the coach can nudge them before they move, gated by persona.

## 3. Design

### 3.1 A `HintPlan` for each position (the core idea)

Instead of working out a one-shot string, build a **plan** once per player turn and then reveal it step by step.

```js
// Built lazily on first hint press (or pre-computed after the coach moves)
this.hintState = {
  posKey,            // _normalizeFen(fen): the plan is valid only for this position
  level: 0,          // number of hint presses so far on this position

  plan: {
    source: 'challenge' | 'opportunity' | 'suggestion' | 'engine' | 'heuristic',
    motif: 'fork' | 'pin' | 'skewer' | 'discovered' | 'hanging' | 'mateThreat'
         | 'check' | 'trapped' | 'positional',
    move: { from, to, san, uci, piece },   // the answer

    keySquares: { targets: [...], line: [...], weakSquare },  // squares that explain the motif
    followUp: 'Nxe8' | null                 // optional second move of the idea
  }
};
```

**How the answer move is chosen, in priority order:**
1. `pendingChallenge` → `bestSan` / first refutation (this is a bait we set up).
2. `lastSuggestedMove` for this position (after a takeback).
3. Cached engine best move (`_positionEvalCache` → `verifiedBestMove`).
4. If there's no cache: `await _evaluatePosition(fen, 10, 3)` + `_findVerifiedBestMove` (this makes `generateHint` async).
5. Engine unavailable: fall back to today's heuristics (SEE capture → fork scan → center), with `source: 'heuristic'`.

**How the motif is classified:** play the answer move on a temp board and run `detectFork`, `detectPin`, `detectSkewer`, `detectDiscoveredAttack`, `detectHangingPieceBlunder` / SEE capture, check / mate-in-N from eval, then `explainGoodMove` for positional themes. The first detector that fires sets `motif` and `keySquares`. Every material claim stays SEE-verified (AGENTS.md invariant).

This fixes the "any check" and "legalMoves[0]" problems: hints always point toward the *actual* good move.


### 3.2 The hint ladder

| Press | Reveal | Example (fork) | Board highlight |
|---|---|---|---|

| 1 | **Motif + piece.** Names the tactic and highlights the piece that should move. | "There's a fork hiding here. Can you spot it?" | `move.from` |
| 2 | **Targets.** Says what the tactic hits. | "Your knight can hit my king and rook at the same time." | `from` + `keySquares.targets` |
| 3 | **Destination.** | "Look at e7, where the knight attacks both." | `from`, `to` (plus targets) |
| 4 | **Full reveal + why.** Shows the move and the follow-up. | "Nf7+! After my king moves, Nxd8 wins the rook." | arrow `from→to`, persistent until the player moves |

Level 1 highlights the piece right away, as you asked: the first press shows *which piece*, and later presses reveal *why* and *where*. If you'd rather keep the first press text-only, drop the highlight from row 1. It's a one-line change.

Template per motif (in a new `HINT_TEMPLATES` table, one entry per motif × level):

- **fork**: "Can you spot a fork?" → "Your {piece} can attack {t1} and {t2} at once." → "Try {to}." → "{san}! …"
- **pin**: "Can you spot a pin?" → "My {pinned} is stuck in front of my {behind}." → "Put pressure on it from {to}." → …
- **skewer**: "Look for a skewer: line up something valuable." → …
- **discovered**: "What happens if one of your pieces gets out of the way?" → "Your {piece} is blocking your {slider}." → …
- **hanging**: "Is anything of mine unprotected?" → "Count the defenders of my {piece} on {sq}." → …

- **mateThreat / check**: "My king looks a little drafty…" → "Checks first: which ones do you have?" → …
- **positional**: "No tactic here. Improve your worst piece." → "Your {piece} on {from} isn't doing much." → …

Persona tone: reuse the existing `elo <= 900 / >= 2000` branches, moving them into the template table (`beginner | default | master` variants). For `mangoose` (2200), level 1 could skip the highlight to fit its ruthless character.

**Reset rules:** `hintState` resets when the position changes (player move, coach move, takeback, `resetGame`, `setPersona` at move 0). The check is simply `hintState.posKey !== currentPosKey → rebuild`.

**Level cap:** at level 4, further presses repeat level 4 and keep the arrow on.

### 3.3 Hint tracking

- `hintState.level` becomes `hintsUsed` on the **player's** move record in `processPlayerMove`: `record.hintsUsed = (hintState.posKey === posKey) ? hintState.level : 0`.
- Game totals: `this.hintStats = { totalPresses, movesWithHints, fullReveals, challengesSolved: { unaided, withHints, missed } }`.
- **Feedback adapts** (challenge resolution, ~L868):
  - Solved with 0 hints: current `praiseSpotBlunder`.
  - Solved with 1–2 hints: new `voice.praiseWithHint` ("Nice, you got it with a nudge!").
  - Solved after a full reveal: new `voice.praiseAfterReveal` (neutral; no fake praise).
- **Learner model:** a motif that needed at least 3 hints bumps the related `errorProfile` counter (`missedFork`, `tacticalBlunder`, …) by 0.5, so future baits focus on it (`_findInstructiveBlunder` already reads `errorProfile`).
- **Game-over summary** (`_getGameOverMessage`): "You used 7 hints across 4 moves. Forks needed the most help."
- Include `hintsUsed` in the PGN as a comment (`{hints: 2}`) so Analysis Mode can show it later. Optional, for phase 4.


### 3.4 Motif-specific baits ("create a situation")

1. **Store more on the challenge object** in `_findInstructiveBlunder`: `type`, `refutationMove {from,to,san}`, `keySquares` (from detectors extended per §3.5), `followUp` (`line.pv[2]`).
2. **Add motifs:** skewer (`detectSkewer`) and discovered attack (`detectDiscoveredAttack`) on the refutation, plus *mate threat* (`line.mate` from the player's side after the bait). Also rotate motifs so the same type isn't picked twice in a row (`this.lastBaitType`).
3. **New voice table** `voice.baitByMotif[type]` for each of the 4 personas, for example:
   - pikaru fork: "Hmm, my pieces look a bit crowded. Anything jump out at you?"
   - mcmarty hanging: "Oops… did I leave something without a guard? 🙈"
   - sophy pin: "I think one of my pieces can't move freely now. Can you spot the pin?"
   - mangoose skewer: "A line opens. Few players see it."

   Difficulty dial: low-Elo personas **name** the motif ("Can you spot the fork?"), and high-Elo personas only **hint** at it ("Something's off on the long diagonal"). The ladder then provides the rest.
4. `_generateCoachBubbles` picks `baitByMotif[type]` and falls back to the generic `challengeBlunderBait`.

### 3.5 `SituationRecognizer` additions

These are additive only; existing fields stay unchanged so current callers and diagnostics tests don't move.

- `detectFork` → add `targetSquares: [sq1, sq2]`, `attackerSquare`.
- `detectPin` → add `pinnedSquare`, `behindSquare`, `line: [...]`.
- `detectSkewer` → add `frontSquare`, `backSquare`.
- `detectDiscoveredAttack` → add `blockerSquare`, `sliderSquare`, `targetSquare`.
- New helper `classifyTacticalMotif(boardBefore, move)`: runs the detectors in order and returns `{ motif, keySquares, description }`. Both the hint plan and the bait finder use it.

### 3.6 Opportunity nudges (unprompted)

After `computeCoachMove`, if there is **no** pending challenge, run a cheap check in the background: evaluate the player's position (MultiPV 2). If `line1` beats `line2` by at least 150cp **and** `classifyTacticalMotif` finds a tactic, set `this.pendingOpportunity = plan` and add a persona line to bubble 2:

- mcmarty / sophy: always ("Hmm, I have a feeling you have something good here…")
- pikaru: 50% of the time

- mangoose: never (it's your job to notice)

This reuses the same `HintPlan`, so a follow-up hint press starts the ladder with `source: 'opportunity'`. Opportunities the player finds unaided count toward the summary ("You found 3 of 5 tactics on your own").


### 3.7 UI (`index.html`)

- `generateHint()` becomes `async`. The click handler `await`s it, shows a spinner or "Coach is thinking…" while the engine runs, and ignores clicks during that time (debounce).
- Button shows the current level: small dots or a badge `Hint 2/4`. The label changes to "Show answer" at level 3→4.
- Highlights: keep `.highlight-hint` for the piece, and add `.highlight-hint-target` (a different color) for `keySquares.targets`. Level 1–3 highlights **persist until the player moves** instead of the current 3s timeout, since you can't study a fading hint.

- Level 4: draw one arrow on `#arrow-svg` using the existing arrow marker code (factor out a `drawSingleArrow(from, to, cls)` from `drawMoveArrows`). Clear it on the next move.
- The move-list entry for a player move shows a small 💡×N when `hintsUsed > 0`.

## 4. API changes (summary)

```js
// coach-manager.js
async generateHint()          // now async, escalates on each call; returns

  → { hintText, highlightSquares, targetSquares, arrow: {from,to}|null,
      level, maxLevel, motif, source }
getHintState()                // { level, maxLevel, motif } for the button badge
_buildHintPlan(fen)           // async, cached in this.hintState

_renderHintLevel(plan, level) // pure: template + persona → text/squares
_resetHintState()
this.hintState, this.hintStats, this.pendingOpportunity, this.lastBaitType


// situation-recognizer.js
classifyTacticalMotif(boardBefore, move)
// + extra square fields on detectFork/Pin/Skewer/DiscoveredAttack

```

Return shape stays compatible: `hintText` still starts with `"Coach Hint:"` and `highlightSquares` is still an array, so existing test assertions keep passing once they `await`.

## 5. Implementation phases

| Phase | Scope | Files |

|---|---|---|
| **1. Ladder + tracking (engine-free)** | `hintState`, reset rules, `_renderHintLevel`, `HINT_TEMPLATES`. Plan built from challenge / suggestion / cached best / heuristics only. `hintsUsed` on move records, `hintStats`, hint-aware praise. Fix the challenge hint to highlight the player's refuting piece. | coach-manager.js |
| **2. Detector squares + motif classifier** | Extra square fields, `classifyTacticalMotif`, `keySquares` in plan and challenge. | situation-recognizer.js, coach-manager.js |
| **3. Motif baits** | `baitByMotif` voice tables for all 4 personas, skewer / discovered / mate baits, motif rotation. | coach-manager.js |
| **4. Engine-backed plan + opportunity nudges** | async `generateHint`, on-demand eval, `pendingOpportunity`, persona gating. | coach-manager.js, index.html |
| **5. UI polish** | Level badge, target highlight class, persistent highlights, level-4 arrow, 💡×N in move list, summary line. | index.html |

Each phase ships on its own and keeps `node test_browser_modules.js && node test_diagnostics.js` green.

## 6. Tests to add (`test_browser_modules.js`)

1. **Escalation:** fixed fork position (e.g. white knight on c7-fork square available). Calls 1→4 return increasing `level`. Level 1 names "fork" and highlights `from`. Level 2 includes both target squares. Level 4 returns `arrow` equal to the answer move.
2. **Reset:** hint twice, play a move, hint again → `level === 1`. The same after `takeback()`.

3. **Tracking:** hint ×2 then play → player record `hintsUsed === 2`, `hintStats.totalPresses === 2`.
4. **Challenge hint:** with `pendingChallenge`, level-1 highlight is the refuting piece's `from`, **not** the coach's moved square.
5. **Hint-aware praise:** solve a challenge after 2 hints → text comes from `praiseWithHint`.
6. **Bait text:** stub `_findInstructiveBlunder` to return `type: 'pin'` → bubble 2 contains a `baitByMotif.pin` line.
7. **Detector squares:** `detectFork(...).targetSquares` equals the expected pair. Existing diagnostics fixtures are unchanged.
8. **SEE guard:** a capture hint is never produced for an SEE-negative capture (regression for the AGENTS.md invariant).

## 7. Open questions

1. **Level 1 highlight.** Highlight the piece on the first press (as planned), or start text-only and highlight from press 2?
2. **Engine cost.** Is a ~200–500ms on-demand eval on the first hint press acceptable, or should the plan be pre-computed in the background right after each coach move? Pre-computing is smoother but runs an engine search even when the player never asks for a hint.
3. **Opportunity nudges.** Is the per-persona gating above right, or do you want a user setting ("Coach tips: off / on tactics / always")?
4. **Penalty.** Should hints affect anything visible (accuracy score, a "hint-free streak"), or only feedback and the summary?
