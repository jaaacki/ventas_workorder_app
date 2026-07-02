import { Alert, AlertTitle, AlertDescription } from '@workorder/fe';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';

export function Variants() {
  return (
    <div className="flex w-96 flex-col gap-3">
      <Alert variant="default">
        <InfoIcon />
        <AlertTitle>Batch scheduled</AlertTitle>
        <AlertDescription>
          Sterilisation run BET-0294 starts at 6:00 AM tomorrow.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>QA hold required</AlertTitle>
        <AlertDescription>
          Lot 8823 failed bioburden check and cannot ship.
        </AlertDescription>
      </Alert>
    </div>
  );
}
