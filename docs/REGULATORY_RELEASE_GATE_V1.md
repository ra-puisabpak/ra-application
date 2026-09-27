# Product Regulatory Release Gate v1

## Purpose
Provide a controlled pre-release gate before a product is released for commercial production.

## Required alignment
Product release checks the approved/current revisions of Formula, Process, and Product Specification; effective Label; approved Artwork; approved regulatory registration; resolved Change Control; data integrity; verified approval evidence; and required training.

## Blocking principle
A single blocking condition prevents READY_FOR_RELEASE. The gate reports structured blockers rather than silently bypassing missing controls.

## Traceability
Product → Formula → Process → HACCP → Specification → Label → FDA Registration → Approved Artwork → Change Control → Training → Release Decision → Audit Evidence.

## Boundary
This gate is a workflow control. It does not itself determine legal approval requirements or guarantee authority acceptance; those decisions remain supported by the Regulatory Source Register and applicable evidence.
