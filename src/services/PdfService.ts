import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

// PDF Configuration Constants
export const PDF_CONFIG = {
  DEFAULT_ORIENTATION: 'p' as 'p' | 'l',
  DEFAULT_UNIT: 'mm' as 'mm' | 'pt' | 'px',
  DEFAULT_FORMAT: 'a4',
  HEADER_COLOR: [30, 64, 175] as [number, number, number],
  HEADER_HEIGHT: 25,
  CONTENT_PADDING: 15,
  COMPACT_PADDING: 8,
  FONT_SIZES: {
    TITLE: 20,
    HEADER: 16,
    SECTION: 14,
    SUBTITLE: 12,
    BODY: 10,
    SMALL: 8
  }
};

// Table Options Presets
export const TABLE_OPTIONS = {
  standard: {
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold' as const,
      halign: 'center' as const,
      fontSize: 10
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3,
      halign: 'left' as const
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: {
      left: PDF_CONFIG.CONTENT_PADDING,
      right: PDF_CONFIG.CONTENT_PADDING,
      top: 2,
      bottom: 2
    },
    tableWidth: 'auto' as const
  },
  compact: {
    headStyles: {
      fillColor: [60, 60, 80],
      textColor: 255,
      fontStyle: 'bold' as const,
      halign: 'center' as const
    },
    bodyStyles: {
      minCellWidth: 8,
      cellPadding: 1.5
    },
    alternateRowStyles: {
      fillColor: [245, 245, 250]
    },
    margin: {
      left: PDF_CONFIG.COMPACT_PADDING,
      right: PDF_CONFIG.COMPACT_PADDING,
      top: 2,
      bottom: 2
    },
    tableWidth: 'auto' as const
  }
};

// HTML2Canvas Options
export const HTML2CANVAS_OPTIONS = {
  standard: {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  },
  highQuality: {
    scale: 2,
    useCORS: true,
    logging: false,
    letterRendering: true,
    allowTaint: true,
    foreignObjectRendering: true,
    svgRendering: true,
    backgroundColor: '#ffffff'
  },
  compact: {
    scale: 1.8,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  }
};

/**
 * Create a new PDF document with standard configuration
 */
export function createPdfDocument(options?: {
  orientation?: 'p' | 'l';
  unit?: 'mm' | 'pt' | 'px';
  format?: string;
}): jsPDF {
  return new jsPDF({
    orientation: options?.orientation || PDF_CONFIG.DEFAULT_ORIENTATION,
    unit: options?.unit || PDF_CONFIG.DEFAULT_UNIT,
    format: options?.format || PDF_CONFIG.DEFAULT_FORMAT,
    putOnlyUsedFonts: true,
    compress: true
  });
}

/**
 * Add a standard page header to PDF
 */
export function addPageHeader(
  pdf: jsPDF,
  title: string,
  subtitle?: string,
  options?: {
    headerColor?: [number, number, number];
    headerHeight?: number;
    padding?: number;
  }
): number {
  const pageWidth = pdf.internal.pageSize.width;
  const headerHeight = options?.headerHeight || PDF_CONFIG.HEADER_HEIGHT;
  const padding = options?.padding || PDF_CONFIG.CONTENT_PADDING;
  const headerColor = options?.headerColor || PDF_CONFIG.HEADER_COLOR;

  // Header background
  pdf.setFillColor(...headerColor);
  pdf.rect(0, 0, pageWidth, headerHeight, 'F');

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255);
  pdf.setFontSize(PDF_CONFIG.FONT_SIZES.HEADER);
  pdf.text(title, padding, 12);

  // Subtitle
  if (subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(PDF_CONFIG.FONT_SIZES.BODY);
    pdf.text(subtitle, padding, 18);
  }

  // Separator line
  pdf.setDrawColor(200, 200, 200);
  pdf.line(padding, headerHeight, pageWidth - padding, headerHeight);

  return headerHeight + 10; // Return yOffset after header
}

/**
 * Add a section title to PDF
 */
export function addSectionTitle(
  pdf: jsPDF,
  yOffset: number,
  title: string,
  fontSize?: number
): number {
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0);
  pdf.setFontSize(fontSize || PDF_CONFIG.FONT_SIZES.SECTION);
  pdf.text(title, PDF_CONFIG.CONTENT_PADDING, yOffset);
  return yOffset + 8;
}

/**
 * Add body text to PDF
 */
