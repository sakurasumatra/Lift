# Lift — personal auto-progressing workout tracker

A single-user workout tracker, modeled on Volt's idea: the app prescribes the weight for every set and adjusts it automatically from what I actually lifted. Free to run, no backend, no accounts.

## Stack
- Vite + React + TypeScript
- PWA via `vite-plugin-pwa` (installable, fully offline)
- Storage: IndexedDB via Dexie. No server.
- Charts: Recharts
- Tests: Vitest (the progression engine must be fully unit-tested)
- Deploy: GitHub Pages via a GitHub Actions workflow on push to `main` (set Vite `base` to the repo name)

## Principles
- Mobile-first, one-handed use between sets. Big tap targets, minimal typing.
- The progression engine is pure TypeScript in `src/engine/` with no UI or DB imports, so it can be tested in isolation.
- Every number the app prescribes must be explainable. Store a short `reason` string with each prescription (e.g. "+2.5 kg: all sets at top of range").

## Units and increments
- Units: kg by default, lb as a setting. Weights are stored in the user's current unit. Switching units converts all stored weights and e1RMs, then re-rounds prescriptions.
- Increments per equipment type, configurable in Settings:

| Equipment | kg | lb |
|---|---|---|
| barbell (total load; bar 20 kg / 45 lb) | 2.5 | 5 |
| dumbbell (per dumbbell) | 2 | 5 |
| machine / cable | 2.5 | 5 |
| bodyweight (added load; negative = assistance) | 2.5 | 5 |

- Round prescriptions DOWN to the nearest increment.
- Settings stores the user's **bodyweight**, which bodyweight exercises need (see Progression engine). Ask for it the first time a bodyweight exercise is logged if it isn't set.

## Program (3 days/week, full body)
Rotate A → B → C → A. The next day is the one after the most recently finished session's day, regardless of weekday. Sessions ended early still count.

| Day | Group | Exercise | Type | Sets | Reps | Equipment |
|---|---|---|---|---|---|---|
| A | 1 | Back squat | main | 4 | 4–6 | barbell |
| A | 2 | Bench press | main | 3 | 6–8 | barbell |
| A | 2 | Chest-supported row | accessory | 3 | 8–12 | machine |
| A | 3 | Lying leg curl | accessory | 3 | 10–15 | machine |
| A | 3 | Dumbbell lateral raise | accessory | 3 | 12–15 | dumbbell |
| B | 1 | Bench press | main | 4 | 4–6 | barbell |
| B | 2 | Romanian deadlift | main | 3 | 6–8 | barbell |
| B | 2 | Lat pulldown | accessory | 3 | 8–12 | cable |
| B | 3 | Leg press | accessory | 3 | 10–12 | machine |
| B | 3 | Dumbbell curl | accessory | 3 | 10–15 | dumbbell |
| C | 1 | Deadlift | main | 3 | 3–5 | barbell |
| C | 2 | Overhead press | main | 3 | 6–8 | barbell |
| C | 2 | Pull-up (assisted ok) | accessory | 3 | 6–10 | bodyweight |
| C | 3 | Incline dumbbell press | accessory | 3 | 8–12 | dumbbell |
| C | 4 | Cable pushdown | accessory | 3 | 10–15 | cable |

Exercise names in this table must match the names in the exercise library below exactly.

Bench press appears twice with different rep ranges. Both slots share one e1RM (state is per exercise), but the "last prescribed weight" used for clamping is stored **per program slot**, because the 4–6 slot is always heavier than the 6–8 slot.

The program must be editable in Settings: add, remove, reorder, pair or unpair exercises, and change sets, reps, type and equipment. Seed it with the table above.

### Groups (supersets)
Exercises that share a group number on the same day are a superset: alternate their sets (set 1 of the first exercise, set 1 of the second, set 2 of the first, and so on). A group with one exercise is straight sets. The pairs are non-competing movements, so alternating saves time without hurting performance.
- Within a superset, rest 75 s after the first exercise and the full rest after the second (3:00 if the group contains a main lift, otherwise 1:30).
- If paired exercises have different set counts (including when the return phase removes a set), the extra sets run as straight sets at the end of the group.

## Progression engine

### Logging per set
Weight, reps, and an effort rating on a 6–10 scale (RPE), asked after each set with the prompt "How hard was that set?". Required for main lifts, optional for accessories. Show the five values as large tappable numbers, each with a coloured bar running green (6) → yellow (7) → orange (8) → red-orange (9) → red (10). Show a plain-language label under the selected value:

