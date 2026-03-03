#!/usr/bin/env python3
import argparse
import calendar
import csv
import datetime as dt
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT_ID_DEFAULT = "botbit-489114"
TIMEZONE_DEFAULT = "America/Cuiaba"
REPORTS_DIR = Path("reports")


@dataclass
class CmdResult:
    returncode: int
    stdout: str
    stderr: str


def run_cmd(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return CmdResult(proc.returncode, proc.stdout.strip(), proc.stderr.strip())


def run_json_cmd(cmd):
    res = run_cmd(cmd)
    if res.returncode != 0:
        return None, res
    raw = res.stdout.strip()
    if not raw:
        return None, res
    try:
        return json.loads(raw), res
    except json.JSONDecodeError:
        return None, res


def ensure_dirs():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, headers, rows):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def to_float(v):
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def fmt_money(v):
    return f"{v:,.2f}"


def detect_billing(project_id):
    set_project = run_cmd(["gcloud", "config", "set", "project", project_id])
    billing_json, billing_res = run_json_cmd([
        "gcloud",
        "beta",
        "billing",
        "projects",
        "describe",
        project_id,
        "--format=json",
    ])

    info = {
        "set_project_ok": set_project.returncode == 0,
        "set_project_stderr": set_project.stderr,
        "billing_raw": billing_json or {},
        "billing_cmd_ok": billing_res.returncode == 0,
        "billing_cmd_stderr": billing_res.stderr,
        "billingEnabled": False,
        "billingAccountName": None,
    }

    if billing_json:
        info["billingEnabled"] = bool(billing_json.get("billingEnabled", False))
        info["billingAccountName"] = billing_json.get("billingAccountName")

    return info


def detect_billing_export(project_id):
    datasets_json, ds_res = run_json_cmd([
        "bq",
        "ls",
        "--project_id",
        project_id,
        "--format=prettyjson",
    ])

    details = {
        "datasets_cmd_ok": ds_res.returncode == 0,
        "datasets_cmd_stderr": ds_res.stderr,
        "datasets": [],
        "tables_checked": [],
        "found": None,
    }

    if not isinstance(datasets_json, list):
        return details

    pattern_v1 = re.compile(r"^gcp_billing_export_v1_.*")
    pattern_rv1 = re.compile(r"^gcp_billing_export_resource_v1_.*")

    for ds in datasets_json:
        ds_id = (
            ds.get("datasetReference", {}).get("datasetId")
            if isinstance(ds, dict)
            else None
        )
        if not ds_id:
            continue
        details["datasets"].append(ds_id)

        tables_json, tb_res = run_json_cmd([
            "bq",
            "ls",
            "--project_id",
            project_id,
            "--dataset_id",
            ds_id,
            "--format=prettyjson",
        ])

        if not isinstance(tables_json, list):
            continue

        for t in tables_json:
            table_id = (
                t.get("tableReference", {}).get("tableId")
                if isinstance(t, dict)
                else None
            )
            if not table_id:
                continue
            details["tables_checked"].append(f"{ds_id}.{table_id}")

            if pattern_rv1.match(table_id):
                details["found"] = {
                    "dataset": ds_id,
                    "table": table_id,
                    "type": "resource_v1",
                }
                return details
            if pattern_v1.match(table_id) and not details.get("found"):
                details["found"] = {
                    "dataset": ds_id,
                    "table": table_id,
                    "type": "v1",
                }

    return details


def bq_query_json(sql):
    cmd = [
        "bq",
        "query",
        "--nouse_legacy_sql",
        "--format=prettyjson",
        sql,
    ]
    return run_json_cmd(cmd)