export function addBodyText(
  pdf: jsPDF,
  yOffset: number,
  text: string,
  options?: {
    fontSize?: number;
    color?: [number, number, number];
    padding?: number;
    bold?: boolean;
  }
): number {
  const fontSize = options?.fontSize || PDF_CONFIG.FONT_SIZES.BODY;
  const color = options?.color || [0, 0, 0];
  const padding = options?.padding || PDF_CONFIG.CONTENT_PADDING;
  const fontStyle = options?.bold ? 'bold' : 'normal';

  pdf.setFont('helvetica', fontStyle);
  pdf.setFontSize(fontSize);
  pdf.setTextColor(...color);
  pdf.text(text, padding, yOffset);
  return yOffset + fontSize * 0.5;
}

/**
 * Convert HTML element to image and add to PDF
 */
export async function addElementAsImage(
  pdf: jsPDF,
  element: HTMLElement | null,
  x: number,
  y: number,
  options?: {
    width?: number;
    height?: number;
    quality?: 'standard' | 'highQuality' | 'compact';
    maxWidth?: number;
  }
): Promise<{ success: boolean; newY: number }> {
  if (!element) {
    return { success: false, newY: y };
  }

  try {
    const quality = options?.quality || 'standard';
    const canvas = await html2canvas(element, HTML2CANVAS_OPTIONS[quality]);
    const imgData = canvas.toDataURL('image/png');

    const pageWidth = pdf.internal.pageSize.width;
    const maxWidth = options?.maxWidth || (pageWidth - 2 * PDF_CONFIG.CONTENT_PADDING);
    const imgWidth = options?.width || Math.min(maxWidth, canvas.width);
    const imgHeight = options?.height || (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    return { success: true, newY: y + imgHeight };
  } catch (error) {
    console.error('Error converting element to image:', error);
    return { success: false, newY: y };
  }
}

/**
 * Check if page break is needed and add new page if necessary
 */
export function checkPageBreak(
  pdf: jsPDF,
  currentY: number,
  requiredSpace: number,
  onNewPage?: () => void
): number {
  const pageHeight = pdf.internal.pageSize.height;
  if (currentY + requiredSpace > pageHeight - 20) {
    pdf.addPage();
    if (onNewPage) {
      onNewPage();
    }
    return PDF_CONFIG.CONTENT_PADDING;
  }
  return currentY;
}

/**
 * Add footer to PDF page
 */
export function addPageFooter(
  pdf: jsPDF,
  pageNumber: number,
  totalPages: number,
  footerText?: string
): void {
  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(PDF_CONFIG.FONT_SIZES.SMALL);
  pdf.setTextColor(100, 100, 100);
  
  if (footerText) {
    pdf.text(footerText, PDF_CONFIG.CONTENT_PADDING, pageHeight - 10);
  }
  pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 30, pageHeight - 10);
}

/**
 * Format basic parameters for PDF display
 */
export function formatBasicParams(params: any): string[][] {
  const basicParams: string[][] = [
    ['Parameter', 'Value'],
    ['Start Date', params.startDate || 'N/A'],
    ['Months to Hedge', params.monthsToHedge?.toString() || 'N/A'],
    ['Interest Rate', `${params.interestRate || 0}%`]
  ];

  if (params.baseVolume && params.quoteVolume) {
    basicParams.push(
      [`Base Volume (${params.currencyPair?.base || 'BASE'})`, params.baseVolume.toLocaleString()],
      [`Quote Volume (${params.currencyPair?.quote || 'QUOTE'})`, Math.round(params.quoteVolume).toLocaleString()],
      ['Spot Price', params.spotPrice?.toFixed(4) || 'N/A']
    );
  } else {
    basicParams.push(
      ['Total Volume', params.totalVolume?.toLocaleString() || 'N/A'],
      ['Spot Price', params.spotPrice?.toFixed(4) || 'N/A']
    );
  }

  return basicParams;
}

/**
 * Format stress test parameters for PDF display
 */
export function formatStressTestParams(stressTest: any): string[][] {
  if (!stressTest) return [];

  const stressParams: string[][] = [
    ['Parameter', 'Value'],
    ['Scenario Name', stressTest.name || 'Custom Scenario'],
    ['Volatility', `${(stressTest.volatility * 100).toFixed(1)}%`],
    ['Drift', `${(stressTest.drift * 100).toFixed(1)}%`],
    ['Price Shock', `${(stressTest.priceShock * 100).toFixed(1)}%`]
  ];

  if (stressTest.forwardBasis) {
    stressParams.push(['Forward Basis', `${(stressTest.forwardBasis * 100).toFixed(1)}%`]);
  }
  if (stressTest.realBasis) {
    stressParams.push(['Real Basis', `${(stressTest.realBasis * 100).toFixed(2)}%`]);
  }

  return stressParams;
}

/**
 * Calculate volatility from array of values
 */
export function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

