import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from '@workorder/fe';

export function Default() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Work order #4821</CardTitle>
        <CardDescription>Sterile mesh batch, line 2</CardDescription>
        <CardAction>
          <Badge variant="secondary">In progress</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          42 of 60 units completed. Estimated finish: today, 4:30 PM.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" variant="outline">
          View details
        </Button>
        <Button size="sm">Mark complete</Button>
      </CardFooter>
    </Card>
  );
}
