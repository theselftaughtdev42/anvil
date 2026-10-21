import { createCn } from "cn/config"

/**
 * Merges class names, with later Tailwind classes winning. It knows the theme's
 * own type sizes and radii (theme.css), so `text-caption` replaces `text-xs`
 * rather than being taken for a colour, and `rounded-card` replaces
 * `rounded-xl`. Add new --text-* and --radius-* tokens here too.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ["page-heading", "section-heading", "card-title", "body", "body-sm", "caption"],
      radius: ["card", "button", "badge"],
    },
  },
})
