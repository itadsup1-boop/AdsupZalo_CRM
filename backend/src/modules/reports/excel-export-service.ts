import ExcelJS from 'exceljs';

export function vietnamDate(value: Date | string | null | undefined) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function yyyymmdd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function addSheet(workbook: ExcelJS.Workbook, name: string, columns: Array<{ header: string; key: string; width?: number }>, rows: any[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((column) => ({ width: column.width || Math.max(12, column.header.length + 4), ...column }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FF' } };
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((column) => {
    let max = String(column.header || '').length;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value || '').length);
    });
    column.width = Math.min(Math.max(max + 2, column.width || 12), 60);
  });
  return sheet;
}

export async function excelBuffer(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
