import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function parseCsv(raw) {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const result = [];
    let curr = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          curr += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(curr);
        curr = "";
      } else {
        curr += ch;
      }
    }
    result.push(curr);
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function extractLineValue(md, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`-\\s*${escaped}:\\s*` + "`([^`]*)`", "i");
  const found = md.match(regex);
  return found?.[1] || null;
}

function extractListCount(md, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`-\\s*${escaped}:\\s*` + "`(\\d+)`", "i");
  const found = md.match(regex);
  return found ? Number(found[1]) : null;
}

function loadPayload() {
  const root = path.resolve(process.cwd(), "..");
  const reportsDir = path.join(root, "reports");

  const reportPath = path.join(reportsDir, "gcp_cost_report.md");
  const dayPath = path.join(reportsDir, "cost_by_day.csv");
  const servicePath = path.join(reportsDir, "cost_by_service.csv");
  const skuPath = path.join(reportsDir, "cost_by_sku_top50.csv");

  const md = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf-8") : "";
  const dayCsv = fs.existsSync(dayPath) ? fs.readFileSync(dayPath, "utf-8") : "";
  const serviceCsv = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, "utf-8") : "";
  const skuCsv = fs.existsSync(skuPath) ? fs.readFileSync(skuPath, "utf-8") : "";

  const costByDay = parseCsv(dayCsv);
  const costByService = parseCsv(serviceCsv);
  const costBySku = parseCsv(skuCsv);

  return {
    generatedAt: extractLineValue(md, "Gerado em") || null,
    timezone: extractLineValue(md, "Timezone de exibição") || null,
    billingEnabled: extractLineValue(md, "billingEnabled") || null,
    billingAccountName: extractLineValue(md, "billingAccountName") || null,
    billingExportPresent: extractLineValue(md, "Existe export de Billing no BigQuery") || null,
    billingExportDatasetDetected: extractLineValue(md, "Dataset de export detectado") || null,
    mtd: extractLineValue(md, "Custo MTD líquido (cost + credits)") || null,
    forecast: extractLineValue(md, "Forecast do mês") || null,
    last30d: extractLineValue(md, "Últimos 30 dias (rolling)") || extractLineValue(md, "Últimos 30 dias (rolling) e tendência") || null,
    exportFreshness: extractLineValue(md, "Frescor do export (MAX usage_start_time)") || null,
    inventory: {
      cloudRunServices: extractListCount(md, "Cloud Run services"),
      cloudSchedulerJobs: extractListCount(md, "Cloud Scheduler jobs"),
      bigQueryDatasets: extractListCount(md, "BigQuery datasets"),
      bigQueryTables: extractListCount(md, "BigQuery tables"),
      cloudNats: extractListCount(md, "Cloud NATs detectados"),
      reservedIps: extractListCount(md, "Endereços reservados"),
      vpcConnectors: extractListCount(md, "VPC connectors"),
    },
    costByDay,
    costByService,
    costBySku,
    reportMarkdown: md,
  };
}

function runAuditNow() {
  const root = path.resolve(process.cwd(), "..");
  const script = path.join(root, "tools", "cost_audit.sh");
  const stdout = execFileSync("bash", [script], {
    cwd: root,
    encoding: "utf-8",
    timeout: 240000,
    env: process.env,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return { rawOutput: stdout?.trim() || "" };
  }
}

export async function GET() {
  try {
    return NextResponse.json(loadPayload());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao carregar relatório de custos",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const auditRun = runAuditNow();
    const payload = loadPayload();
    return NextResponse.json({ ...payload, auditRun });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao recalcular auditoria de custos",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}
