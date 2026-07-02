import { Label, Input } from '@workorder/fe';

export function Default() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="quantity">Quantity</Label>
      <Input id="quantity" type="number" defaultValue={24} />
    </div>
  );
}