def query_real_cost(project_id, dataset, table):
    full_table = f"`{project_id}.{dataset}.{table}`"

    sql_day = f'''
    SELECT
      DATE(usage_start_time) AS day,
      SUM(cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost
    FROM {full_table}
    WHERE project.id = "{project_id}"
      AND DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 45 DAY)
    GROUP BY day
    ORDER BY day
    '''

    sql_service = f'''
    SELECT
      service.description AS service,
      SUM(IF(
        DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH),
        cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0),
        0
      )) AS net_cost_mtd,
      SUM(IF(
        DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY),
        cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0),
        0
      )) AS net_cost_30d
    FROM {full_table}
    WHERE project.id = "{project_id}"
      AND DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 45 DAY)
    GROUP BY service
    HAVING net_cost_mtd != 0 OR net_cost_30d != 0
    ORDER BY net_cost_mtd DESC
    '''

    sql_sku = f'''
    SELECT
      service.description AS service,
      sku.description AS sku,
      SUM(cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost_mtd
    FROM {full_table}
    WHERE project.id = "{project_id}"
      AND DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    GROUP BY service, sku
    HAVING net_cost_mtd != 0
    ORDER BY net_cost_mtd DESC
    LIMIT 50
    '''

    sql_fresh = f'''
    SELECT MAX(usage_start_time) AS latest_usage_start_time
    FROM {full_table}
    WHERE project.id = "{project_id}"
    '''

    sql_mtd = f'''
    SELECT
      SUM(cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost_mtd,
      ANY_VALUE(currency) AS currency
    FROM {full_table}
    WHERE project.id = "{project_id}"
      AND DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    '''

    sql_30d = f'''
    SELECT
      SUM(cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost_30d
    FROM {full_table}
    WHERE project.id = "{project_id}"
      AND DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    '''

    day_rows, day_res = bq_query_json(sql_day)
    svc_rows, svc_res = bq_query_json(sql_service)
    sku_rows, sku_res = bq_query_json(sql_sku)
    fresh_rows, fresh_res = bq_query_json(sql_fresh)
    mtd_rows, mtd_res = bq_query_json(sql_mtd)
    d30_rows, d30_res = bq_query_json(sql_30d)

    ok = all(
        r.returncode == 0
        for r in [day_res, svc_res, sku_res, fresh_res, mtd_res, d30_res]
    )

    if not ok:
        errors = {
            "day": day_res.stderr,
            "service": svc_res.stderr,
            "sku": sku_res.stderr,
            "fresh": fresh_res.stderr,
            "mtd": mtd_res.stderr,
            "d30": d30_res.stderr,
        }
        return {"ok": False, "errors": errors}

    day_rows = day_rows or []
    svc_rows = svc_rows or []
    sku_rows = sku_rows or []
    fresh_rows = fresh_rows or []
    mtd_rows = mtd_rows or []
    d30_rows = d30_rows or []

    mtd = to_float(mtd_rows[0].get("net_cost_mtd") if mtd_rows else 0)
    currency = (mtd_rows[0].get("currency") if mtd_rows else None) or "N/A"
    c30 = to_float(d30_rows[0].get("net_cost_30d") if d30_rows else 0)
    latest = fresh_rows[0].get("latest_usage_start_time") if fresh_rows else None

    return {
        "ok": True,
        "day_rows": day_rows,
        "service_rows": svc_rows,
        "sku_rows": sku_rows,
        "net_cost_mtd": mtd,
        "net_cost_30d": c30,
        "currency": currency,
        "latest_usage_start_time": latest,
    }


