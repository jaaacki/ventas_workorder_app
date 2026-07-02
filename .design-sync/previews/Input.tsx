import { Input, Label } from '@workorder/fe';

export function Default() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="lot-number">Lot number</Label>
      <Input id="lot-number" placeholder="e.g. LOT-8823" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="operator">Operator</Label>
      <Input id="operator" value="Dana Reyes" disabled />
    </div>
  );
}
