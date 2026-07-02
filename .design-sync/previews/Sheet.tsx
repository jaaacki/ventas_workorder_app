import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Label,
  Input,
} from '@workorder/fe';

export function Open() {
  return (
    <Sheet open>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Reassign operator</SheetTitle>
          <SheetDescription>
            Choose who picks up work order #4821.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-1.5 px-4">
          <Label htmlFor="operator-name">Operator</Label>
          <Input id="operator-name" defaultValue="Dana Reyes" />
        </div>
        <SheetFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
