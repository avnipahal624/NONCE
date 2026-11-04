import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

/**
 * Single reactive source for vault, protection and monitoring state. Convex
 * pushes updates, so screens never poll endpoint-by-endpoint.
 */
export function useWorkspace() {
  const workspace = useQuery(api.nonce.vaults.workspace);
  return {
    workspace,
    isLoading: workspace === undefined,
    hasVault: Boolean(workspace?.vault),
  };
}
