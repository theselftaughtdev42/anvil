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
Something a Point of Contact needs, which Anvil helps them make clear and complete. It starts from their idea: the original wording they submitted. Each Requirement belongs to one Project, chosen before Refinement starts and fixed once its first Question is answered.
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

**Looks ready**:
What Anvil suggests about a Requirement once it has no more Questions to ask: that it's clear enough to act on. The Point of Contact decides, by confirming it Complete.
_Avoid_: Done, finished

**Reopen note**:
What a Point of Contact says is missing when they reopen a Complete Requirement, moving it back to In progress. Anvil asks new Questions about it, and keeps every Reopen note for the Questions it asks later.
_Avoid_: Reason, feedback, comment

### Project

**Project**:
The undertaking that Requirements are gathered for, such as a product, a system or an opportunity. Anvil holds many Projects; each has one Project Owner and one Project Context.
_Avoid_: Workspace, product, organisation, context (on its own)

**Project Owner**:
The User responsible for a Project, who creates it and writes its Project Context.
_Avoid_: Admin

**Project Context**:
Background about a Project, written by its Project Owner, that Anvil takes into account whenever it refines one of the Project's Requirements.
_Avoid_: Context file, background, system prompt
