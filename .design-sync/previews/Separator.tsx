import { Separator } from '@workorder/fe';

export function Default() {
  return (
    <div className="w-80">
      <div className="text-sm">
        <div className="font-medium">Work order #4821</div>
        <div className="text-muted-foreground">Sterile mesh batch, line 2</div>
      </div>
      <Separator className="my-3" />
      <div className="flex h-8 items-center gap-3 text-sm">
        <span>Created</span>
        <Separator orientation="vertical" />
        <span>Assigned</span>
        <Separator orientation="vertical" />
        <span>QA</span>
      </div>
    </div>
  );
}