def detect_proxy_inventory(project_id):
    proxy = {
        "cloud_run_services": [],
        "cloud_run_summary": [],
        "scheduler_jobs": [],
        "bq_datasets": [],
        "bq_tables": [],
        "nat": [],
        "addresses": [],
        "vpc_connectors": [],
        "metrics": {},
        "errors": {},
    }

    run_svc, res = run_json_cmd([
        "gcloud",
        "run",
        "services",
        "list",
        "--project",
        project_id,
        "--format=json",
    ])
    if res.returncode == 0 and isinstance(run_svc, list):
        proxy["cloud_run_services"] = run_svc
        for svc in run_svc:
            metadata = svc.get("metadata", {}) if isinstance(svc, dict) else {}
            spec = svc.get("spec", {}) if isinstance(svc, dict) else {}
            template = spec.get("template", {}) if isinstance(spec, dict) else {}
            tmpl_meta = template.get("metadata", {}) if isinstance(template, dict) else {}
            annotations = tmpl_meta.get("annotations", {}) if isinstance(tmpl_meta, dict) else {}
            containers = template.get("spec", {}).get("containers", []) if isinstance(template, dict) else []
            first_container = containers[0] if containers else {}
            resources = first_container.get("resources", {}) if isinstance(first_container, dict) else {}
            limits = resources.get("limits", {}) if isinstance(resources, dict) else {}

            proxy["cloud_run_summary"].append({
                "name": metadata.get("name"),
                "region": metadata.get("labels", {}).get("cloud.googleapis.com/location"),
                "ingress": metadata.get("annotations", {}).get("run.googleapis.com/ingress"),
                "min_instances": annotations.get("autoscaling.knative.dev/minScale"),
                "max_instances": annotations.get("autoscaling.knative.dev/maxScale"),
                "cpu": limits.get("cpu"),
                "memory": limits.get("memory"),
                "concurrency": template.get("spec", {}).get("containerConcurrency") if isinstance(template.get("spec", {}), dict) else None,
                "timeout": template.get("spec", {}).get("timeoutSeconds") if isinstance(template.get("spec", {}), dict) else None,
            })
    else:
        proxy["errors"]["cloud_run_services"] = res.stderr

    loc_res = run_cmd([
        "gcloud",
        "scheduler",
        "locations",
        "list",
        "--project",
        project_id,
        "--format=value(locationId)",
    ])
    if loc_res.returncode == 0:
        locations = [line.strip() for line in loc_res.stdout.splitlines() if line.strip()]
        all_jobs = []
        for loc in locations:
            sched, sres = run_json_cmd([
                "gcloud",
                "scheduler",
                "jobs",
                "list",
                "--project",
                project_id,
                "--location",
                loc,
                "--format=json",
            ])
            if isinstance(sched, list):
                all_jobs.extend(sched)
        proxy["scheduler_jobs"] = all_jobs
    else:
        proxy["errors"]["scheduler_jobs"] = loc_res.stderr

    datasets, res = run_json_cmd([
        "bq",
        "ls",
        "--project_id",
        project_id,
        "--format=prettyjson",
    ])
    if isinstance(datasets, list):
        proxy["bq_datasets"] = [
            d.get("datasetReference", {}).get("datasetId")
            for d in datasets
            if isinstance(d, dict)
        ]
        for ds in proxy["bq_datasets"]:
            if not ds:
                continue
            tables, tres = run_json_cmd([
                "bq",
                "ls",
                "--project_id",
                project_id,
                "--dataset_id",
                ds,
                "--format=prettyjson",
            ])
            if isinstance(tables, list):
                for t in tables:
                    tb_id = t.get("tableReference", {}).get("tableId") if isinstance(t, dict) else None
                    if tb_id:
                        proxy["bq_tables"].append(f"{ds}.{tb_id}")
    else:
        proxy["errors"]["bq_inventory"] = res.stderr

    routers, res = run_json_cmd([
        "gcloud",
        "compute",
        "routers",
        "list",
        "--project",
        project_id,
        "--format=json",
    ])
    if isinstance(routers, list):
        for r in routers:
            name = r.get("name")
            region = r.get("region", "").split("/")[-1]
            if not name or not region:
                continue
            nat, nres = run_json_cmd([
                "gcloud",
                "compute",
                "routers",
                "nats",
                "list",
                "--project",
                project_id,
                "--router",
                name,
                "--region",
                region,
                "--format=json",
            ])
            if isinstance(nat, list):
                for n in nat:
                    proxy["nat"].append({"router": name, "region": region, "nat": n.get("name")})
    else:
        proxy["errors"]["nat"] = res.stderr

    addrs, res = run_json_cmd([
        "gcloud",
        "compute",
        "addresses",
        "list",
        "--project",
        project_id,
        "--format=json",
    ])
    if isinstance(addrs, list):
        proxy["addresses"] = addrs
    else:
        proxy["errors"]["addresses"] = res.stderr

    reg_res = run_cmd([
        "gcloud",
        "compute",
        "regions",
        "list",
        "--project",
        project_id,
        "--format=value(name)",
    ])
    if reg_res.returncode == 0:
        regions = [line.strip() for line in reg_res.stdout.splitlines() if line.strip()]
        all_connectors = []
        for region in regions:
            connectors, cres = run_json_cmd([
                "gcloud",
                "compute",
                "networks",
                "vpc-access",
                "connectors",
                "list",
                "--project",
                project_id,
                "--region",
                region,
                "--format=json",
            ])
            if isinstance(connectors, list):
                all_connectors.extend(connectors)
        proxy["vpc_connectors"] = all_connectors
    else:
        proxy["errors"]["vpc_connectors"] = reg_res.stderr

    end = dt.datetime.now(tz=dt.timezone.utc)
    start = end - dt.timedelta(days=30)
    interval = f"start={start.isoformat()},end={end.isoformat()}"

    metric_defs = {
        "cloud_run_requests": "run.googleapis.com/request_count",
        "cloud_run_container_instances": "run.googleapis.com/container/instance_count",
        "cloud_run_container_cpu": "run.googleapis.com/container/cpu/utilizations",
        "cloud_run_container_memory": "run.googleapis.com/container/memory/utilizations",
        "firestore_reads": "firestore.googleapis.com/document/read_count",
        "firestore_writes": "firestore.googleapis.com/document/write_count",
        "firestore_deletes": "firestore.googleapis.com/document/delete_count",
    }

    for key, metric in metric_defs.items():
        rows, mres = run_json_cmd([
            "gcloud",
            "monitoring",
            "time-series",
            "list",
            "--project",
            project_id,
            "--filter",
            f'metric.type="{metric}"',
            "--interval",
            interval,
            "--format=json",
            "--limit",
            "200",
        ])
        if mres.returncode == 0 and isinstance(rows, list):
            total = 0.0
            points = 0
            for ts in rows:
                for p in ts.get("points", []):
                    val = p.get("value", {})
                    if "doubleValue" in val:
                        total += to_float(val.get("doubleValue"))
                        points += 1
                    elif "int64Value" in val:
                        total += to_float(val.get("int64Value"))
                        points += 1
            proxy["metrics"][key] = {"metric": metric, "total_30d": total, "points": points}
        else:
            proxy["metrics"][key] = {"metric": metric, "total_30d": None, "points": 0, "error": mres.stderr}

    return proxy


