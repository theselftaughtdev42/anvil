"""Outputs: generating a Complete Requirement's write-up in an Output format."""

from idea_refiner import RefinementAgent, render_gherkin
from sqlmodel import Session, col, select

from anvil.models import Output, OutputFormat, Requirement
from anvil.refinement import agent_inputs, database_now


def outputs(session: Session, requirement: Requirement) -> list[Output]:
    query = (
        select(Output)
        .where(Output.requirement_id == requirement.id)
        .order_by(col(Output.format))
    )
    return list(session.exec(query))


def generate_gherkin(
    session: Session, requirement: Requirement, agent: RefinementAgent
) -> Output:
    """Asks the agent for a Feature and stores it rendered, replacing any Gherkin
    Output the Requirement had. The caller locks the Requirement first, so two
    requests can't both insert, and commits.
    """
    inputs = agent_inputs(session, requirement)
    feature = agent.write_gherkin(
        inputs.subject, inputs.asked, inputs.context, inputs.feedback
    )
    content = render_gherkin(feature)
    now = database_now(session)
    output = session.exec(
        select(Output).where(
            Output.requirement_id == requirement.id,
            Output.format == OutputFormat.GHERKIN,
        )
    ).first()
    if output is None:
        output = Output(
            requirement_id=requirement.id,
            format=OutputFormat.GHERKIN,
            content=content,
            generated_at=now,
        )
        session.add(output)
    else:
        output.content = content
        output.generated_at = now
    return output