| RPE | RIR | Label |
|---|---|---|
| 6 | 4 | Could have done 4+ more reps |
| 7 | 3 | Could have done 3 more reps |
| 8 | 2 | Could have done 2 more reps |
| 9 | 1 | Could have done 1 more rep |
| 10 | 0 | Couldn't have done another rep |

Store RPE; the engine works in RIR = 10 − RPE. If RPE is missing (accessories only), assume RIR 1.

### Effective load
- For barbell, dumbbell, machine and cable exercises, effective load = the logged weight.
- For bodyweight exercises, effective load = bodyweight + added load (assistance is negative added load). All e1RM maths uses effective load; prescriptions are converted back to added load for display.

### e1RM (all exercises)
- Set e1RM = `effectiveLoad × (1 + (reps + RIR) / 30)` (Epley with RIR).
- Session e1RM = highest set e1RM among that session's working and calibration sets.
- Smoothed e1RM (stored state): on an exercise's first logged session, smoothed = session e1RM. After that, `new = old + α × (session − old)` with α = 0.35, except α = 0.6 for upward moves during the return phase.
- e1RM is tracked for every exercise, accessories included. It drives charts, predictions and the "getting stronger" card. It only drives the *prescription* for main lifts. Accessory prescriptions use double progression.

### Main lifts — prescriptions
- Next-session prescription for a slot:
  - `targetReps = repMin + 1` (e.g. 5 for 4–6), `targetRIR = 2` (3 during return-phase sessions 1–6)
  - `weight = e1RM / (1 + (targetReps + targetRIR) / 30)`, converted to added load for bodyweight exercises, then rounded down to the increment
  - Clamp the change vs. **this slot's** last prescribed weight to ±2 increments for the Squat and Hinge families and ±1 increment for everything else. Calibration, predicted and deload prescriptions are exempt from the clamp.
- In-session adjustment (a suggestion shown before the next set, which the user can override):
  - If `reps ≥ repMax AND RIR ≥ 2` → next set +1 increment
  - Else if `reps < repMin OR (RIR = 0 AND reps < targetReps)` → next set −1 increment
  - Otherwise keep the weight
- Stall and deload: at session end, before updating the smoothed e1RM, a session is a "miss" if session e1RM < 98% of the *previous* smoothed e1RM. Two consecutive misses → that exercise's next prescription in every slot = 90% of that slot's last working weight (rounded down), reason "Deload"; reset the miss count. The e1RM model then rebuilds the weight from there, within the clamp. Misses and deloads are disabled during the return phase.

### Accessories — double progression
- If every set reached repMax → next session +1 increment.
- If any set fell below repMin in two consecutive sessions → −1 increment.
- Otherwise same weight; the target is to add reps.
- In-session suggestions use the same rules as main lifts; if RPE is missing, only the rep conditions apply.

### Seeding / first session
- Onboarding asks, per exercise, for an optional "weight × reps" the user remembers, plus roughly how long ago it was (under 1 month / 1–3 months / 3–6 months / 6+ months). Seed e1RM = remembered e1RM (assume RIR 1) × detraining factor (1.00 / 0.95 / 0.90 / 0.85). Accessories start at the remembered weight × the same factor, rounded down. For any seeded exercise with a 3+ month gap, the first set of its first session is still a calibration set, prefilled with the seeded weight, so real performance corrects the guess immediately.
- If an exercise has no seed but a family relative has an e1RM → **predicted set** (see below).
- If an exercise has no seed and no related data → **calibration set**: show an explainer card ("Calibration set: enter a weight you can lift for the given number of reps. The app will guide you to the right weight in later sets."). The user enters a weight, logs reps and RPE, and the engine prescribes the next set from that set's e1RM, using the current targetRIR. That session seeds state.

### Return-to-training phase
Enabled when onboarding says the user hasn't trained regularly for 3+ months. **The current user is returning after 6+ months off with about 1 year of prior experience, so the phase is on by default from milestone 2, even before onboarding exists.** It is counted in completed sessions, not calendar weeks, so missed days don't shorten it:
- Sessions 1–6: main lifts use one set fewer than programmed, and targetRIR = 3 (RPE 7) for all main-lift prescriptions and calibration sets.
- Sessions 7–12: full sets, targetRIR = 2 as normal.
- Throughout: upward e1RM smoothing uses α = 0.6; misses and deloads are disabled.
- Show a small "Return phase · session N of 12" banner on Home and Workout. The user can end the phase early in Settings.

