# Process & Vocabulary Grounding — AmGraft® (AM025)

> Source of truth: **AM025 – AmGraft® Production and Quality Control Workflow** SOP.
> This is the real domain the WorkOrder app must mirror. Use these exact terms, phases,
> step codes, and statuses. Anything that contradicts this doc is wrong.

## The product
- **AmGraft®** — dental bone- & tissue-regeneration graft, product code **AM025** (Granulate form).
- Other product lines are sibling **forms** (Cortico, Block, Membrane, Putty), each its own workflow.
- Final presentation: chips **0.5–1.0 mm**, dispensed **0.255 cc per tray**, 4 trays per outer tray,
  up to 14 strips per EtO carton. Labelled with **REF / LOT / expiry**.

## The batch (the atomic unit of work = one Work Order)
- **1 batch = 450 g of HET (±10%)**. Reagent dosing 300 ml/batch (±5%).
- **Yield ≈ 9.83%** — final product ~**44 g**. Weight is tracked and lost each phase:
  `A1 450 g → A4 155 g → B9 138 g → C 62 g (chips) → F19 44 g`.
- **Track weight + yield on every work order** — it's a first-class production metric, absent from the old UI.

## The 8 phases / 28 steps (real codes — show these, not invented names)
| Phase | Steps | What happens | Location |
|---|---|---|---|
| **A · Material Acquisition** | A1–A5 | Acquire HET → transfer → retrieve → **decoronate** → **split roots** | Prep Room |
| **B · Cleaning & Disinfection** | B6–B11 | Yellow → rinse → Orange → **burr** → clean → **autoclave** (121 °C) | Prep Room |
| **C · Material Processing** | C12 | **Mill & sieve** to 0.5–1.0 mm chips | Cleanroom |
| **D · Cleaning & Disinfection** | D13–D16 | Orange → Type-1 water → Blue → Type-1 water (**ultrasonic**) | Cleanroom |
| **E · Preservation & Stabilisation** | E17–E18 | **Freeze** (−37 °C) → **lyophilise** (freeze-dry) | Cleanroom |
| **F · Packaging** | F19–F22 | **Dispense** 0.255 cc → seal tray → seal outer → send to PLS | Cleanroom → PLS |
| **G · QC & Sterilisation** | G23–G26 | Pack for EtO → **EtO sterilise** → **BET** → pass/fail | PLS · 3rd-party |
| **H · Finalisation** | H27–H28 | Label + verify EtO sticker (brown→green) + box → **release to inventory** | PLS |

- **Pitstops** (`AB01`, `BC01`, `EF01`): explicit **1-working-day holds between phases**. Model as a real WO state ("In pitstop"), not a gap.
- A work order's position is a **step code**, e.g. `B9 · Burring`, `G25 · BET`. (Your original screens already used these — they're real.)

## Reagents are colour-coded (this is why inventory shows colours)
| Reagent | Colour | Used in |
|---|---|---|
| Ethanol 70% | **Green** | HET storage, ethanol jars |
| Sodium hypochlorite 5.25% | **Yellow** | B6 |
| Hydrogen peroxide 3% | **Orange** | B8, D13 |
| Acid 0.6N | **Blue** | D15 |
| Type-1 / Type-2 water | — | rinsing / ultrasonic |

Show the colour chip next to each reagent lot in Inventory and in step instructions.

## The QA gate is long and real
- **G25 BET** (Bacterial Endotoxin Test, LAL) is run by **ALS Singapore** — **7 working days**.
- **G26 result handling** — up to **10 working days**. **EtO sterilisation** is by **Sterilisation Services Singapore (SSS)**.
- So "blocked at gate" is normal for days — the UI must show *waiting on 3rd party* clearly, with expected return, not treat it as an error.
- **BET fail → quarantine the batch** (real term), investigate, corrective action. EtO sticker that stays **brown = unverified → quarantine**.

## Statuses (map backend codes → these)
`Issued` (PET at clinic) · `Collected` · `Received & weighed` · `In storage` (flammable cabinet) ·
`In process` (at a step) · `In pitstop` (inter-phase hold) · `At gate` (EtO/BET) ·
`Quarantined` (BET fail / EtO unverified) · `Released` (H28, to inventory).

## HET collection (the Collections screen)
- HET arrives in a **PET bottle of 70% ethanol** with a **security sticker**; each has a **HET collection lot number**.
- Clinics identified by **name + HCI code** (Ministry of Health) + license number.
- Monthly cadence: call clinics on the **20th**; collect when **ethanol level ≥ 3**; exchange for a fresh PET bottle.
- On receipt: **weigh** (grams), verify lot vs workbook, QA approve, store in **assigned flammable cabinet**.

## Roles (real)
- **Owner** — full access, release authority.
- **Production Manager / Supervisor** — board, assign work, approve steps & pitstops.
- **Quality Assurance (QA)** — QC checkpoints, BET/EtO handling, quarantine, release.
- **Production Operator** — runs assigned steps + the per-step QC checkpoint.
- **Admin** — clinics, couriers, HET collection scheduling.
- (Third parties: courier, **SSS** for EtO, **ALS** for BET.)

## Vocabulary do / don't
| Say (SOP) | Not |
|---|---|
| AmGraft · AM025 · Granulate | "A-Graft", generic "product" |
| Work order at `B9 · Burring` | invented phase names ("Preparation", "Collection") |
| Release to inventory (H28) | "complete" |
| BET / EtO / pitstop / autoclave / lyophilise | generic "processing" |
| Quarantine (BET fail) | "error", "rejected" |
| 0.255 cc/tray · chips 0.5–1.0 mm · 450 g batch | invented sizes ("0.5cc") |

## Where this is reflected in the prototype
`redesign/data.js` now carries the real phases, step codes, reagents, weights, statuses and roles;
the Board, My queue, Collections, Inventory, Release/Quarantine and Workflows screens render them.
