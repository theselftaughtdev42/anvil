import { QueryClient } from '@tanstack/react-query'

// The app's only QueryClient: every query shares its cache.
export const queryClient = new QueryClient()
