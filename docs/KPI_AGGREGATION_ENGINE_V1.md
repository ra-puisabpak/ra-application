# KPI Aggregation Engine v1

## Purpose
Calculate Regulatory Affairs KPIs from controlled record aggregates rather than manually entered dashboard values.

## Included KPIs
- Registration On-Time Rate
- Registration Average Cycle Time
- Registration Resubmission Count
- Label Compliance Rate
- Regulatory Action Overdue
- Approved Product Compliance Rate

## Calculation rule
Each KPI retains its period, unit, numerator/denominator where applicable, and source record count.

## Targets
The engine intentionally does not define target values. Targets must come from an approved KPI baseline, management decision, customer requirement, regulatory requirement, or another controlled source. If no target exists, the dashboard should show the calculated actual value without inventing a target.

## Traceability
The aggregation layer should be fed by the database/service layer from controlled records and preserve the period and source-record scope used for each snapshot.