def compute_trend(day_rows):
    if not day_rows:
        return {"avg_7d": 0.0, "avg_30d": 0.0, "trend": "n/a"}

    series = [(r.get("day"), to_float(r.get("net_cost"))) for r in day_rows]
    vals = [v for _, v in series]

    last7 = vals[-7:] if len(vals) >= 7 else vals
    last30 = vals[-30:] if len(vals) >= 30 else vals

    avg7 = sum(last7) / len(last7) if last7 else 0.0
    avg30 = sum(last30) / len(last30) if last30 else 0.0

    prev7 = vals[-14:-7] if len(vals) >= 14 else []
    prev7_avg = sum(prev7) / len(prev7) if prev7 else avg7

    if prev7_avg == 0:
        trend = "estável"
    else:
        delta = (avg7 - prev7_avg) / prev7_avg
        if delta > 0.15:
            trend = "alta"
        elif delta < -0.15:
            trend = "queda"
        else:
            trend = "estável"

    return {"avg_7d": avg7, "avg_30d": avg30, "trend": trend}


def month_stats(tz_name):
    tz = ZoneInfo(tz_name)
    now_utc = dt.datetime.now(dt.timezone.utc)
    local_now = now_utc.astimezone(tz)
    year = now_utc.year
    month = now_utc.month
    days_in_month = calendar.monthrange(year, month)[1]
    days_elapsed = now_utc.day
    return {
        "now_utc": now_utc,
        "local_now": local_now,
        "days_in_month": days_in_month,
        "days_elapsed": days_elapsed,
    }


def risk_breakdown_from_sku(sku_rows):
    categories = {
        "network_nat_egress": ["nat", "egress", "network", "serverless vpc access"],
        "cloud_run": ["cloud run", "cpu", "memory", "request"],
        "firestore": ["firestore", "document read", "document write", "document delete"],
        "bigquery": ["bigquery", "analysis", "bytes processed", "storage"],
        "artifact_storage": ["artifact registry", "storage", "download", "network egress"],
    }

    out = {k: 0.0 for k in categories}

    for r in sku_rows:
        text = f"{r.get('service', '')} {r.get('sku', '')}".lower()
        val = to_float(r.get("net_cost_mtd"))
        for k, words in categories.items():
            if any(w in text for w in words):
                out[k] += val

    return out


