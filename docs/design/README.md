# Design

The source of truth for how Anvil looks. UI work should match this folder; when the design changes, update it here in the same PR.

The values themselves live in the app, so there's one copy: colours, fonts, type sizes, radii and the content container in [`frontend/src/theme.css`](../../frontend/src/theme.css), the logo in [`frontend/src/assets/`](../../frontend/src/assets/) and the favicon in [`frontend/public/`](../../frontend/public/). This page explains what they're for; change a value there, not here.

The UI is built on [shadcn/ui](https://ui.shadcn.com) and Tailwind, dark mode only for now, themed with the **Forge** palette below.

## Logo

| File | Use |
|---|---|
| ![](../../frontend/src/assets/logo.svg) [`logo.svg`](../../frontend/src/assets/logo.svg) | The main mark: an anvil with three sparks. Use it in the app header next to the wordmark. |
| ![](../../frontend/public/favicon.svg) [`favicon.svg`](../../frontend/public/favicon.svg) | The browser tab icon: the same anvil with a single spark. It switches the anvil to iron on light browser themes. |

The sparks are separate elements (`spark-1` to `spark-3`, hottest first) so they can be animated later. Don't merge them into one path.

**Wordmark:** `ANVIL` in heavy Archivo, slightly tracked, in ash, with the mark to its left. The wordmark is the only place Archivo is used.

## Colour

The palette is the shadcn CSS variables in `theme.css`. The named ones:

- **Iron** (`--background`): the page.
- **Ash** (`--foreground`): text.
- **Soot** (`--muted`, `--secondary`): tab list, progress track, avatar.
- **Ember** (`--primary`, `--ring`): the one primary action per screen, and focus rings.

Keep ember for the primary action, focus and the logo's sparks. Don't use it for status.

### Status

Each status is a badge with a coloured dot, and the same colour fills the card's progress bar. The statuses are Draft, In progress and Complete, each with its own dot, badge background, badge border and badge text colour (`--status-*` in `theme.css`).

## Type

- **UI text:** [Geist](https://fonts.google.com/specimen/Geist).
- **Wordmark only:** [Archivo](https://fonts.google.com/specimen/Archivo), weight 900.

The home page's type sizes are the `--text-*` tokens in `theme.css`: page heading, section heading and card title (semibold), body (regular), and caption for captions and badges (medium).

## Shape and spacing

- Radius: largest for cards and the prompt, smaller for buttons and badges, fully round for chips and the avatar (`--radius-card`, `--radius-button` and `--radius-badge` in `theme.css`).
- Content sits in a centred container with side padding (`max-w-content` and `px-gutter`, from `theme.css`).
- Cards are flat: a border, no shadow.

## Wireframes

Screens for the v1 home page (spec #15). The data in them is made up.

| Screen | File |
|---|---|
| Your requirements | ![Home page with requirement cards](wireframes/home-requirements.png) |
| Your requirements, phone width | [home-requirements-mobile.png](wireframes/home-requirements-mobile.png) |
| First visit, no requirements yet | ![Home page on first visit](wireframes/home-first-visit.png) |
| Just after submitting an idea | ![Home page while an idea is being submitted](wireframes/home-idea-submitted.png) |

The cards show question progress ("4 of 7 questions answered") to show where the design is heading. Until questions exist, every card shows an empty bar and "Not started".
