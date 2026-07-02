import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuShortcut,
  Button,
} from '@workorder/fe';

export function Open() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Work order #4821</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          View details
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Reassign operator</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Cancel order</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
