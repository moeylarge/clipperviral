# Ops Domain Model v1

This document defines the source-of-truth records and calculation rules for the local-first ops system.

## Principles

- No stored snapshot balances.
- Cash balance comes only from posted cash wallet entries.
- Credit balance comes only from posted credit wallet entries.
- Weekly net comes only from posted ticket settlement cash PnL in the weekly window.
- Payout due comes only from posted period statements minus posted receipts linked to the same statement.
- Duplicate, pending, void, and disputed wallet entries are never treated as authoritative balances.

## Source-of-Truth Entities

### operators
- Purpose: stable operator identity for account ownership and payout period schedules.
- Authoritative: yes.

### accounts
- Purpose: stable account identity.
- Authoritative: yes.
- Balance fields are not stored here.

### wallet_entries
- Purpose: append-only ledger for cash and credit movements.
- Authoritative: yes.
- Deposits, withdrawals, opening balances, payouts, credits, and manual adjustments all live here.

### market_events
- Purpose: event anchor for tickets.
- Authoritative: yes.

### tickets
- Purpose: accepted wagering actions.
- Authoritative: yes for stake and ticket state.

### ticket_settlements
- Purpose: append-only settlement outcomes for tickets.
- Authoritative: yes for realized ticket PnL.

### payout_periods
- Purpose: operator payout windows and due timestamps.
- Authoritative: yes for schedule.

### period_statements
- Purpose: expected payout obligations for one account in one payout period.
- Authoritative: yes for payout due.

### reconciliation_runs
- Purpose: record that a period was reviewed.
- Authoritative: yes for review occurrence and final run status.

### reconciliation_issues
- Purpose: concrete exceptions found during reconciliation.
- Authoritative: yes for why a period is blocked, disputed, or in attention state.

### tasks
- Purpose: follow-up work linked to issues, notes, or payout periods.
- Authoritative: yes for work tracking only.

### account_notes
- Purpose: chat or internal notes that matter for collections or account state.
- Authoritative: yes for communication trail, but not for balances.

### audit_events
- Purpose: immutable audit log of status changes and operator-facing actions.
- Authoritative: yes for who changed what and when.
