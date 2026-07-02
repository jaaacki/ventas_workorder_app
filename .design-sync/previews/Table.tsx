import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  Badge,
} from '@workorder/fe';

const rows = [
  { id: 'WO-4821', product: 'Sterile mesh, 10x10cm', qty: 60, status: 'In progress' },
  { id: 'WO-4819', product: 'Bone graft, small', qty: 24, status: 'QA hold' },
  { id: 'WO-4812', product: 'Amnion patch, large', qty: 12, status: 'Released' },
];

export function Default() {
  return (
    <Table>
      <TableCaption>Recent work orders</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Work order</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.id}</TableCell>
            <TableCell>{r.product}</TableCell>
            <TableCell>{r.qty}</TableCell>
            <TableCell>
              <Badge variant={r.status === 'QA hold' ? 'destructive' : 'secondary'}>
                {r.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Total units</TableCell>
          <TableCell colSpan={2}>96</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
