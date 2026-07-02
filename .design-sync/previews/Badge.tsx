import { Badge } from '@workorder/fe';

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Active</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="destructive">Rejected</Badge>
      <Badge variant="outline">Pending QA</Badge>
      <Badge variant="ghost">Archived</Badge>
      <Badge variant="link">View lot</Badge>
    </div>
  );
}
