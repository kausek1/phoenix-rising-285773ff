import type React from "react";

export interface ExecDashboardSettings {
  id: string;
  client_id: string;
  portfolio_display_name: string;
  industry_sector: string;
  currency_code: string;
  currency_symbol: string;
  carbon_price_current: number | null;
  carbon_price_target: number | null;
  carbon_price_target_year: number | null;
  carbon_price_source: string | null;
  carbon_exposure_current: number | null;
  carbon_exposure_target: number | null;
  applicable_frameworks: string[] | null;
  primary_framework: string | null;
  emissions_methodology: string | null;
  intensity_benchmark: string | null;
  xmatrix_pdf_url: string | null;
  xmatrix_pdf_uploaded_at: string | null;
  xmatrix_pdf_filename: string | null;
  reporting_reference_date: string | null;
}

export interface ExecDashboardTile {
  id: string;
  client_id: string;
  display_order: number;
  tile_key: string;
  tile_label: string;
  tile_sublabel: string | null;
  metric_categories: string[] | null;
  metric_type: string | null;
  initiative_stages: string[] | null;
  value_aggregation: string;
  display_unit: string | null;
  display_format: string;
  currency_code: string | null;
  icon_name: string;
  accent_color: string;
  navigator_link: string | null;
  navigator_link_label: string | null;
  is_active: boolean;
}

export interface TileComputedValue {
  primary: string;
  sublabel: string;
  accentClass: string;
  statusVariant: "default" | "amber" | "red";
  extraContent?: React.ReactNode;
}

export const ACCENT_MAP: Record<
  string,
  {
    borderLeft: string;
    value: string;
    selectedBg: string;
    selectedBorder: string;
  }
> = {
  emerald: {
    borderLeft: "border-l-emerald-500",
    value: "text-emerald-700",
    selectedBg: "bg-emerald-50/60",
    selectedBorder: "border-emerald-500",
  },
  amber: {
    borderLeft: "border-l-amber-400",
    value: "text-amber-700",
    selectedBg: "bg-amber-50/60",
    selectedBorder: "border-amber-400",
  },
  navy: {
    borderLeft: "border-l-[#1B4F72]",
    value: "text-[#0C447C]",
    selectedBg: "bg-blue-50/60",
    selectedBorder: "border-[#1B4F72]",
  },
  red: {
    borderLeft: "border-l-red-400",
    value: "text-red-700",
    selectedBg: "bg-red-50/60",
    selectedBorder: "border-red-400",
  },
};

export function formatCurrency(value: number, code: string): string {
  const symbol =
    code === "CAD" || code === "USD"
      ? "$"
      : code === "GBP"
        ? "£"
        : code === "EUR"
          ? "€"
          : "";
  if (value >= 1_000_000)
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  return `${symbol}${Math.round(value)}`;
}
