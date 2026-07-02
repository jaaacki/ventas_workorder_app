import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@workorder/fe';

export function Open() {
  return (
    <Select open defaultValue="qa">
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Status</SelectLabel>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="qa">QA hold</SelectItem>
          <SelectItem value="released">Released</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
