# Rykas Amazon Truth Refresh V1

Status: Shipped

RyanOS automatically queues `RYKAS_AMAZON_TRUTH_REFRESH` when a completed Rykas `FINANCIAL_SNAPSHOT` contains a non-current `AMAZON_SALES_INVENTORY` checklist row. It does not create a NEED RYAN decision for ordinary staleness.

The request is exactly:

```json
{"version":1,"operation":"AMAZON_TRUTH_REFRESH"}
```

The registered Windows runner accepts no command, script path, SQL, URL, report name, or credential from RyanOS. It maps the request to `tools/command_center/Invoke-AmazonTruthRefresh.ps1` inside the fixed `rykas-repo` workspace. Amazon, AWS, and SQL credentials stay on the workstation; RyanOS receives only status, safe freshness dates, failure category, and negative side-effect assertions.

Successful completion queues a new `FINANCIAL_SNAPSHOT` read and schedules RYKAS_GM reevaluation. A current result has a four-hour orchestration cooldown. Failures retry after deterministic 30-minute exponential backoff capped at four hours. An already-running local refresh retries after 15 minutes. Terminal failure shows “Amazon connection needs attention” without exposing raw logs on the Agent HQ card.

## Activation

In Railway / Command Center:

```text
FEATURE_RYKAS_TRUTH_READ=true
FEATURE_RYKAS_AMAZON_TRUTH_REFRESH=true
```

In the Windows runner environment:

```text
FEATURE_RYKAS_TRUTH_READ=true
FEATURE_RYKAS_AMAZON_TRUTH_REFRESH=true
RYKAS_AMAZON_REFRESH_TIMEOUT_MS=1800000
```

Add `RYKAS_AMAZON_TRUTH_REFRESH` to the fixed `rykas-repo` capabilities in the private workspace registry, restart the Command Center deployment, and restart the outbound runner. No marketplace or database credential belongs in Railway.
