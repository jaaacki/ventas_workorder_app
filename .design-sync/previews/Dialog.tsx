import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@workorder/fe';

export function Open() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release lot 8823?</DialogTitle>
          <DialogDescription>
            This marks the lot as released for shipment. QA holds cannot be
            re-applied afterward.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Release lot</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
