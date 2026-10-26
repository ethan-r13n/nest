import { Button } from '@nest/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@nest/ui/components/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { Columns3 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

const PREFERENCES = new Map<string, TablePreferences>();
const PAGE_SIZES = [10, 25, 50] as const;
const INITIAL_PREFERENCES: TablePreferences = { density: 'comfortable', hidden: [], pageSize: 10 };

type TablePreferences = { density: 'comfortable' | 'compact'; hidden: string[]; pageSize: 10 | 25 | 50 };
type Column<Row> = { id: string; label: string; required?: boolean; numeric?: boolean; cell: (row: Row) => ReactNode };

export function ResearchDataTable<Row>({
  tableKey,
  label,
  rows,
  columns,
  getRowId,
  compact = false,
  controls,
}: {
  tableKey: string;
  label: string;
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
  compact?: boolean;
  controls?: ReactNode;
}) {
  const [preferences, setPreferences] = useState(() => PREFERENCES.get(tableKey) ?? INITIAL_PREFERENCES);
  const [page, setPage] = useState(0);
  useEffect(() => {
    PREFERENCES.set(tableKey, preferences);
  }, [tableKey, preferences]);
  const visibleColumns = columns.filter(
    (column, index) => index === 0 || column.required || !preferences.hidden.includes(column.id),
  );
  const pages = Math.max(1, Math.ceil(rows.length / preferences.pageSize));
  const safePage = Math.min(page, pages - 1);
  const visibleRows = compact
    ? rows
    : rows.slice(safePage * preferences.pageSize, (safePage + 1) * preferences.pageSize);
  return (
    <div className="min-w-0 space-y-3">
      {!compact ? (
        <div className={controls ? 'workspace-panel flex flex-wrap items-end gap-3 p-3' : 'flex justify-end'}>
          {controls}
          <fieldset
            className="ml-auto flex flex-wrap items-center justify-end gap-2"
            aria-label={`${label} display controls`}
          >
            <Select
              value={preferences.density}
              onValueChange={(value) => {
                if (value === 'comfortable' || value === 'compact')
                  setPreferences((previous) => ({ ...previous, density: value }));
              }}
            >
              <SelectTrigger aria-label={`${label} row density`} className="min-h-11">
                <SelectValue>{preferences.density === 'compact' ? 'Compact rows' : 'Comfortable rows'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable rows</SelectItem>
                <SelectItem value="compact">Compact rows</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="min-h-11" />}>
                <Columns3 /> Columns
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{label} columns</DropdownMenuLabel>
                  {columns.map((column, index) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={index === 0 || column.required || !preferences.hidden.includes(column.id)}
                      disabled={index === 0 || column.required}
                      onCheckedChange={(checked) =>
                        setPreferences((previous) => ({
                          ...previous,
                          hidden: checked
                            ? previous.hidden.filter((id) => id !== column.id)
                            : [...previous.hidden, column.id],
                        }))
                      }
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </fieldset>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table
          containerClassName="max-h-[32rem] overflow-auto"
          containerLabel={`${label} observations`}
          className="w-full [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:min-h-11 [&_button]:min-w-11"
        >
          <TableHeader>
            <TableRow>
              {visibleColumns.map((column, index) => (
                <TableHead
                  key={column.id}
                  className={`sticky top-0 z-20 bg-card ${index === 0 ? 'left-0 z-30' : ''} ${column.numeric ? 'text-right' : ''}`}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={getRowId(row)}>
                {visibleColumns.map((column, index) => (
                  <TableCell
                    key={column.id}
                    className={`${index === 0 ? 'sticky left-0 z-10 max-w-[16rem] whitespace-normal break-words bg-card' : ''} ${column.numeric ? 'text-right font-mono tabular-nums' : ''} ${preferences.density === 'compact' ? 'py-1' : 'py-3'}`}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="py-8 text-center text-muted-foreground">
                  No matching observations
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
          <span aria-live="polite">
            {rows.length
              ? `${safePage * preferences.pageSize + 1}–${Math.min((safePage + 1) * preferences.pageSize, rows.length)} of ${rows.length}`
              : 'No matching records'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(preferences.pageSize)}
              onValueChange={(value) => {
                if (value === '10' || value === '25' || value === '50') {
                  const pageSize = value === '10' ? 10 : value === '25' ? 25 : 50;
                  setPreferences((previous) => ({ ...previous, pageSize }));
                  setPage(0);
                }
              }}
            >
              <SelectTrigger aria-label={`${label} rows per page`} className="min-h-11">
                <SelectValue>{preferences.pageSize} per page</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </Button>
            <span>
              {safePage + 1} / {pages}
            </span>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={safePage + 1 >= pages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
