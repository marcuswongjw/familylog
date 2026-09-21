# Hearth Brand Guide & Design System

Version 1.0 — September 2026  
**Descriptor**: *A private digital home for family life*  
**Core Promise**: *Hearth gives each family a calm, private home for the plans, responsibilities, records, and memories they share.*

---

## 1. Brand Foundation

### Purpose
Help families keep the practical details and meaningful moments of life together in one trusted place.

### Positioning
For families managing life across chats, calendars, spreadsheets, notes, and photo libraries, Hearth provides one private home designed around the household rather than a workplace team or public social network.

### Principles
1. **Keep family life together**: Connect related information without forcing every feature into the same workflow.
2. **Make privacy visible**: Show who can see sensitive information and give families understandable controls.
3. **Reduce household friction**: Use clear defaults, reminders, and shared context instead of adding administrative work.
4. **Preserve ordinary moments**: Treat everyday memories with the same care as major milestones.
5. **Design for the whole family**: Support adults and children without making the product feel childish.

### Personality & Tone
| Trait | Meaning | What We Are Not |
|---|---|---|
| **Warm** | Acknowledge people and relationships without sentimentality. | Cute or saccharine |
| **Calm** | Simplify decisions; avoid visual or verbal urgency unless real. | Passive or vague |
| **Dependable** | Explain status, permissions, and consequences clearly. | Cold or institutional |
| **Thoughtful** | Use context and considerate defaults. | Overdesigned |
| **Private** | Make audience and access immediately understandable. | Secretive or alarming |
| **Human** | Write and design for ordinary family routines. | Childish or informal |

---

## 2. Core Visual Identity

### The H-Arch Logo
- **Symbol**: Combines a capital `H` with a rounded lower opening (doorway arch) and a squared upper opening.
- **Rule**: Confirm that every logo instance uses the approved H-Arch rather than an arch-only mark.
- **Lockup**: Horizontal symbol and wordmark lockup (`H Hearth`) for headers, marketing, and wide product surfaces. Standalone symbol for app icon, favicon, compact navigation, and avatars.
- **Clear Space**: Maintain clear space equal to one vertical stem width on all sides.
- **Color Treatments**:
  - Deep Forest (`#1E3F30`) on Warm Cream (`#FDF4E1`) or White (`#FFFFFF`).
  - Warm Cream (`#FDF4E1`) or White (`#FFFFFF`) on Deep Forest (`#1E3F30`).

### Color Palette & Design Tokens

#### Core Palette
| Token | Hex | RGB | Role |
|---|---|---|---|
| `--hearth-deep-forest` | `#1E3F30` | `30, 63, 48` | Primary brand, navigation, buttons, headings, dark surfaces |
| `--hearth-warm-cream` | `#FDF4E1` | `253, 244, 225` | Primary background (canvas) and reverse logo |
| `--hearth-muted-terracotta` | `#BC6B5D` | `188, 107, 93` | Warm accent, highlights, illustration, selected moments |
| `--hearth-warm-charcoal` | `#333333` | `51, 51, 51` | Body text, data, and high-contrast neutral content |

#### Supporting & Module Accents
| Module / Context | Accent Hex | Role & Visual Emphasis |
|---|---|---|
| **Family Week (Calendar)** | `#A9B7A4` (Soft Sage) | Routine, coordination, shared responsibilities |
| **Memories** | `#C99185` (Dusty Rose) | Photography, dates, reflective prompts |
| **Birthdays & Anniversaries** | `#C89B4A` (Warm Ochre) | Celebration without confetti-heavy styling |
| **Travel** | `#6F9893` (Soft Teal) | Movement, maps, and trip planning |
| **Fertility** | `#755766` (Muted Plum) | Discretion, clarity, explicit audience controls |
| **Budgets** | `#1E3F30` (Deep Forest) | Totals, trends, and calm financial clarity |
| **Recurring Expenses** | `#333333` (Warm Charcoal) | Predictability, due dates, and status |

#### Interface Foundation Tokens
- **Canvas**: Warm Cream `#FDF4E1`
- **Surface**: White `#FFFFFF` (cards, sheets, menus, forms)
- **Border**: `1px solid rgba(0, 0, 0, 0.12)`
- **Card Radius**: `16px`
- **Control Radius**: `10px` to `12px` (buttons, inputs, selectors)
- **Focus Ring**: `2px solid #1E3F30` with `2px` offset
- **Motion**: `150ms` to `250ms` quiet transitions (no bouncing, pulsing, or confetti)

---

## 3. Typography & Typesetting

**Primary Family**: **Source Sans 3** (open-source; fallback: `system-ui, sans-serif`).

| Role | Weight | Size | Use |
|---|---|---|---|
| **Display** | 700 | 40 to 56 px | Marketing headlines and major product moments |
| **Page title** | 700 | 28 to 36 px | Product and document titles |
| **Section heading** | 600 | 20 to 24 px | Groups of related content |
| **Body** | 400 | 16 to 18 px | Reading text and interface copy |
| **Label** | 600 | 13 to 14 px | Controls, metadata, compact navigation |
| **Data** | 400 or 600 | 14 to 32 px | Budgets, dates, quantities with tabular figures (`tabular-nums`) |

### Typesetting Rules
- Use **sentence case** for headings, buttons, menus, and labels.
- Keep line length between 45 and 75 characters for sustained reading.
- Use tabular numerals for budgets, totals, and aligned dates (`font-variant-numeric: tabular-nums`).
- Avoid all-caps paragraphs and very light weights.

---

## 4. Iconography & Graphic Language

- **Grid**: 24 by 24 pixels.
- **Stroke**: 2 pixels with rounded joins and caps (`stroke-linecap="round" stroke-linejoin="round"`).
- **Style**: Simple outline icons; filled form only for selected state.
- **Emoji Rule**: **Do not use emoji as permanent product navigation icons.** Reserve emojis only for personal user avatars, child nicknames, or conversational chat content.
- **Shapes**: Softly rounded rectangles (`16px` cards, `10-12px` controls). Consistent radii within component families. Flat colour and subtle borders over heavy drop shadows or glass effects.

---

## 5. Verbal Identity & Copy Standards

- **Voice**: Thoughtful member of the household: direct, considerate, calm, and familiar.
- **Action-led buttons**: *Add expense*, *Save memory*, *Invite member*, *Set budget*.
- **Privacy Statements**: Replace legal or technical shorthand with concrete audience statements:
  - `"Visible to all family members"`
  - `"Visible only to selected adults"`
- **Example Copy**:
  - *Profile selection*: `"Who is using Hearth?"`
  - *Dashboard*: `"Good evening, Marcus. Here is what is coming up."`
  - *Empty budget*: `"No household budget yet. Add one when you are ready."`
  - *Memory prompt*: `"What would you like to remember about today?"`
  - *Save confirmation*: `"Saved to your family memories."`
  - *Recoverable error*: `"We could not save that. Your changes are still here. Try again."`
  - *Destructive action*: `"Delete this memory? It will be removed for everyone who can currently view it."`

---

## 6. Development Governance

All future pull requests, agent tasks, and features **must** comply with this guide:
1. Verify colors use defined Hearth CSS variables (`var(--hearth-...)`).
2. Verify all navigation elements use standard 24px SVG icons, not emojis.
3. Verify typography uses Source Sans 3 and sentence case.
4. Verify accessibility contrast meets WCAG 2.2 AA (minimum 4.5:1 for body copy).
5. Verify sensitive modules clearly display their audience visibility context.
