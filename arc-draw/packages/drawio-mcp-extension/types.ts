/**
  EXTENSION-SPECIFIC TYPES
*/

import type {
  DrawioCellOptions,
  DrawioUI,
  DrawIOFunction,
  OptionKey,
} from "drawio-mcp-plugin";

export type { DrawioCellOptions, DrawioUI, DrawIOFunction, OptionKey };

export const bus_request_stream = "BUS_REQUEST";
export const bus_reply_stream = "BUS_REPLY";

export type CurrentDocumentPageInfo = {
  index: number;
  id: string;
  name: string;
  is_current: true;
};

export type ConnectedDocumentInfo = {
  id: string;
  title: string | null;
  mode: string | null;
  hash: string | null;
  file_url: string | null;
  page_count: number;
  current_page: CurrentDocumentPageInfo | null;
};
