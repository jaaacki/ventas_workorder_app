import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Button,
} from '@workorder/fe';

export function Open() {
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Info">
            i
          </Button>
        </TooltipTrigger>
        <TooltipContent>QA hold — bioburden check pending</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
