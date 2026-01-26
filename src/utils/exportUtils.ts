import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}min`;
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
): void {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const headers = columns 
    ? columns.map(c => c.label) 
    : Object.keys(data[0]);
  
  const keys = columns 
    ? columns.map(c => c.key) 
    : (Object.keys(data[0]) as (keyof T)[]);

  const csvRows: string[] = [];
  
  // Header row
  csvRows.push(headers.map(h => `"${h}"`).join(','));
  
  // Data rows
  for (const row of data) {
    const values = keys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      return String(value);
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface PDFExportOptions<T> {
  data: T[];
  filename: string;
  title: string;
  columns: { key: keyof T; label: string; format?: (value: unknown) => string }[];
  subtitle?: string;
}

export function exportToPDF<T extends Record<string, unknown>>({
  data,
  filename,
  title,
  columns,
  subtitle
}: PDFExportOptions<T>): void {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 138); // Primary blue
  doc.text(title, 14, 22);
  
  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 30);
  }
  
  // Date
  doc.setFontSize(10);
  doc.setTextColor(128);
  const dateStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Gerado em: ${dateStr}`, 14, subtitle ? 38 : 30);

  // Table
  const tableData = data.map(row => 
    columns.map(col => {
      const value = row[col.key];
      if (col.format) return col.format(value);
      if (value === null || value === undefined) return '-';
      return String(value);
    })
  );

  autoTable(doc, {
    head: [columns.map(c => c.label)],
    body: tableData,
    startY: subtitle ? 45 : 38,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  doc.save(`${filename}.pdf`);
}

export function getDateRangePreset(preset: string): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'hoje':
      break;
    case '7dias':
      start.setDate(start.getDate() - 7);
      break;
    case '30dias':
      start.setDate(start.getDate() - 30);
      break;
    case '90dias':
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return { start, end };
}
