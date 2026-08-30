# GVault Public Scout · Agent IA RX/TX — TEST RESULT 2026-08-30

Status: **PASS FOR PUBLIC RX/TX + BOUNDED WRITER CONTRACT · EXPERIMENTAL ONLY · NOT PROMOTED**

## Proven on GitHub Actions

### Agent bridge run `33286003516`
All steps PASS:
- static trust-boundary checks;
- RX/TX regression: **6/6 PASS**;
- bounded SAS private writer regression: **13 assertions PASS**;
- exact-commit receive tamper regression: **8 assertions PASS**.

Total focused assertions: **27 PASS**.

### Public agent egress run `33285670228`
All steps PASS:
- sealed packet validation;
- public message build;
- exact message commit;
- ACK bound to exact commit;
- safe moved-HEAD reconciliation;
- public secret-pattern guard.

Proven public message:
- packetId: `AIPUB-58b5f4f461a6fe5eec5e`
- payload SHA-256: `58b5f4f461a6fe5eec5eeff224ab1bf115430d8db2ae5fccc8afc9978f81b2a1`
- public message SHA-256: `30a8b5d3056608c970a2627a9eaf96959814c7f08140704bca30da17bd52ae9b`
- exact data commit: `76e9de8124cfc053ca1af87d70589f2b027adfc7`
- ACK digest: `e78d2e7fcbd02e876e8cfbc0ab66abe11e30a002bb077e85a885410941d438ff`
- raw private data published: **false**.

## Agent receive path

`verified Public Scout state / verified public AI message -> SHA-256 -> exact public ACK -> exact data commit -> GVAULT_AI_PUBLIC_BRIDGE_V1 inbox`

Unverified state, bad ACK, message tampering, wrong ACK binding, or `rawPrivateDataPublished=true` are rejected.

## Agent produce path

`agent produce() -> PUBLIC_ONLY seal -> secret/size guard -> SHA-256 -> bounded SAS writer -> immutable private pending packet -> private current pointer -> private relay -> public outbound request -> Violet public message -> exact commit -> Red ACK -> receive observer`

If the trusted writer is closed or fails, `produce()` preserves the sealed packet in the local bounded outbox instead of dropping it.

The browser SAS writer is constrained to:
- `ops/public-scout/agent-outbox/pending/<packetId>.json`
- `ops/public-scout/agent-outbox/current.json`

It has no generic GitHub write API exposed to the agent.

## Private relay status

A private test packet is currently queued:
- packetId: `AIPUB-9ddf72d171c77d6d6ec3`
- payload SHA-256: `9ddf72d171c77d6d6ec3ec62d047003fc2cf8d0b89ef305fa1d5a34e53d55daf`

At the time of this report, the public outbound-request pointer still contains the previous `AIPUB-58b5...` packet. Therefore the private -> public relay is **PENDING / NOT YET PROVEN**. The private packet remains preserved; no success is claimed and no pending evidence is deleted.

## Promotion

No change in this experiment is promoted to `main`.
