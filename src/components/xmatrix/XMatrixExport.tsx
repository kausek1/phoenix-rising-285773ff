import ExcelJS from "exceljs";
import type { XMatrixGoal, XMatrixObjective, XMatrixPriority, XMatrixKPI, XMatrixOwner } from "@/types/database";

export async function exportXMatrix(
  clientName: string,
  goals: XMatrixGoal[],
  objectives: XMatrixObjective[],
  priorities: XMatrixPriority[],
  kpis: XMatrixKPI[],
  owners: XMatrixOwner[],
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PHOENIX";

  const addSheet = (name: string, columns: { header: string; key: string; width: number }[], data: any[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns;
    ws.getRow(1).font = { bold: true, color: { argb: "FF1B4F72" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    data.forEach(r => ws.addRow(r));
    return ws;
  };

  addSheet("Goals", [
    { header: "Title", key: "title", width: 40 },
    { header: "Target Year", key: "target_year", width: 15 },
    { header: "Status", key: "status", width: 15 },
  ], goals);

  addSheet("Objectives", [
    { header: "Title", key: "title", width: 40 },
    { header: "Fiscal Year", key: "fiscal_year", width: 15 },
    { header: "Status", key: "status", width: 15 },
  ], objectives);

  addSheet("Priorities", [
    { header: "Title", key: "title", width: 40 },
    { header: "Owner ID", key: "owner_id", width: 30 },
    { header: "Status", key: "status", width: 15 },
  ], priorities);

  addSheet("KPIs", [
    { header: "Name", key: "name", width: 30 },
    { header: "Unit", key: "unit", width: 15 },
    { header: "Target", key: "target_value", width: 15 },
    { header: "Current", key: "current_value", width: 15 },
  ], kpis);

  addSheet("Owners", [
    { header: "Name", key: "name", width: 30 },
    { header: "Role Title", key: "role_title", width: 30 },
  ], owners);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `PHOENIX_XMatrix_${clientName.replace(/\s+/g, "_")}_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