def md_table(headers, rows):
    if not rows:
        return "_Sem dados._"
    sep = "|".join(["---"] * len(headers))
    out = ["| " + " | ".join(headers) + " |", "| " + sep + " |"]
    for row in rows:
        out.append("| " + " | ".join(str(x) for x in row) + " |")
    return "\n".join(out)


def build_report(project_id, tz_name, billing_info, export_info, result):
    ms = month_stats(tz_name)
    now_local = ms["local_now"].strftime("%Y-%m-%d %H:%M:%S %Z")

    lines = []
    lines.append("# GCP Cost Audit - botbit-489114")
    lines.append("")
    lines.append(f"- Projeto: `{project_id}`")
    lines.append(f"- Gerado em: `{now_local}`")
    lines.append(f"- Timezone de exibição: `{tz_name}`")
    lines.append("")

    lines.append("## 1) Status do Billing")
    lines.append(f"- billingEnabled: `{billing_info.get('billingEnabled')}`")
    lines.append(f"- billingAccountName: `{billing_info.get('billingAccountName')}`")
    lines.append("")

    if not billing_info.get("billingEnabled"):
        lines.append("> Billing não está vinculado/ativo para este projeto. É necessário vincular uma Billing Account para auditar custos reais.")
        return "\n".join(lines)

    found = export_info.get("found") if export_info else None
    datasets_detected = export_info.get("datasets", []) if export_info else []
    export_dataset_candidates = [d for d in datasets_detected if "billing_export" in (d or "")]
    lines.append("## 2) Billing Export no BigQuery")
    if found:
        lines.append("- Existe export de Billing no BigQuery: `sim`")
        lines.append(f"- Dataset: `{found.get('dataset')}`")
        lines.append(f"- Tabela: `{found.get('table')}`")
        lines.append(f"- Tipo: `{found.get('type')}`")
    else:
        lines.append("- Existe export de Billing no BigQuery: `não`")
        if export_dataset_candidates:
            lines.append(f"- Dataset de export detectado: `{', '.join(export_dataset_candidates)}`")
            lines.append("- Status provável: `configurado, aguardando criação/população da tabela de export`.")
            lines.append("- Próximos passos:")
            lines.append("  1. Aguardar ingestão inicial (pode levar algumas horas, em alguns casos até ~24h).")
            lines.append("  2. Reexecutar a auditoria periodicamente para detectar tabela `gcp_billing_export_*`.")
            lines.append("  3. Após a primeira carga, MTD/forecast passam automaticamente para custo real.")
        else:
            lines.append("- Billing export ausente. Para habilitar:")
            lines.append("  1. Criar dataset `billing_export` no BigQuery.")
            lines.append("  2. No Console de Billing, habilitar `Billing export to BigQuery (Detailed usage cost)`.")
            lines.append("  3. Aguardar ingestão (normalmente algumas horas) e reexecutar a auditoria.")
    lines.append("")

    if result.get("mode") == "real":
        currency = result.get("currency", "N/A")
        mtd = result.get("net_cost_mtd", 0.0)
        c30 = result.get("net_cost_30d", 0.0)
        days_elapsed = ms["days_elapsed"]
        days_in_month = ms["days_in_month"]
        forecast = (mtd / days_elapsed * days_in_month) if days_elapsed > 0 else 0.0
        trend = result.get("trend", {})
        result["forecast"] = forecast

        lines.append("## 3) Resumo financeiro")
        lines.append(f"- Moeda: `{currency}`")
        lines.append(f"- Custo MTD líquido (cost + credits): `{fmt_money(mtd)} {currency}`")
        lines.append(f"- Forecast do mês (MTD / dias decorridos * dias do mês): `{fmt_money(forecast)} {currency}`")
        lines.append(f"- Últimos 30 dias (rolling): `{fmt_money(c30)} {currency}`")
        lines.append(
            f"- Run-rate diário: 7d=`{fmt_money(trend.get('avg_7d', 0.0))} {currency}` | 30d=`{fmt_money(trend.get('avg_30d', 0.0))} {currency}` | tendência=`{trend.get('trend', 'n/a')}`"
        )
        lines.append(f"- Frescor do export (MAX usage_start_time): `{result.get('latest_usage_start_time')}`")
        lines.append("")

        service_rows = result.get("service_rows", [])
        total_mtd = sum(to_float(r.get("net_cost_mtd")) for r in service_rows) or 1.0
        top10 = sorted(service_rows, key=lambda x: to_float(x.get("net_cost_mtd")), reverse=True)[:10]
        top10_table = []
        for r in top10:
            v = to_float(r.get("net_cost_mtd"))
            top10_table.append([
                r.get("service", "N/A"),
                f"{fmt_money(v)} {currency}",
                f"{(v / total_mtd * 100):.1f}%",
                f"{fmt_money(to_float(r.get('net_cost_30d')))} {currency}",
            ])

        lines.append("## 4) Top 10 serviços por custo (MTD)")
        lines.append(md_table(["Serviço", "Custo MTD", "% MTD", "Custo 30d"], top10_table))
        lines.append("")

        risks = risk_breakdown_from_sku(result.get("sku_rows", []))
        lines.append("## 5) Itens de risco")
        lines.append(md_table(
            ["Categoria", "Custo MTD", "Custo 30d", "Risco"],
            [
                ["NAT/Egress/Network/VPC Access", f"{fmt_money(risks['network_nat_egress'])} {currency}", f"{fmt_money(c30)} {currency}", "Pode crescer com tráfego externo, integração Binance e transferências inter-região."],
                ["Cloud Run (request/vCPU/RAM)", f"{fmt_money(risks['cloud_run'])} {currency}", f"{fmt_money(c30)} {currency}", "Escala com picos de requests, concorrência baixa e tempo de CPU/memória."],
                ["Firestore (reads/writes)", f"{fmt_money(risks['firestore'])} {currency}", f"{fmt_money(c30)} {currency}", "Aumenta com polling, loops de descoberta e fan-out de notificações."],
                ["BigQuery (analysis/storage)", f"{fmt_money(risks['bigquery'])} {currency}", f"{fmt_money(c30)} {currency}", "Consultas sem filtro/partição e scans amplos elevam custo rapidamente."],
                ["Artifact Registry / Storage", f"{fmt_money(risks['artifact_storage'])} {currency}", f"{fmt_money(c30)} {currency}", "Acúmulo de imagens e egress em pulls/deploys podem gerar crescimento gradual."],
            ],
        ))
        lines.append("")

    else:
        proxy = result.get("proxy", {})
        lines.append("## 3) Custo real e estimativa")
        lines.append("- Custo real: `indisponível (sem Billing Export no BigQuery)`")
        lines.append("- Estimativa: `PROXY baseada em inventário de recursos e métricas de uso`")
        lines.append("- Custo MTD líquido (cost + credits): `indisponível sem export`")
        lines.append("- Forecast do mês: `indisponível sem export`")
        lines.append("- Últimos 30 dias (rolling) e tendência: `indisponível sem export`")
        lines.append("")

        lines.append("### Inventário coletado")
        lines.append(f"- Cloud Run services: `{len(proxy.get('cloud_run_services', []))}`")
        lines.append(f"- Cloud Scheduler jobs: `{len(proxy.get('scheduler_jobs', []))}`")
        lines.append(f"- BigQuery datasets: `{len(proxy.get('bq_datasets', []))}`")
        lines.append(f"- BigQuery tables: `{len(proxy.get('bq_tables', []))}`")
        lines.append(f"- Cloud NATs detectados: `{len(proxy.get('nat', []))}`")
        lines.append(f"- Endereços reservados: `{len(proxy.get('addresses', []))}`")
        lines.append(f"- VPC connectors: `{len(proxy.get('vpc_connectors', []))}`")
        lines.append("")

        lines.append("### Métricas (30d, proxy de volume)")
        m = proxy.get("metrics", {})
        metric_table = []
        for k in [
            "cloud_run_requests",
            "cloud_run_container_instances",
            "cloud_run_container_cpu",
            "cloud_run_container_memory",
            "firestore_reads",
            "firestore_writes",
            "firestore_deletes",
        ]:
            row = m.get(k, {})
            metric_table.append([
                k,
                row.get("metric", "n/a"),
                row.get("total_30d") if row.get("total_30d") is not None else "n/d",
                row.get("points", 0),
            ])
        lines.append(md_table(["Sinal", "Métrica", "Volume 30d", "Pontos"], metric_table))
        lines.append("")

        if proxy.get("errors"):
            lines.append("### Diagnóstico da coleta (proxy)")
            for k, v in proxy.get("errors", {}).items():
                if v:
                    lines.append(f"- {k}: `{v}`")
            lines.append("")

        lines.append("## 4) Itens de risco (proxy)")
        lines.append("- NAT/egress/network: verificar NAT, IPs estáticos e tráfego externo (alto risco sem detalhamento de custo).")
        lines.append("- Cloud Run: requests e uso de CPU/RAM podem escalar custo em picos.")
        lines.append("- Firestore: writes/reads crescem com frequência de atualização e automações.")
        lines.append("- BigQuery: scans grandes e jobs ad-hoc sem partição elevam consumo.")
        lines.append("- Artifact/Storage: retenção de imagens e tráfego de download/pull gera custo cumulativo.")
        lines.append("")

        lines.append("## 5) Top 10 serviços por custo")
        lines.append("- `indisponível sem Billing Export`; usar `cost_by_service.csv` como proxy de inventário.")
        lines.append("")

    lines.append("## 6) Recomendações de controle (budget/alerts)")
    lines.append("- Criar budget no Billing Account para thresholds absolutos: `10 USD`, `30 USD`, `60 USD`.")
    lines.append("- Console (recomendado): Billing > Budgets & alerts > Create budget > Scope no projeto `botbit-489114`.")
    lines.append("- Habilitar alertas de anomalia (se disponível no Billing) para spikes de spend diário.")
    lines.append("- Checklist mensal: revisar Top serviços/SKUs, egress/NAT, Firestore write rate, queries BigQuery sem partição.")
    lines.append("")

    lines.append("## 7) Execução e validação")
    lines.append("- Script executado sem prompts interativos: `bash tools/cost_audit.sh`.")
    lines.append("- Artefatos gerados em `reports/`: `gcp_cost_report.md`, `cost_by_day.csv`, `cost_by_service.csv`, `cost_by_sku_top50.csv`.")

    return "\n".join(lines)


