import { Tabs, TabsList, TabsTrigger, TabsContent } from '@workorder/fe';

export function Default() {
  return (
    <Tabs defaultValue="active" className="w-80">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
        <TabsTrigger value="qa">QA hold</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="pt-3 text-sm text-muted-foreground">
        3 work orders in progress.
      </TabsContent>
    </Tabs>
  );
}

export function Line() {
  return (
    <Tabs defaultValue="active" className="w-80">
      <TabsList variant="line">
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
        <TabsTrigger value="qa">QA hold</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="pt-3 text-sm text-muted-foreground">
        3 work orders in progress.
      </TabsContent>
    </Tabs>
  );
}
