# Wong’s Nest — brand & design system

Version 2.0 · October 2026

**Promise:** Our family, together. A little place for plans, everyday wins and the memories we make.

Wong’s Nest is personal to the Wong household. It should feel like opening a familiar family scrapbook: warm, gently playful, practical, and easy for both children and parents to use. Keep functional labels clear even when page headings are conversational.

## Identity

Use the original nest emblem in `assets/nest-mark.svg`: a woven nest, three softly coloured eggs, and two sprigs. It represents care and room to grow. `assets/nest-icon.svg` is the square icon master with safe padding for maskable app icons. The wordmark is **Wong’s Nest**; do not abbreviate it to a single letter or use the previous H-shaped mark.

The emblem appears at the family front door, in the desktop sidebar and mobile header, and in browser/installed app icons. The icon background is lavender paper. Keep the symbol’s proportions intact.

## Colour and surfaces

`css/nest.css` owns the current semantic tokens and overrides the original component defaults in `css/styles.css`.

| Token | Light theme | Purpose |
|---|---|---|
| `--bg-body` | `#F8F6F2` | Soft paper canvas |
| `--bg-card` | `#FFFFFF` | Lists, forms, family cards |
| `--primary` | `#665080` | Lavender ink: buttons, selection, focus |
| `--primary-light` / `--nest-lavender` | `#EEE8F6` | Companion moments and selected navigation |
| `--nest-apricot` | `#FAE3D3` | Small wins and things needing a hand |
| `--nest-sage` | `#E5EEDC` | Cooperative family garden |
| `--text-primary` | `#34303D` | Headings and body text |
| `--text-secondary` | `#67616D` | Supporting copy |
| `--border-color` | `#E7E2EA` | Gentle separation |

Dark mode uses plum surfaces, lavender highlights and light paper text. Use semantic tokens for all interactive surfaces. Illustrations may use fixed colours. Body text must meet WCAG AA contrast. Urgent or failed states still need distinct, understandable labels.

## Type, shape and movement

- **Nunito**, weight 800: welcoming headings and the wordmark.
- **DM Sans**, weights 400–700: body copy, buttons, dates and financial details.
- System fallbacks keep the app usable when fonts cannot load.
- Page headings: 34px desktop, 28px phone. Body copy: 13–16px. Metadata: 11–12px.
- White paper cards use 20–26px radii, thin borders and restrained shadows. Controls use 12px radii. Avoid glass effects.
- Use outline SVG icons with rounded strokes for navigation and header controls. Personal avatars and habit choices may use emoji.
- Companion celebrations use a single happy hop after a confirmed save or an explicit hello. Honour `prefers-reduced-motion`. No idle loops, competitive leaderboards or penalties for missed days.

## Layout and access

At 1050px and above, use a permanent family sidebar grouped into Day to day, Make memories, and Parents’ corner. Below that, use five navigation buttons: Home, Plan, Tasks, Nest and More. The complete set of destinations remains available through More; the header drawer provides a second shortcut.

The parent home brings together a daily welcome, real activity counts, a companion/garden, the message-to-plan inbox, children’s plans, and the family overview. The child home focuses on their own plan and encouragement. The complete app retains the same paper surfaces and spacing, including calendars, habits, memories, money, travel and private parent tools.

Only parents see expenses, budgets, recurring costs, cycle tracking or the couple space. Keep the existing server checks authoritative and show the audience clearly on sensitive screens. Changing appearance never grants access or changes data ownership.

## Voice

Use familiar, helpful language. For example: “A message in. A plan out.”, “Little things, done”, “Small steps today. Good things ahead.” Use clear action labels: Add a message, Add event, Save companion, Add expense. Errors explain what happened and how to try again without claiming a failed save succeeded.