def save_real_csvs(result):
    write_csv(
        REPORTS_DIR / "cost_by_day.csv",
        ["day", "net_cost"],
        [[r.get("day"), r.get("net_cost")] for r in result.get("day_rows", [])],
    )
    write_csv(
        REPORTS_DIR / "cost_by_service.csv",
        ["service", "net_cost_mtd", "net_cost_30d"],
        [
            [r.get("service"), r.get("net_cost_mtd"), r.get("net_cost_30d")]
            for r in result.get("service_rows", [])
        ],
    )
    write_csv(
        REPORTS_DIR / "cost_by_sku_top50.csv",
        ["service", "sku", "net_cost_mtd"],
        [
            [r.get("service"), r.get("sku"), r.get("net_cost_mtd")]
            for r in result.get("sku_rows", [])
        ],
    )


def save_proxy_csvs(proxy):
    m = proxy.get("metrics", {})
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()

    day_rows = []
    for key in [
        "cloud_run_requests",
        "cloud_run_container_instances",
        "cloud_run_container_cpu",
        "cloud_run_container_memory",
        "firestore_reads",
        "firestore_writes",
        "firestore_deletes",
    ]:
        row = m.get(key, {})
        day_rows.append([today, key, row.get("total_30d"), "proxy_volume_30d"])

    write_csv(
        REPORTS_DIR / "cost_by_day.csv",
        ["day", "signal", "value", "mode"],
        day_rows,
    )

    run_cpu = m.get("cloud_run_container_cpu", {}).get("total_30d")
    run_mem = m.get("cloud_run_container_memory", {}).get("total_30d")
    run_req = m.get("cloud_run_requests", {}).get("total_30d")
    fs_reads = m.get("firestore_reads", {}).get("total_30d")
    fs_writes = m.get("firestore_writes", {}).get("total_30d")
    fs_deletes = m.get("firestore_deletes", {}).get("total_30d")

    svc_rows = [
        ["Cloud Run", len(proxy.get("cloud_run_services", [])), "inventory_count"],
        ["Cloud Scheduler", len(proxy.get("scheduler_jobs", [])), "inventory_count"],
        ["BigQuery Datasets", len(proxy.get("bq_datasets", [])), "inventory_count"],
        ["BigQuery Tables", len(proxy.get("bq_tables", [])), "inventory_count"],
        ["Cloud NAT", len(proxy.get("nat", [])), "inventory_count"],
        ["Reserved IPs", len(proxy.get("addresses", [])), "inventory_count"],
        ["Serverless VPC Access", len(proxy.get("vpc_connectors", [])), "inventory_count"],
        ["Cloud Run Requests (30d)", run_req, "metric_total_30d"],
        ["Cloud Run CPU Utilization Sum (30d)", run_cpu, "metric_total_30d"],
        ["Cloud Run Memory Utilization Sum (30d)", run_mem, "metric_total_30d"],
        ["Firestore Reads (30d)", fs_reads, "metric_total_30d"],
        ["Firestore Writes (30d)", fs_writes, "metric_total_30d"],
        ["Firestore Deletes (30d)", fs_deletes, "metric_total_30d"],
    ]

    for svc in proxy.get("cloud_run_summary", []):
        name = svc.get("name") or "cloud-run-service"
        svc_rows.append([f"{name} max instances", svc.get("max_instances"), "cloud_run_config"])
        svc_rows.append([f"{name} min instances", svc.get("min_instances"), "cloud_run_config"])
        svc_rows.append([f"{name} concurrency", svc.get("concurrency"), "cloud_run_config"])
        svc_rows.append([f"{name} cpu", svc.get("cpu"), "cloud_run_config"])
        svc_rows.append([f"{name} memory", svc.get("memory"), "cloud_run_config"])

    write_csv(
        REPORTS_DIR / "cost_by_service.csv",
        ["service", "value", "mode"],
        svc_rows,
    )

    sku_rows = []
    for key in [
        "cloud_run_requests",
        "cloud_run_container_instances",
        "cloud_run_container_cpu",
        "cloud_run_container_memory",
        "firestore_reads",
        "firestore_writes",
        "firestore_deletes",
    ]:
        row = m.get(key, {})
        sku_rows.append(["proxy_metric", row.get("metric"), row.get("total_30d")])

    write_csv(
        REPORTS_DIR / "cost_by_sku_top50.csv",
        ["service", "sku", "value"],
        sku_rows,
    )


