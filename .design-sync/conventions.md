## Setup

No provider or root wrapper is required — this is a plain Tailwind v4 +
CSS-custom-property design system, not a React context/theme-provider
system. Just load `styles.css` (it `@import`s the fonts and the compiled
component CSS); components render correctly with no other setup. Dark mode
is a `.dark` class toggle on an ancestor element (e.g. `<html>` or
`<body>`) — every token below has a light and dark value, so dark mode
needs no separate styling, only that class.

## Styling idiom: Tailwind utility classes + CSS custom-property tokens

Never write raw hex/oklch colors or invent new class names. Every visual
choice is one of two things:

1. **Semantic color tokens**, consumed as Tailwind utilities
   (`bg-<token>`, `text-<token>`, `border-<token>`, `ring-<token>`):
   `primary` / `primary-foreground`, `secondary` / `secondary-foreground`,
   `destructive`, `muted` / `muted-foreground`, `accent` /
   `accent-foreground`, `card` / `card-foreground`, `popover` /
   `popover-foreground`, `background`, `foreground`, `border`, `input`,
   `ring`. Example: a danger button-like surface is `bg-destructive/10
   text-destructive`, never a literal red.
2. **The `variant`/`size` prop pattern** (via `class-variance-authority`)
   on components that have it — `Button`, `Badge`, `Alert`, `Tabs`
   (`TabsList`). Pick the closest existing variant
   (`default | outline | secondary | ghost | destructive | link` for
   Button/Badge) instead of overriding classes to fake a new one.

Layout/spacing glue (gaps, padding, flex/grid) is ordinary Tailwind —
`gap-*`, `p-*`, `flex`, `rounded-lg` (radius is the `--radius` token,
already baked into the utility). Border radius, in particular, should
always come from the existing `rounded-*` utilities, not a custom value.

## Where the truth lives

- `styles.css` — the import entrypoint; its closure is everything a
  rendered design actually receives.
- `_ds_bundle.css` — the compiled component CSS; every token above is a
  `:root`/`.dark` custom property defined here. Grep it before inventing a
  token name.
- `fonts/fonts.css` — `Geist Variable`, the only shipped font family
  (`--font-sans` / `--font-heading`).
- `components/general/<Name>/<Name>.prompt.md` — per-component API notes.

## Example: composed card (real, verified render)

```tsx
import {
  Card, CardHeader, CardTitle, CardDescription, CardAction,
  CardContent, CardFooter, Badge, Button,
} from '@workorder/fe';

<Card className="w-80">
  <CardHeader>
    <CardTitle>Work order #4821</CardTitle>
    <CardDescription>Sterile mesh batch, line 2</CardDescription>
    <CardAction>
      <Badge variant="secondary">In progress</Badge>
    </CardAction>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">
      42 of 60 units completed.
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm" variant="outline">View details</Button>
    <Button size="sm">Mark complete</Button>
  </CardFooter>
</Card>
```

Overlay components (`Dialog`, `Select`, `DropdownMenu`, `Sheet`,
`Tooltip`) are Radix primitives — compose the sub-parts exactly as their
own preview cards show; don't reimplement open/close state, it's handled
by the primitive.
