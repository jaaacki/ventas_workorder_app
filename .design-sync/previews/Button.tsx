import { Button } from '@workorder/fe';

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Create work order</Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="secondary">Save draft</Button>
      <Button variant="ghost">Skip</Button>
      <Button variant="destructive">Delete lot</Button>
      <Button variant="link">View details</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Add">+</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Processing…</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