def main():
    parser = argparse.ArgumentParser(description="GCP cost audit for botbit")
    parser.add_argument("--project-id", default=PROJECT_ID_DEFAULT)
    parser.add_argument("--timezone", default=TIMEZONE_DEFAULT)
    args = parser.parse_args()

    ensure_dirs()

    billing_info = detect_billing(args.project_id)
    export_info = detect_billing_export(args.project_id)

    result = {
        "mode": "proxy",
        "net_cost_mtd": None,
        "forecast": None,
        "latest_usage_start_time": None,
    }

    found = export_info.get("found") if export_info else None

    if billing_info.get("billingEnabled") and found:
        real = query_real_cost(args.project_id, found["dataset"], found["table"])
        if real.get("ok"):
            trend = compute_trend(real.get("day_rows", []))
            result = {
                "mode": "real",
                **real,
                "trend": trend,
            }
            save_real_csvs(result)
        else:
            proxy = detect_proxy_inventory(args.project_id)
            result = {
                "mode": "proxy",
                "proxy": proxy,
                "errors": real.get("errors"),
            }
            save_proxy_csvs(proxy)
    else:
        proxy = detect_proxy_inventory(args.project_id)
        result = {
            "mode": "proxy",
            "proxy": proxy,
        }
        save_proxy_csvs(proxy)

    report = build_report(args.project_id, args.timezone, billing_info, export_info, result)
    (REPORTS_DIR / "gcp_cost_report.md").write_text(report, encoding="utf-8")

    summary = {
        "billingEnabled": billing_info.get("billingEnabled"),
        "billingAccountName": billing_info.get("billingAccountName"),
        "billingExportTable": (
            f"{found['dataset']}.{found['table']}" if found else None
        ),
        "mode": result.get("mode"),
        "net_cost_mtd": result.get("net_cost_mtd"),
        "forecast": result.get("forecast"),
        "currency": result.get("currency"),
        "latest_usage_start_time": result.get("latest_usage_start_time"),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