### Related movements and predicted sets
Exercises belong to movement families, each with a transfer ratio to the family's anchor. When an exercise has no e1RM of its own but a family member does, use the member with the most recently updated e1RM as the source:
- `predictedE1RM = sourceE1RM × (ratio_target / ratio_source) × 0.95` (a 5% conservative haircut)
- Convert it to a weight with that slot's targetReps and targetRIR (for accessories, targetReps = repMin and targetRIR = 2).
- Mark the prescription as **Predicted** and show an explainer card, e.g. "Predicted set: weight predicted from your e1RM of 85 kg on Back squat, a related movement."
- Once the exercise has its own logged session, its own e1RM takes over.

Exercise library (ratios are starting guesses, editable in Settings; dumbbell ratios are per dumbbell; every program exercise must belong to a family):
- **Horizontal press**: Bench press 1.00 (anchor), Dumbbell bench press 0.40, Incline dumbbell press 0.35, Machine chest press 0.90
- **Squat**: Back squat 1.00 (anchor), Front squat 0.80, Hack squat 1.10, Goblet squat 0.35, Leg press 1.80 (low confidence; machines vary)
- **Hinge**: Deadlift 1.00 (anchor), Trap-bar deadlift 1.05, Romanian deadlift 0.75, Dumbbell RDL 0.30
- **Vertical press**: Overhead press 1.00 (anchor), Seated dumbbell press 0.38, Machine shoulder press 0.90
- **Row**: Chest-supported row 1.00 (anchor), Seated cable row 1.00, Dumbbell row 0.45
- **Vertical pull (cable/machine)**: Lat pulldown 1.00 (anchor), Machine pulldown 1.00
- **Pull-up**: Pull-up 1.00 (anchor), Chin-up 1.05. Uses effective load; no transfer to or from pulldowns.
- **Leg curl**: Lying leg curl 1.00 (anchor), Seated leg curl 1.00
- **Lateral raise**: Dumbbell lateral raise 1.00 (anchor), Cable lateral raise 0.60
- **Curl**: Dumbbell curl 1.00 (anchor), Barbell curl 2.20, Cable curl 2.00
- **Triceps**: Cable pushdown 1.00 (anchor), Overhead cable extension 0.85

### Swapping exercises
On the workout screen, any exercise can be swapped for another in the same family (for example when the bench is taken). Show a swap sheet listing alternatives as cards, with the prescribed weight already computed for each: the exercise's own state if it has one, otherwise a prediction. A swap applies to that session only, unless the user chooses "Make permanent", which edits the program slot. Logs go to the swapped-in exercise's own history.

### "You're getting stronger"
- After each set, compute a provisional smoothed e1RM as if the session ended now.
- The first time in a session that this provisional value exceeds the stored smoothed e1RM by at least one increment, show a brief toast. Show it at most once per exercise per session, and never on an exercise's first-ever session.
- In the session summary, show the final celebration card: the title "You're getting stronger!", the line "New estimated one-rep max: old → new", and a pill showing "+delta ↑".

## Data model (Dexie)
- `exercises`: id, name, type (`main` | `accessory`), equipment, increment, family, familyRatio, notes
- `programDays`: id, label (A/B/C), order, slots[{slotId, exerciseId, group, sets, repMin, repMax}]
- `slotState`: slotId, lastPrescribedWeight, nextWeight, reason, prescriptionKind
- `sessions`: id, dayId, startedAt, finishedAt, endedEarly, swaps[{slotId, fromExerciseId, toExerciseId}]
- `sets`: id, sessionId, slotId, exerciseId, setIndex, weight, reps, rpe?, prescribedWeight, prescriptionKind (`normal` | `calibration` | `predicted` | `deload`), completedAt
- `exerciseState`: exerciseId, e1rm, missCount, accessoryFailCount, predictedFrom?, updatedAt
- `settings`: units, increments, bodyweight, restTimes, keepScreenAwake, timerSound, returnPhase {active, sessionsCompleted}

