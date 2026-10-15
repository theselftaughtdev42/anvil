import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/button'

// Placeholder until the refinement screen replaces it
export function RequirementPage() {
  const { id } = useParams()
  return (
    <>
      <h1 className="mt-8 text-page-heading">Requirement</h1>
      <p className="mt-2 text-body text-muted-foreground">{id}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Back home</Link>
      </Button>
    </>
  )
}
