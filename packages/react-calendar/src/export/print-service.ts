import type { CalendarEvent } from '../index';
import { eventsToPrintHtml, printDocument, type PrintExportOptions } from './print-export';

/**
 * Print / print-to-PDF helper. Composes a paginated agenda document
 * ({@link eventsToPrintHtml}) and hands it to the browser print dialog
 * ({@link printDocument}). SSR-safe (no-op without a window). Per-call options
 * override the defaults passed at construction:
 *
 * ```ts
 * const printer = new CalPrintService({ title: 'Schedule', hour12: false });
 * printer.print(events);
 * ```
 */
export class CalPrintService {
  constructor(private readonly defaults: PrintExportOptions = {}) {}

  /**
   * Print the given events. Returns `true` if the print dialog was triggered
   * (false under SSR / when a popup could not be opened).
   */
  print(events: readonly CalendarEvent[], options: PrintExportOptions = {}): boolean {
    const html = eventsToPrintHtml(events, { ...this.defaults, ...options });
    return printDocument(html);
  }

  /** Build the printable HTML without opening a dialog (for preview / tests). */
  toHtml(events: readonly CalendarEvent[], options: PrintExportOptions = {}): string {
    return eventsToPrintHtml(events, { ...this.defaults, ...options });
  }
}
