# Anvil

Anvil refines requirements for organisations: a person describes what they want, and Anvil helps turn it into a clear, complete requirement.

## Language

**User**:
A person who uses Anvil.
_Avoid_: Member, account

**Point of Contact**:
The User responsible for a Requirement: the one who submitted its idea and who answers its refinement questions.
_Avoid_: Owner, current user

**Requirement**:
Something a Point of Contact needs, which Anvil helps them make clear and complete. It starts from their idea: the original wording they submitted.
_Avoid_: Ticket, request, story

### Status

**Draft**:
A Requirement whose Point of Contact hasn't answered any refinement questions yet.
_Avoid_: New, not started

**In progress**:
A Requirement with at least one refinement question answered that isn't Complete, including a Complete one its Point of Contact has reopened.
_Avoid_: Active, open, in refinement

**Complete**:
A Requirement whose Point of Contact has confirmed it's clear enough to act on, after Anvil suggested it was.
_Avoid_: Done, finished, approved

### Refinement

**Refinement**:
The back-and-forth in which Anvil asks a Point of Contact Questions about a Requirement until it's clear enough to act on.
_Avoid_: Q&A, interview

**Question**:
One thing Anvil asks about a Requirement during Refinement. Anvil can add Questions at any point, so the total for a Requirement can grow.
_Avoid_: Prompt

**Answer**:
The Point of Contact's reply to a Question.
_Avoid_: Response

**Dismissed**:
A Question set aside without an Answer, with the reason recorded, usually because something learned since has made it unnecessary.
_Avoid_: Closed, skipped, removed

### Project

**Project**:
The undertaking that Requirements are gathered for. Everything in Anvil belongs to a single Project (for now, future iterations may need to handle multiple projects).
_Avoid_: Workspace, product, organisation

**Project Owner**:
The person responsible for a Project, who provides its Project Context.
_Avoid_: Admin

**Project Context**:
Background about a Project, provided by its Project Owner, that Anvil takes into account whenever it helps refine a Requirement.
_Avoid_: Context file, background, system prompt