## Screens
1. **Home**: next day (A/B/C) with the exercise list and prescribed weights, a "Start workout" button, the last-session date, and the return-phase banner when active.
2. **Workout**: a focused, one-set-at-a-time screen. The app walks through the day in order, following group alternation.
   - **Top bar**: a menu (skip exercise, reorder, end early), the title "Workout", and a "Finish" button. Below it, a thin progress bar showing completed sets out of total sets for the session.
   - **Exercise header**: the exercise name; a set indicator such as "SET 1 2 3 4" with the current set highlighted and completed sets marked; and the group label (e.g. "Group 2 · Superset") when paired. Calibration, predicted and deload prescriptions show an accent-coloured badge here; tapping it opens the explainer card.
   - **Exercise image**: a demo illustration for the exercise (see Exercise images). If an image is missing, show a clean placeholder with the movement family name.
   - **Weight × reps tiles**: two large tiles side by side, weight (with unit label) × reps, prefilled with the prescription and target reps. Tapping a tile opens a stepper (weight moves by the exercise's increment, reps by 1), with long-press to type a value. For barbell lifts, a small plate breakdown per side sits under the weight (e.g. "Per side: 20 + 10 + 1.25").
   - **Action row**: "Info" (form cues, current e1RM and the prescription reason), "Replace" (opens the swap sheet), and a prominent "Done" button.
   - **After Done**: the 6–10 effort picker slides up (required for main lifts; skippable for accessories). Then the next set loads, and any in-session weight suggestion appears as a one-line note under the weight tile ("Suggested +2.5 kg — that looked easy"). A "getting stronger" toast appears here when triggered.
   - **Next-up strip**: above the timer, the next exercise's name and prescribed weight. This is especially useful in supersets, where the next exercise is the pair.
   - **Rest timer**: a full-width bar at the bottom counting down, which shrinks as time passes. Tap to add 30 s, swipe to skip. Compute remaining time from a stored end timestamp, never by counting intervals, so the timer is correct whenever the app comes back into view. At zero, play a sound (if enabled) and vibrate where the browser supports it. Web apps can't reliably alert while the phone is locked, and iOS Safari doesn't support vibration, so offer a "Keep screen awake during workouts" setting using the Screen Wake Lock API where supported.
   - Swipe left/right to look at previous or upcoming sets. Editing a completed set re-runs the in-session suggestion.
3. **Session summary**: on finish, list each exercise's next prescribed weight with its `reason`, plus every "You're getting stronger" card.
4. **History**: past sessions list → session detail.
5. **Exercise detail**: e1RM-over-time chart, best sets, current state.
6. **Settings**: units, increments, bodyweight, rest times, timer sound, keep screen awake, return phase, edit program, family ratios, **Export JSON / Import JSON** backup, reset data, About (image attribution and licence).

### Exercise images
Do not use images from Volt or any other commercial app. Use an openly licensed exercise image set: look for one on GitHub, for example a "free exercise database" repo, and confirm its licence permits reuse before bundling. Map our exercise ids to its images and include its attribution and licence in the About screen. If no suitably licensed image exists for an exercise, use the placeholder. Write the Info form cues ourselves: 3–4 short bullet cues per exercise.

### Visual style
Red and white:
- **Layout:** white cards with rounded corners on a light grey page background, dark charcoal text, and heavy, bold headings with large numerals for weights and reps.
- **Accent:** one strong red-orange (around #E8452C) for primary actions and guidance: the Done button, the rest-timer bar, the current-set underline, badges, explainer-card borders and the +delta pill.
- **Secondary buttons** (Info, Replace) are light grey tiles with an icon above the label.
- **Rest-timer bar:** a red-to-orange gradient.
- **Dark mode:** follows the system setting, keeping the same red accent on near-black cards. Use an original app name and mark. Do not copy Volt's or Cortex's name, logo or hexagon icon.

## Testing requirements
Vitest coverage for the engine:
- e1RM maths, including bodyweight effective load with assistance
- rounding in kg and lb
- per-slot clamps, and the clamp exemptions (calibration, predicted, deload)
- in-session suggestions, with and without RPE
- miss detection against the pre-update e1RM, then deload
- accessory up/down rules
- seeding with detraining factors, and calibration
- RPE → RIR conversion
- predictions from a non-anchor source, and swaps
- "getting stronger" (once per exercise per session; never on a first session)
- return phase: reduced sets and RIR 3 in sessions 1–6, fast upward smoothing, deload disabled, ending after 12 sessions
- bench press's two slots producing different weights from one e1RM without fighting the clamp

Include a test that simulates 8 weeks of plausible logs starting from a return phase and asserts weights trend up without non-exempt jumps beyond the clamps.

## Milestones
1. Scaffold, Dexie schema, seeded program and exercise library, progression engine with full tests, and the GitHub Pages deploy workflow
2. Workout screen + session summary, usable at the gym: return phase on by default; calibration or prediction for every exercise
3. Onboarding seeding, history, exercise charts
4. Settings, program editor, export/import
5. PWA polish (offline, icons, home-screen install)

Commit after each milestone with a clear message. Run tests before every commit.
